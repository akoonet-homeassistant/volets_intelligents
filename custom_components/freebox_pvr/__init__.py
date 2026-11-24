"""Freebox PVR : programmer des enregistrements TV sur la Freebox depuis Home Assistant."""

from __future__ import annotations

from datetime import datetime
import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import ATTR_ENTITY_ID, CONF_HOST, CONF_PORT, Platform
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import (
    ConfigEntryNotReady,
    HomeAssistantError,
    ServiceValidationError,
)
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import STORAGE_DIR
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

from .api import (
    ChannelNotFound,
    FreeboxPvrClient,
    FreeboxPvrError,
    PermissionMissing,
    RecordRequest,
    find_channel,
    find_record_for_program,
    parse_aliases,
)
from .const import (
    ATTR_CHANNEL_NAME,
    ATTR_CHANNEL_UUID,
    ATTR_END,
    ATTR_END_TIME,
    ATTR_RECORD_ID,
    ATTR_REPEAT_ID,
    ATTR_REPEAT_WEEKLY,
    ATTR_SLOT,
    ATTR_START,
    ATTR_SUBTITLE,
    ATTR_TITLE,
    CONF_CHANNEL_ALIASES,
    CONF_MARGIN_AFTER,
    CONF_MARGIN_BEFORE,
    CONF_QUALITY,
    DEFAULT_MARGIN_AFTER,
    DEFAULT_MARGIN_BEFORE,
    DEFAULT_QUALITY,
    DOMAIN,
    QUALITIES,
    SERVICE_CANCEL,
    SERVICE_RECORD,
    SERVICE_REFRESH_CHANNELS,
    SERVICE_DELETE_FINISHED,
    SERVICE_PAUSE_RECORD,
    SERVICE_PAUSE_REPEAT,
    SERVICE_RESUME_RECORD,
    SERVICE_RESUME_REPEAT,
    SERVICE_STOP_RECORD,
    SERVICE_STOP_REPEAT,
    SLOTS,
    RUNNING_STATES,
    STATIC_URL,
    VERSION,
)
from .coordinator import FreeboxPvrCoordinator
from .guide import async_listen_actions
from .repeat import compute_end

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.BINARY_SENSOR, Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type FreeboxPvrConfigEntry = ConfigEntry[FreeboxPvrCoordinator]

_DATETIME = vol.Any(cv.datetime, cv.positive_int)

RECORD_SCHEMA = vol.Schema(
    {
        vol.Optional(ATTR_ENTITY_ID): cv.entity_id,
        vol.Optional(ATTR_SLOT, default="current"): vol.In(SLOTS),
        vol.Optional(ATTR_CHANNEL_NAME): cv.string,
        vol.Optional(ATTR_CHANNEL_UUID): cv.string,
        vol.Optional(ATTR_TITLE): cv.string,
        vol.Optional(ATTR_SUBTITLE): vol.Any(None, cv.string),
        vol.Optional(ATTR_START): _DATETIME,
        vol.Optional(ATTR_END): _DATETIME,
        vol.Optional(ATTR_END_TIME): cv.time,
        vol.Optional(ATTR_REPEAT_WEEKLY, default=False): cv.boolean,
        vol.Optional(CONF_MARGIN_BEFORE): vol.All(vol.Coerce(int), vol.Range(min=0, max=60)),
        vol.Optional(CONF_MARGIN_AFTER): vol.All(vol.Coerce(int), vol.Range(min=0, max=120)),
        vol.Optional(CONF_QUALITY): vol.In(QUALITIES),
        vol.Optional("config_entry_id"): cv.string,
    }
)

CANCEL_SCHEMA = vol.Schema(
    {
        vol.Optional(ATTR_RECORD_ID): vol.Coerce(int),
        vol.Optional(ATTR_ENTITY_ID): cv.entity_id,
        vol.Optional(ATTR_SLOT, default="current"): vol.In(SLOTS),
        vol.Optional(ATTR_CHANNEL_NAME): cv.string,
        vol.Optional(ATTR_CHANNEL_UUID): cv.string,
        vol.Optional(ATTR_START): _DATETIME,
        vol.Optional("config_entry_id"): cv.string,
    }
)


def token_path(hass: HomeAssistant, host: str) -> Path:
    """Fichier du jeton d'application, dans .storage (comme l'intégration Freebox)."""
    safe = "".join(c if c.isalnum() or c in ".-_" else "_" for c in host)
    return Path(hass.config.path(STORAGE_DIR, DOMAIN, f"{safe}.conf"))


def to_timestamp(value: Any) -> int | None:
    """Convertit datetime / chaîne ISO / timestamp en timestamp Unix."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        parsed = dt_util.parse_datetime(value)
        if parsed is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="invalid_datetime",
                translation_placeholders={"value": value},
            )
        value = parsed
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt_util.get_default_time_zone())
        return int(value.timestamp())
    raise ServiceValidationError(
        translation_domain=DOMAIN,
        translation_key="invalid_datetime",
        translation_placeholders={"value": str(value)},
    )


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Enregistre les actions (services) et la carte du tableau de bord."""
    # Carte « Freebox PVR » : chargée sur toutes les pages, sans ressource Lovelace à ajouter
    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths([StaticPathConfig(STATIC_URL, str(frontend_dir), True)])
    add_extra_js_url(hass, f"{STATIC_URL}/freebox-pvr-card.js?v={VERSION}")

    def _coordinator(call: ServiceCall) -> FreeboxPvrCoordinator:
        entry_id = call.data.get("config_entry_id")
        entries = [
            e
            for e in hass.config_entries.async_entries(DOMAIN)
            if e.state is ConfigEntryState.LOADED and (not entry_id or e.entry_id == entry_id)
        ]
        if not entries:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_loaded")
        return entries[0].runtime_data

    def _program_from_entity(call: ServiceCall) -> dict[str, Any]:
        """Lit chaîne/titre/heures sur un capteur « Programme TNT FR »."""
        entity_id = call.data[ATTR_ENTITY_ID]
        state = hass.states.get(entity_id)
        if state is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="entity_not_found",
                translation_placeholders={"entity_id": entity_id},
            )
        slot = call.data[ATTR_SLOT]
        program = state.attributes.get(slot)
        if not isinstance(program, dict) or not program.get("start"):
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="no_program",
                translation_placeholders={"entity_id": entity_id, "slot": slot},
            )
        return {
            ATTR_CHANNEL_NAME: state.attributes.get("channel_name") or state.name,
            ATTR_TITLE: program.get("title") or state.state,
            ATTR_SUBTITLE: program.get("subtitle"),
            ATTR_START: program.get("start"),
            ATTR_END: program.get("stop") or program.get("end"),
        }

    def _resolve_channel(coordinator: FreeboxPvrCoordinator, name: str | None, uuid: str | None) -> dict[str, Any]:
        channels = coordinator.data.channels if coordinator.data else {}
        if uuid:
            return channels.get(uuid, {"uuid": uuid, "name": name or uuid})
        aliases = parse_aliases(coordinator.config_entry.options.get(CONF_CHANNEL_ALIASES))
        try:
            return find_channel(channels, name or "", aliases)
        except ChannelNotFound as err:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="channel_not_found",
                translation_placeholders={"channel": name or ""},
            ) from err

    async def _guard(coro):
        try:
            return await coro
        except PermissionMissing as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN, translation_key="permission_missing"
            ) from err
        except FreeboxPvrError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="api_error",
                translation_placeholders={"error": str(err)},
            ) from err

    async def async_record(call: ServiceCall) -> ServiceResponse:
        coordinator = _coordinator(call)
        options = coordinator.config_entry.options
        data: dict[str, Any] = {}
        if ATTR_ENTITY_ID in call.data:
            data.update(_program_from_entity(call))
        for key in (ATTR_CHANNEL_NAME, ATTR_TITLE, ATTR_SUBTITLE, ATTR_START, ATTR_END):
            if call.data.get(key) not in (None, ""):
                data[key] = call.data[key]

        start = to_timestamp(data.get(ATTR_START))
        end = to_timestamp(data.get(ATTR_END))
        if start is not None and call.data.get(ATTR_END_TIME) is not None:
            # Heure de fin choisie : le jour même, ou le lendemain si elle passe minuit
            end = int(compute_end(dt_util.utc_from_timestamp(start), call.data[ATTR_END_TIME]).timestamp())
        if not data.get(ATTR_TITLE) or start is None or end is None or not (
            data.get(ATTR_CHANNEL_NAME) or call.data.get(ATTR_CHANNEL_UUID)
        ):
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="missing_fields")
        if end <= start:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="end_before_start")
        now = int(dt_util.utcnow().timestamp())
        if end <= now:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="already_finished")

        channel = _resolve_channel(coordinator, data.get(ATTR_CHANNEL_NAME), call.data.get(ATTR_CHANNEL_UUID))
        uuid = channel["uuid"]

        records = coordinator.data.records if coordinator.data else []
        margin_before = call.data.get(CONF_MARGIN_BEFORE, options.get(CONF_MARGIN_BEFORE, DEFAULT_MARGIN_BEFORE))
        margin_after = call.data.get(CONF_MARGIN_AFTER, options.get(CONF_MARGIN_AFTER, DEFAULT_MARGIN_AFTER))
        quality = call.data.get(CONF_QUALITY, options.get(CONF_QUALITY, DEFAULT_QUALITY))
        channel_name = channel.get("name") or data.get(ATTR_CHANNEL_NAME) or uuid
        program_start = start

        async def _repeat(record_id: Any) -> str | None:
            if not call.data.get(ATTR_REPEAT_WEEKLY):
                return None
            rule = await coordinator.repeats.async_add(
                channel_uuid=uuid, channel_name=channel_name, title=str(data[ATTR_TITLE]),
                subtitle=data.get(ATTR_SUBTITLE), start=program_start, end=end,
                margin_before=int(margin_before), margin_after=int(margin_after), quality=quality,
                first_record_id=record_id,
            )
            await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état  # programme la semaine suivante
            return rule["id"]

        existing = find_record_for_program(records, uuid, start, end)
        if existing:
            if call.data.get(ATTR_END_TIME) is not None or call.data.get(ATTR_END) not in (None, ""):
                # Programme déjà enregistré mais nouvelle heure de fin : on met à jour la fin
                new_end = int(end + int(margin_after) * 60)
                if new_end != existing.get("end"):
                    await _guard(coordinator.client.update_record_end(existing, new_end))
                    await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état
            repeat_id = await _repeat(existing.get("id"))
            return {"record_id": existing.get("id"), "already_programmed": True, "channel_uuid": uuid, ATTR_REPEAT_ID: repeat_id}

        # Programme déjà commencé (ou marge dans le passé) : on démarre maintenant.
        if start - margin_before * 60 < now + 30:
            start, margin_before = now + 30, 0

        request = RecordRequest(
            channel_uuid=uuid,
            channel_name=channel_name,
            title=str(data[ATTR_TITLE]),
            subtitle=data.get(ATTR_SUBTITLE),
            start=start,
            end=end,
            margin_before=int(margin_before),
            margin_after=int(margin_after),
            quality=quality,
        )
        result = await _guard(coordinator.client.create_record(request))
        repeat_id = await _repeat(result.get("id"))
        await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état
        return {
            ATTR_REPEAT_ID: repeat_id,
            "record_id": result.get("id"),
            "already_programmed": False,
            "channel_uuid": uuid,
            "channel_name": request.channel_name,
            "start": dt_util.utc_from_timestamp(request.start - request.margin_before * 60).isoformat(),
            "end": dt_util.utc_from_timestamp(request.end + request.margin_after * 60).isoformat(),
            "conflict": bool(result.get("conflict")),
        }

    async def async_cancel(call: ServiceCall) -> ServiceResponse:
        coordinator = _coordinator(call)
        record_id = call.data.get(ATTR_RECORD_ID)
        if record_id is None:
            data: dict[str, Any] = {}
            if ATTR_ENTITY_ID in call.data:
                data.update(_program_from_entity(call))
            if call.data.get(ATTR_CHANNEL_NAME):
                data[ATTR_CHANNEL_NAME] = call.data[ATTR_CHANNEL_NAME]
            if call.data.get(ATTR_START):
                data[ATTR_START] = call.data[ATTR_START]
                data.pop(ATTR_END, None)
            start = to_timestamp(data.get(ATTR_START))
            end = to_timestamp(data.get(ATTR_END))
            if start is None or not (data.get(ATTR_CHANNEL_NAME) or call.data.get(ATTR_CHANNEL_UUID)):
                raise ServiceValidationError(translation_domain=DOMAIN, translation_key="missing_fields")
            channel = _resolve_channel(coordinator, data.get(ATTR_CHANNEL_NAME), call.data.get(ATTR_CHANNEL_UUID))
            rec = find_record_for_program(coordinator.data.records, channel["uuid"], start, end)
            if rec is None:
                raise ServiceValidationError(translation_domain=DOMAIN, translation_key="record_not_found")
            record_id = rec["id"]
        await _guard(coordinator.client.delete_record(int(record_id)))
        await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état
        return {"record_id": int(record_id), "cancelled": True}

    async def async_stop_repeat(call: ServiceCall) -> ServiceResponse:
        coordinator = _coordinator(call)
        rule = await coordinator.repeats.async_remove(call.data[ATTR_REPEAT_ID])
        if rule is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="repeat_not_found")
        cancelled: list[int] = []
        if call.data.get("cancel_scheduled"):
            now = int(dt_util.utcnow().timestamp())
            for rec in coordinator.data.records:
                if rec.get("id") == call.data.get("keep_record_id"):
                    continue
                if rec.get("id") in rule["record_ids"] and rec.get("state") == "waiting_start_time" and rec.get("start", 0) > now:
                    await _guard(coordinator.client.delete_record(int(rec["id"])))
                    cancelled.append(int(rec["id"]))
        coordinator.async_update_listeners()
        await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état
        return {ATTR_REPEAT_ID: rule["id"], "stopped": True, "cancelled": cancelled}

    def _record(coordinator: FreeboxPvrCoordinator, record_id: int) -> dict[str, Any]:
        rec = next((r for r in coordinator.data.records if r.get("id") == record_id), None)
        if rec is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="record_id_not_found",
                translation_placeholders={"record_id": str(record_id)},
            )
        return rec

    async def async_pause_record(call: ServiceCall) -> ServiceResponse:
        coordinator = _coordinator(call)
        rec = _record(coordinator, call.data[ATTR_RECORD_ID])
        if rec.get("state") in RUNNING_STATES:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="already_running")
        await _guard(coordinator.client.set_enabled(rec, False))
        await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état
        return {ATTR_RECORD_ID: rec["id"], "paused": True}

    async def async_resume_record(call: ServiceCall) -> ServiceResponse:
        coordinator = _coordinator(call)
        rec = _record(coordinator, call.data[ATTR_RECORD_ID])
        await _guard(coordinator.client.set_enabled(rec, True))
        await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état
        return {ATTR_RECORD_ID: rec["id"], "paused": False}

    async def async_stop_record(call: ServiceCall) -> ServiceResponse:
        coordinator = _coordinator(call)
        rec = _record(coordinator, call.data[ATTR_RECORD_ID])
        if rec.get("state") not in RUNNING_STATES:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_running")
        await _guard(coordinator.client.stop_record(rec, int(dt_util.utcnow().timestamp())))
        await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état
        return {ATTR_RECORD_ID: rec["id"], "stopped": True}

    async def async_delete_finished(call: ServiceCall) -> ServiceResponse:
        coordinator = _coordinator(call)
        record_id = call.data[ATTR_RECORD_ID]
        if not any(r.get("id") == record_id for r in coordinator.data.finished):
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="record_id_not_found",
                translation_placeholders={"record_id": str(record_id)},
            )
        await _guard(coordinator.client.delete_finished(record_id))
        await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état
        return {ATTR_RECORD_ID: record_id, "deleted": True}

    async def _set_repeat_paused(call: ServiceCall, paused: bool) -> ServiceResponse:
        coordinator = _coordinator(call)
        rule = await coordinator.repeats.async_set_paused(call.data[ATTR_REPEAT_ID], paused)
        if rule is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="repeat_not_found")
        # Les épisodes déjà programmés par la répétition suivent la pause / la reprise
        now = int(dt_util.utcnow().timestamp())
        wanted = "waiting_start_time" if paused else "disabled"
        changed: list[int] = []
        for rec in coordinator.data.records:
            if rec.get("id") in rule.get("record_ids", []) and rec.get("state") == wanted and rec.get("start", 0) > now:
                await _guard(coordinator.client.set_enabled(rec, not paused))
                changed.append(int(rec["id"]))
        coordinator.async_update_listeners()
        await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état
        return {ATTR_REPEAT_ID: rule["id"], "paused": paused, "records": changed}

    async def async_pause_repeat(call: ServiceCall) -> ServiceResponse:
        return await _set_repeat_paused(call, True)

    async def async_resume_repeat(call: ServiceCall) -> ServiceResponse:
        return await _set_repeat_paused(call, False)

    async def async_refresh_channels(call: ServiceCall) -> None:
        coordinator = _coordinator(call)
        await _guard(coordinator.async_refresh_channels())
        await coordinator.async_refresh()  # immédiat : la carte affiche le nouvel état

    hass.services.async_register(
        DOMAIN, SERVICE_RECORD, async_record, schema=RECORD_SCHEMA, supports_response=SupportsResponse.OPTIONAL
    )
    hass.services.async_register(
        DOMAIN, SERVICE_CANCEL, async_cancel, schema=CANCEL_SCHEMA, supports_response=SupportsResponse.OPTIONAL
    )
    record_id_schema = vol.Schema({vol.Required(ATTR_RECORD_ID): vol.Coerce(int), vol.Optional("config_entry_id"): cv.string})
    repeat_id_schema = vol.Schema({vol.Required(ATTR_REPEAT_ID): cv.string, vol.Optional("config_entry_id"): cv.string})
    for name, handler, schema in (
        (SERVICE_PAUSE_RECORD, async_pause_record, record_id_schema),
        (SERVICE_RESUME_RECORD, async_resume_record, record_id_schema),
        (SERVICE_STOP_RECORD, async_stop_record, record_id_schema),
        (SERVICE_DELETE_FINISHED, async_delete_finished, record_id_schema),
        (SERVICE_PAUSE_REPEAT, async_pause_repeat, repeat_id_schema),
        (SERVICE_RESUME_REPEAT, async_resume_repeat, repeat_id_schema),
    ):
        hass.services.async_register(DOMAIN, name, handler, schema=schema, supports_response=SupportsResponse.OPTIONAL)
    hass.services.async_register(
        DOMAIN,
        SERVICE_STOP_REPEAT,
        async_stop_repeat,
        schema=vol.Schema(
            {
                vol.Required(ATTR_REPEAT_ID): cv.string,
                vol.Optional("cancel_scheduled", default=False): cv.boolean,
                vol.Optional("keep_record_id"): vol.Coerce(int),
                vol.Optional("config_entry_id"): cv.string,
            }
        ),
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_REFRESH_CHANNELS,
        async_refresh_channels,
        schema=vol.Schema({vol.Optional("config_entry_id"): cv.string}),
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: FreeboxPvrConfigEntry) -> bool:
    """Ouvre la session Freebox et démarre le coordinateur."""
    client = FreeboxPvrClient(
        entry.data[CONF_HOST], entry.data[CONF_PORT], token_path(hass, entry.data[CONF_HOST])
    )
    if not await hass.async_add_executor_job(client.token_file.exists):
        # Sans jeton, open() relancerait une demande d'autorisation sur l'écran de la box.
        raise ConfigEntryNotReady("Jeton d'application Freebox introuvable, reconfigurez l'intégration")
    try:
        await client.open()
    except Exception as err:
        raise ConfigEntryNotReady(f"Connexion à la Freebox impossible : {err}") from err

    coordinator = FreeboxPvrCoordinator(hass, entry, client)
    await coordinator.repeats.async_load()
    try:
        await coordinator.async_config_entry_first_refresh()
    except Exception:
        await client.close()
        raise
    entry.runtime_data = coordinator
    entry.async_on_unload(async_listen_actions(hass, coordinator))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: FreeboxPvrConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: FreeboxPvrConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        await entry.runtime_data.client.close()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Supprime le jeton local (l'appli reste à révoquer dans Freebox OS)."""
    path = token_path(hass, entry.data[CONF_HOST])
    await hass.async_add_executor_job(lambda: path.unlink(missing_ok=True))
    from homeassistant.helpers.storage import Store

    await Store(hass, 1, f"{DOMAIN}.{entry.entry_id}.repeats").async_remove()
