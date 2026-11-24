"""Vérification des répétitions avec le guide Programme TNT FR, le jour de la diffusion.

Pour chaque enregistrement répété des prochaines 24 h encore en attente :
- même titre dans le guide : sous-titre de l'épisode et horaire (si l'émission est
  décalée) mis à jour sur la Freebox ;
- titre différent : notification (Home Assistant + téléphones choisis dans les options)
  avec « Annuler cet enregistrement » / « Garder ». Sans réponse, l'enregistrement est gardé.
"""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import TYPE_CHECKING, Any

from homeassistant.components import persistent_notification
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .api import ChannelNotFound, FreeboxPvrError, find_channel, parse_aliases
from .const import CONF_CHANNEL_ALIASES, CONF_NOTIFY, DOMAIN, GUIDE_DOMAIN, SLOTS
from .repeat import match_guide_program, occurrences, same_title

if TYPE_CHECKING:
    from .coordinator import FreeboxPvrCoordinator

_LOGGER = logging.getLogger(__name__)

ACTION_CANCEL = "FREEBOX_PVR_CANCEL_"
ACTION_KEEP = "FREEBOX_PVR_KEEP_"

TEXTS = {
    "fr": {
        "title": "Freebox PVR : programme différent",
        "message": "Répétition « {rule} » sur {channel} : {day} à {time}, le guide annonce « {prog} ». "
        "L'enregistrement est maintenu, sauf si vous l'annulez (bouton de la notification, fiche du programme "
        "ou onglet Enregistrements de la carte Freebox PVR).",
        "cancel": "Annuler cet enregistrement",
        "keep": "Garder",
        "days": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    },
    "en": {
        "title": "Freebox PVR: different program",
        "message": "Repeat “{rule}” on {channel}: on {day} at {time}, the guide lists “{prog}”. "
        "The recording is kept unless you cancel it (notification button, program sheet or Recordings tab "
        "of the Freebox PVR card).",
        "cancel": "Cancel this recording",
        "keep": "Keep",
        "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    },
}


def notification_id(rule_id: str, occ_start: int) -> str:
    return f"{DOMAIN}_{rule_id}_{occ_start}"


def guide_programs(hass: HomeAssistant, coordinator: FreeboxPvrCoordinator) -> dict[str, list[dict[str, Any]]]:
    """Programmes du guide (créneaux des capteurs Programme TNT FR), par identifiant de chaîne Freebox."""
    channels = coordinator.data.channels if coordinator.data else {}
    aliases = parse_aliases(coordinator.config_entry.options.get(CONF_CHANNEL_ALIASES))
    result: dict[str, list[dict[str, Any]]] = {}
    for entry in er.async_get(hass).entities.values():
        if entry.platform != GUIDE_DOMAIN or entry.domain != "sensor":
            continue
        state = hass.states.get(entry.entity_id)
        if state is None or not state.attributes.get("channel_name"):
            continue
        try:
            uuid = find_channel(channels, state.attributes["channel_name"], aliases)["uuid"]
        except ChannelNotFound:
            continue
        for slot in SLOTS:
            prog = state.attributes.get(slot)
            if isinstance(prog, dict) and prog.get("start"):
                result.setdefault(uuid, []).append(prog)
    return result


async def async_check_guide(hass: HomeAssistant, coordinator: FreeboxPvrCoordinator, records: list[dict[str, Any]]) -> bool:
    """Renvoie True si un enregistrement a été modifié sur la Freebox."""
    repeats = coordinator.repeats
    if not repeats.rules:
        return False
    programs = guide_programs(hass, coordinator)
    if not programs:
        return False
    now = dt_util.utcnow()
    now_ts = int(now.timestamp())
    by_id = {r.get("id"): r for r in records}
    modified = save = False
    for rule in repeats.rules:
        if rule.get("paused"):
            continue
        for occ_start, occ_end in occurrences(rule, now, timedelta(hours=24)):
            if occ_start <= now_ts:
                continue
            rec = by_id.get(rule.get("occ_records", {}).get(str(occ_start)))
            if rec is None or rec.get("state") != "waiting_start_time":
                continue
            prog = match_guide_program(programs.get(rule["channel_uuid"], []), occ_start, occ_end)
            if prog is None:
                continue
            if same_title(prog.get("title"), rule["title"]):
                shift = prog["_start"] - occ_start
                new_start = max(occ_start + shift - rule["margin_before"] * 60, now_ts + 60)
                new_end = occ_end + shift + rule["margin_after"] * 60
                subname = prog.get("subtitle") or ""
                if (rec.get("start"), rec.get("end"), rec.get("subname") or "") != (new_start, new_end, subname):
                    try:
                        await coordinator.client.update_record(rec, {"start": new_start, "end": new_end, "subname": subname})
                        modified = True
                    except FreeboxPvrError as err:
                        _LOGGER.warning("Répétition « %s » : mise à jour impossible (%s)", rule["title"], err)
            elif occ_start not in rule.setdefault("notified", []):
                rule["notified"].append(occ_start)
                save = True
                await _async_notify(hass, coordinator, rule, occ_start, rec, prog)
    if save:
        await repeats.async_save()
    return modified


async def _async_notify(hass: HomeAssistant, coordinator, rule: dict[str, Any], occ_start: int, rec: dict[str, Any], prog: dict[str, Any]) -> None:
    t = TEXTS["fr" if str(hass.config.language).startswith("fr") else "en"]
    local = dt_util.as_local(dt_util.utc_from_timestamp(occ_start))
    message = t["message"].format(
        rule=rule["title"], channel=rule["channel_name"], day=t["days"][local.weekday()],
        time=local.strftime("%H:%M"), prog=prog.get("title"),
    )
    nid = notification_id(rule["id"], occ_start)
    persistent_notification.async_create(hass, message, title=t["title"], notification_id=nid)
    for service in coordinator.config_entry.options.get(CONF_NOTIFY, []) or []:
        domain, _, name = service.partition(".")
        if domain != "notify" or not hass.services.has_service("notify", name):
            continue
        try:
            await hass.services.async_call(
                "notify", name,
                {
                    "title": t["title"],
                    "message": message,
                    "data": {
                        "tag": nid,
                        "actions": [
                            {"action": f"{ACTION_CANCEL}{rec['id']}", "title": t["cancel"], "destructive": True},
                            {"action": f"{ACTION_KEEP}{rec['id']}", "title": t["keep"]},
                        ],
                    },
                },
                blocking=False,
            )
        except Exception as err:  # noqa: BLE001 — une notification ratée ne doit rien bloquer
            _LOGGER.warning("Notification %s impossible : %s", service, err)


def async_listen_actions(hass: HomeAssistant, coordinator: FreeboxPvrCoordinator):
    """Réponses aux boutons des notifications de l'application mobile."""

    @callback
    def _handle(event: Event) -> None:
        action = str(event.data.get("action", ""))
        if not action.startswith((ACTION_CANCEL, ACTION_KEEP)):
            return
        try:
            record_id = int(action.rsplit("_", 1)[1])
        except ValueError:
            return
        rule = coordinator.repeats.rule_for_record(record_id)
        if rule is None:
            return  # enregistrement d'une autre Freebox (ou répétition arrêtée)
        occ = next((int(k) for k, v in rule.get("occ_records", {}).items() if v == record_id), None)
        if occ is not None:
            persistent_notification.async_dismiss(hass, notification_id(rule["id"], occ))
        if action.startswith(ACTION_CANCEL):
            hass.async_create_task(_async_cancel(coordinator, record_id))

    return hass.bus.async_listen("mobile_app_notification_action", _handle)


async def _async_cancel(coordinator: FreeboxPvrCoordinator, record_id: int) -> None:
    try:
        await coordinator.client.delete_record(record_id)
    except FreeboxPvrError as err:
        _LOGGER.warning("Annulation de l'enregistrement %s impossible : %s", record_id, err)
    await coordinator.async_request_refresh()
