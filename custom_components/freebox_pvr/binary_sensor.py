"""Capteur binaire : enregistrement en cours."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import RUNNING_STATES
from .entity import FreeboxPvrEntity, record_to_attr


async def async_setup_entry(hass: HomeAssistant, entry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([RecordingBinarySensor(entry.runtime_data, "recording")])


class RecordingBinarySensor(FreeboxPvrEntity, BinarySensorEntity):
    _attr_icon = "mdi:record-circle"

    def _running(self) -> list[dict[str, Any]]:
        return [r for r in self.coordinator.data.records if r.get("state") in RUNNING_STATES]

    @property
    def is_on(self) -> bool:
        return bool(self._running())

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"records": [record_to_attr(r) for r in self._running()]}
