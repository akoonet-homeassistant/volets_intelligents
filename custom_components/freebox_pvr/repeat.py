"""Répétition hebdomadaire des enregistrements.

L'API Freebox a des « générateurs » d'enregistrements, mais leur format n'est pas
documenté : la répétition est donc gérée ici. Chaque règle = une chaîne, un jour de
la semaine, une heure de début locale et une durée. Toutes les heures, les
occurrences des 8 prochains jours sont programmées sur la Freebox si besoin.
Une occurrence déjà traitée (programmée, ou annulée ensuite par l'utilisateur)
n'est jamais recréée.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import logging
from typing import Any
import uuid as uuidlib

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .api import FreeboxPvrError, RecordRequest, find_record_for_program, normalize_channel
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

HORIZON = timedelta(days=8)
DONE_RETENTION = 60 * 60 * 24 * 30  # 30 jours


def compute_end(start: datetime, end_time: Any) -> datetime:
    """Fin à l'heure donnée, le jour même ou le lendemain si elle est avant (ou égale à) l'heure de début.

    Ex. début 23:30, fin « 00:45 » → lendemain 00:45. L'heure est interprétée dans
    le fuseau de Home Assistant (changement d'heure compris).
    """
    local = dt_util.as_local(start)
    end = local.replace(hour=end_time.hour, minute=end_time.minute, second=0, microsecond=0)
    if end <= local:
        end = (local + timedelta(days=1)).replace(hour=end_time.hour, minute=end_time.minute, second=0, microsecond=0)
    return end


def occurrences(rule: dict[str, Any], now: datetime, horizon: timedelta = HORIZON) -> list[tuple[int, int]]:
    """Occurrences (début, fin) en timestamp, sans les marges, de maintenant à now + horizon."""
    tz = dt_util.get_default_time_zone()
    hour, minute = (int(x) for x in rule["time"].split(":"))
    local_now = now.astimezone(tz)
    day = local_now.date() - timedelta(days=1)  # la veille : couvre une occurrence encore en cours
    result: list[tuple[int, int]] = []
    while True:
        if day.weekday() == rule["weekday"]:
            start = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
            end = start + timedelta(minutes=rule["duration"])
            if start > local_now + horizon:
                break
            if end > local_now:
                result.append((int(start.timestamp()), int(end.timestamp())))
        if datetime(day.year, day.month, day.day, tzinfo=tz) > local_now + horizon:
            break
        day += timedelta(days=1)
    return result


class RepeatManager:
    """Règles de répétition d'une Freebox, stockées dans .storage."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, 1, f"{DOMAIN}.{entry_id}.repeats")
        self.rules: list[dict[str, Any]] = []

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.rules = data.get("rules", [])

    async def async_save(self) -> None:
        await self._store.async_save({"rules": self.rules})

    def find(self, channel_uuid: str, weekday: int, time: str) -> dict[str, Any] | None:
        return next(
            (r for r in self.rules if r["channel_uuid"] == channel_uuid and r["weekday"] == weekday and r["time"] == time),
            None,
        )

    def rule_for_record(self, record_id: Any) -> dict[str, Any] | None:
        return next((r for r in self.rules if record_id in r.get("record_ids", [])), None)

    async def async_add(
        self,
        *,
        channel_uuid: str,
        channel_name: str,
        title: str,
        subtitle: str | None,
        start: int,
        end: int,
        margin_before: int,
        margin_after: int,
        quality: str,
        first_record_id: Any = None,
    ) -> dict[str, Any]:
        local = dt_util.as_local(dt_util.utc_from_timestamp(start))
        weekday, time = local.weekday(), local.strftime("%H:%M")
        rule = self.find(channel_uuid, weekday, time)
        if rule is None:
            rule = {
                "id": uuidlib.uuid4().hex[:8],
                "channel_uuid": channel_uuid,
                "channel_name": channel_name,
                "title": title,
                # Le sous-titre est celui d'un épisode : on ne le recopie pas sur les semaines suivantes
                "subtitle": None,
                "weekday": weekday,
                "time": time,
                "duration": max(1, round((end - start) / 60)),
                "margin_before": int(margin_before),
                "margin_after": int(margin_after),
                "quality": quality,
                "done": [],
                "record_ids": [],
            }
            self.rules.append(rule)
        if start not in rule["done"]:
            rule["done"].append(start)
        if first_record_id is not None and first_record_id not in rule["record_ids"]:
            rule["record_ids"].append(first_record_id)
        if first_record_id is not None:
            rule.setdefault("occ_records", {})[str(start)] = first_record_id
        await self.async_save()
        return rule

    async def async_remove(self, rule_id: str) -> dict[str, Any] | None:
        rule = next((r for r in self.rules if r["id"] == rule_id), None)
        if rule is not None:
            self.rules.remove(rule)
            await self.async_save()
        return rule

    async def async_ensure(self, client, records: list[dict[str, Any]]) -> bool:
        """Programme les occurrences manquantes. Renvoie True si quelque chose a été créé."""
        now = dt_util.utcnow()
        created = changed = False
        for rule in self.rules:
            if rule.get("paused"):
                continue  # répétition en pause : aucun nouvel épisode n'est programmé
            for start, end in occurrences(rule, now):
                if start in rule["done"]:
                    continue
                existing = find_record_for_program(records, rule["channel_uuid"], start, end)
                if existing is None:
                    request = RecordRequest(
                        channel_uuid=rule["channel_uuid"],
                        channel_name=rule["channel_name"],
                        title=rule["title"],
                        subtitle=rule.get("subtitle"),
                        start=start,
                        end=end,
                        margin_before=rule["margin_before"],
                        margin_after=rule["margin_after"],
                        quality=rule["quality"],
                    )
                    if start - request.margin_before * 60 < int(now.timestamp()) + 30:
                        continue  # trop tard pour cette occurrence : on n'enregistre pas un bout de programme
                    try:
                        existing = await client.create_record(request)
                        created = True
                    except FreeboxPvrError as err:
                        _LOGGER.warning("Répétition « %s » : création impossible (%s)", rule["title"], err)
                        continue
                rule["done"].append(start)
                if existing.get("id") is not None and existing["id"] not in rule["record_ids"]:
                    rule["record_ids"].append(existing["id"])
                if existing.get("id") is not None:
                    rule.setdefault("occ_records", {})[str(start)] = existing["id"]
                changed = True
            limit = int(now.timestamp()) - DONE_RETENTION
            for key in ("notified", "checked"):
                kept = [s for s in rule.get(key, []) if s >= limit]
                if len(kept) != len(rule.get(key, [])):
                    rule[key], changed = kept, True
            occ = {k: v for k, v in rule.get("occ_records", {}).items() if int(k) >= limit}
            if len(occ) != len(rule.get("occ_records", {})):
                rule["occ_records"], changed = occ, True
            pruned = [s for s in rule["done"] if s >= limit]
            if len(pruned) != len(rule["done"]):
                rule["done"], changed = pruned, True
            if len(rule["record_ids"]) > 20:
                rule["record_ids"], changed = rule["record_ids"][-20:], True
        if changed:
            await self.async_save()
        return created

    def get(self, rule_id: str) -> dict[str, Any] | None:
        return next((r for r in self.rules if r["id"] == rule_id), None)

    async def async_set_paused(self, rule_id: str, paused: bool) -> dict[str, Any] | None:
        rule = self.get(rule_id)
        if rule is not None:
            # À la reprise, les épisodes des 8 prochains jours sont programmés à la mise à jour suivante
            rule["paused"] = bool(paused)
            await self.async_save()
        return rule

    def next_occurrence(self, rule: dict[str, Any]) -> int | None:
        occ = occurrences(rule, dt_util.utcnow(), timedelta(days=8))
        return occ[0][0] if occ else None


def same_title(a: str | None, b: str | None) -> bool:
    """Même programme : titres identiques une fois normalisés, ou l'un commence par l'autre
    (ex. « Les Gardiens du Phare » / « Les Gardiens du Phare : épisode spécial »)."""
    na, nb = normalize_channel(a), normalize_channel(b)
    if not na or not nb:
        return False
    return na == nb or na.startswith(nb) or nb.startswith(na)


def match_guide_program(
    programs: list[dict[str, Any]], occ_start: int, occ_end: int
) -> dict[str, Any] | None:
    """Programme du guide diffusé sur le créneau : début à ±90 min et recouvrement maximal."""
    best, best_overlap = None, 0
    for prog in programs:
        start = _ts(prog.get("start"))
        end = _ts(prog.get("stop") or prog.get("end"))
        if start is None or end is None or abs(start - occ_start) > 90 * 60:
            continue
        overlap = min(end, occ_end) - max(start, occ_start)
        if overlap > best_overlap:
            best, best_overlap = {**prog, "_start": start, "_end": end}, overlap
    return best


def _ts(value: Any) -> int | None:
    if not value:
        return None
    parsed = dt_util.parse_datetime(str(value))
    return int(parsed.timestamp()) if parsed else None
