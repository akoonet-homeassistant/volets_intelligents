"""Entité de base Freebox PVR."""

from __future__ import annotations

from typing import Any

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .const import DOMAIN, VERSION
from .coordinator import FreeboxPvrCoordinator


class FreeboxPvrEntity(CoordinatorEntity[FreeboxPvrCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coordinator: FreeboxPvrCoordinator, key: str) -> None:
        super().__init__(coordinator)
        entry = coordinator.config_entry
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Freebox PVR",
            manufacturer="Free",
            model="Enregistreur TV (Freebox OS)",
            sw_version=VERSION,
        )


def record_to_attr(rec: dict[str, Any]) -> dict[str, Any]:
    """Version lisible d'un enregistrement programmé."""

    def _iso(ts: Any) -> str | None:
        return dt_util.as_local(dt_util.utc_from_timestamp(ts)).isoformat() if ts else None

    return {
        "id": rec.get("id"),
        "name": rec.get("name"),
        "subname": rec.get("subname") or None,
        "channel_name": rec.get("channel_name"),
        "channel_uuid": rec.get("channel_uuid"),
        "start": _iso(rec.get("start")),
        "end": _iso(rec.get("end")),
        "start_ts": rec.get("start"),
        "end_ts": rec.get("end"),
        "state": rec.get("state"),
        "error": rec.get("error"),
        "conflict": bool(rec.get("conflict")),
    }
