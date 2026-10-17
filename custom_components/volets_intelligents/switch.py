"""Interrupteurs : gestion automatique et horaires de chaque volet, horaires globaux."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import ManagedCoverEntity, VoletsEntity, async_setup_dynamic_covers
from .manager import VoletsManager


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    manager: VoletsManager = entry.runtime_data
    async_add_entities(
        [
            ScheduleSwitch(manager, entry.entry_id),
            ScheduleFlagSwitch(
                manager, entry.entry_id, "block_open_alarm",
                "Volets horaire alarme bloque ouverture", "mdi:shield-lock-outline",
            ),
            ScheduleFlagSwitch(
                manager, entry.entry_id, "block_open_alarm_window",
                "Volets horaire alarme et fenêtre bloquent ouverture", "mdi:shield-lock-outline",
            ),
            ScheduleFlagSwitch(
                manager, entry.entry_id, "block_close_window",
                "Volets horaire fenêtre bloque fermeture", "mdi:window-open-variant",
            ),
        ]
    )
    entry.async_on_unload(
        async_setup_dynamic_covers(
            hass, manager, entry.entry_id, "switch", "schedule", CoverScheduleSwitch, async_add_entities
        )
    )
    entry.async_on_unload(
        async_setup_dynamic_covers(
            hass, manager, entry.entry_id, "switch", "auto", CoverAutoSwitch, async_add_entities
        )
    )


class CoverAutoSwitch(ManagedCoverEntity, SwitchEntity):
    """Active ou désactive la gestion automatique d'un volet."""

    _attr_icon = "mdi:blinds-horizontal"

    def __init__(self, manager: VoletsManager, entry_id: str, cover_id: str) -> None:
        super().__init__(manager, entry_id, cover_id)
        self._attr_unique_id = f"{entry_id}_{cover_id}_auto"

    @property
    def name(self) -> str:
        cover = self.cover_config()
        return f"Volets {cover['name'] if cover else self.cover_id} auto"

    @property
    def is_on(self) -> bool:
        cover = self.cover_config()
        return bool(cover and cover["enabled"])

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.manager.async_set_cover_enabled(self.cover_id, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.manager.async_set_cover_enabled(self.cover_id, False)


class ScheduleSwitch(VoletsEntity, SwitchEntity):
    """Active les ouvertures et fermetures horaires de tous les volets."""

    _attr_icon = "mdi:clock-time-eight-outline"
    _attr_name = "Volets horaires"

    def __init__(self, manager: VoletsManager, entry_id: str) -> None:
        super().__init__(manager, entry_id)
        self._attr_unique_id = f"{entry_id}_schedule_enabled"

    @property
    def is_on(self) -> bool:
        return self.manager.config["settings"]["schedule"]["enabled"]

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.manager.async_set_schedule_setting("enabled", True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.manager.async_set_schedule_setting("enabled", False)


class CoverScheduleSwitch(ManagedCoverEntity, SwitchEntity):
    """Inclut ou exclut un volet des ouvertures et fermetures horaires."""

    _attr_icon = "mdi:clock-check-outline"

    def __init__(self, manager: VoletsManager, entry_id: str, cover_id: str) -> None:
        super().__init__(manager, entry_id, cover_id)
        self._attr_unique_id = f"{entry_id}_{cover_id}_schedule"

    @property
    def name(self) -> str:
        cover = self.cover_config()
        return f"Volets {cover['name'] if cover else self.cover_id} horaires"

    @property
    def is_on(self) -> bool:
        cover = self.cover_config()
        return bool(cover and cover["schedule_enabled"])

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.manager.async_set_cover_schedule(self.cover_id, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.manager.async_set_cover_schedule(self.cover_id, False)


class ScheduleFlagSwitch(VoletsEntity, SwitchEntity):
    """Blocage des ordres horaires : alarme (ouverture), alarme + fenêtre (ouverture), fenêtre (fermeture)."""

    def __init__(
        self, manager: VoletsManager, entry_id: str, key: str, name: str, icon: str
    ) -> None:
        super().__init__(manager, entry_id)
        self._key = key
        self._attr_name = name
        self._attr_icon = icon
        self._attr_unique_id = f"{entry_id}_schedule_{key}"

    @property
    def is_on(self) -> bool:
        return self.manager.config["settings"]["schedule"][self._key]

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.manager.async_set_schedule_setting(self._key, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.manager.async_set_schedule_setting(self._key, False)
