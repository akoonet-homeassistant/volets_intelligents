"""Capteurs Freebox PVR."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .api import ChannelNotFound, find_channel, parse_aliases
from .const import (
    ACTIVE_STATES,
    FINISHED_LIMIT,
    UPCOMING_STATES,
    CONF_CHANNEL_ALIASES,
    CONF_MARGIN_AFTER,
    CONF_MARGIN_BEFORE,
    DEFAULT_MARGIN_AFTER,
    DEFAULT_MARGIN_BEFORE,
    GUIDE_DOMAIN,
)
from .entity import FreeboxPvrEntity, record_to_attr


def _upcoming(records: list[dict[str, Any]], with_paused: bool = False) -> list[dict[str, Any]]:
    states = UPCOMING_STATES if with_paused else ACTIVE_STATES
    now = int(dt_util.utcnow().timestamp())
    return [r for r in records if r.get("state") in states and (r.get("state") != "disabled" or r.get("end", 0) > now)]


async def async_setup_entry(hass: HomeAssistant, entry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    coordinator = entry.runtime_data
    async_add_entities(
        [
            ScheduledRecordsSensor(coordinator, "scheduled_records"),
            NextRecordSensor(coordinator, "next_record"),
            FinishedRecordsSensor(coordinator, "finished_records"),
        ]
    )


class ScheduledRecordsSensor(FreeboxPvrEntity, SensorEntity):
    """Nombre d'enregistrements à venir ou en cours, avec leur liste."""

    _attr_icon = "mdi:record-rec"
    _attr_native_unit_of_measurement = None
    # Listes potentiellement longues : pas d'historique dans la base (recorder)
    _unrecorded_attributes = frozenset({"records", "repeats", "failed", "guide_channels", "margins"})

    @property
    def native_value(self) -> int:
        return len(_upcoming(self.coordinator.data.records))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        records = self.coordinator.data.records
        repeats = self.coordinator.repeats

        def _attr(rec: dict[str, Any]) -> dict[str, Any]:
            data = record_to_attr(rec)
            rule = repeats.rule_for_record(rec.get("id"))
            data["repeat_id"] = rule["id"] if rule else None
            return data

        return {
            "records": [_attr(r) for r in _upcoming(records, with_paused=True)],
            "paused": sum(1 for r in _upcoming(records, with_paused=True) if r.get("state") == "disabled"),
            "repeats": [
                {
                    "id": rule["id"],
                    "title": rule["title"],
                    "channel_name": rule["channel_name"],
                    "channel_uuid": rule["channel_uuid"],
                    "weekday": rule["weekday"],
                    "time": rule["time"],
                    "duration": rule["duration"],
                    "next_start_ts": repeats.next_occurrence(rule),
                    "paused": bool(rule.get("paused")),
                }
                for rule in repeats.rules
            ],
            "conflicts": sum(1 for r in _upcoming(records) if r.get("conflict")),
            "failed": [record_to_attr(r) for r in records if r.get("state") in {"failed", "start_error", "running_error"}][-5:],
            "guide_channels": self._guide_channels(),
            # Marges par défaut (options de l'intégration), proposées dans la fiche d'enregistrement
            "margins": {
                "before": int(self.coordinator.config_entry.options.get(CONF_MARGIN_BEFORE, DEFAULT_MARGIN_BEFORE)),
                "after": int(self.coordinator.config_entry.options.get(CONF_MARGIN_AFTER, DEFAULT_MARGIN_AFTER)),
            },
        }

    def _guide_channels(self) -> dict[str, str | None]:
        """Chaîne du guide Programme TNT FR → identifiant Freebox (utilisé par la carte)."""
        channels = self.coordinator.data.channels
        aliases = parse_aliases(self.coordinator.config_entry.options.get(CONF_CHANNEL_ALIASES))
        result: dict[str, str | None] = {}
        registry = er.async_get(self.hass)
        for entry in registry.entities.values():
            if entry.platform != GUIDE_DOMAIN or entry.domain != "sensor":
                continue
            state = self.hass.states.get(entry.entity_id)
            name = state.attributes.get("channel_name") if state else None
            if not name or name in result:
                continue
            try:
                result[name] = find_channel(channels, name, aliases)["uuid"]
            except ChannelNotFound:
                result[name] = None
        return result


class NextRecordSensor(FreeboxPvrEntity, SensorEntity):
    """Heure de début du prochain enregistrement."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_icon = "mdi:calendar-clock"

    def _next(self) -> dict[str, Any] | None:
        upcoming = [r for r in self.coordinator.data.records if r.get("state") == "waiting_start_time"]
        return upcoming[0] if upcoming else None

    @property
    def native_value(self) -> datetime | None:
        rec = self._next()
        return dt_util.utc_from_timestamp(rec["start"]) if rec and rec.get("start") else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        rec = self._next()
        return record_to_attr(rec) if rec else {}


class FinishedRecordsSensor(FreeboxPvrEntity, SensorEntity):
    """Enregistrements terminés sur le disque de la Freebox (les plus récents en attribut)."""

    _attr_icon = "mdi:filmstrip-box-multiple"
    _unrecorded_attributes = frozenset({"recordings", "total_size"})

    @property
    def native_value(self) -> int:
        return len(self.coordinator.data.finished)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        finished = self.coordinator.data.finished
        items = []
        for rec in finished[:FINISHED_LIMIT]:
            data = record_to_attr(rec)
            data["duration"] = rec.get("duration") or (
                (rec.get("end", 0) - rec.get("start", 0)) if rec.get("end") and rec.get("start") else None
            )
            data["byte_size"] = rec.get("byte_size")
            items.append(data)
        return {
            "recordings": items,
            "total_size": sum(int(r.get("byte_size") or 0) for r in finished),
        }
