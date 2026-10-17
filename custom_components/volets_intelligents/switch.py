"""Interrupteurs : gestion automatique et horaires de chaque volet, horaires globaux."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
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
        ]
    )
    entry.async_on_unload(
        async_setup_dynamic_covers(
            hass, manager, entry.entry_id, "switch", "schedule_open", CoverScheduleOpenSwitch, async_add_entities
        )
    )
    entry.async_on_unload(
        async_setup_dynamic_covers(
            hass, manager, entry.entry_id, "switch", "schedule_close", CoverScheduleCloseSwitch, async_add_entities
        )
    )
    # Ancien interrupteur unique « horaires » (2026.10.12 et avant), remplacé par les deux ci-dessus.
    registry = er.async_get(hass)
    for cover in manager.config["covers"]:
        old = registry.async_get_entity_id("switch", DOMAIN, f"{entry.entry_id}_{cover['entity_id']}_schedule")
        if old:
            registry.async_remove(old)
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
    """Inclut ou exclut un volet de l'ouverture du matin (`open`) ou de la fermeture du soir (`close`)."""

    _which = "open"
    _label = "ouverture"
    _attr_icon = "mdi:clock-check-outline"

    def __init__(self, manager: VoletsManager, entry_id: str, cover_id: str) -> None:
        super().__init__(manager, entry_id, cover_id)
        self._attr_unique_id = f"{entry_id}_{cover_id}_schedule_{self._which}"

    @property
    def name(self) -> str:
        cover = self.cover_config()
        return f"Volets {cover['name'] if cover else self.cover_id} horaire {self._label}"

    @property
    def is_on(self) -> bool:
        cover = self.cover_config()
        return bool(cover and cover[f"schedule_{self._which}_enabled"])

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.manager.async_set_cover_schedule(self.cover_id, self._which, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.manager.async_set_cover_schedule(self.cover_id, self._which, False)


class CoverScheduleOpenSwitch(CoverScheduleSwitch):
    """Ouverture du matin d'un volet."""

    _which = "open"
    _label = "ouverture"


class CoverScheduleCloseSwitch(CoverScheduleSwitch):
    """Fermeture du soir d'un volet."""

    _which = "close"
    _label = "fermeture"
    _attr_icon = "mdi:clock-check"


class ScheduleFlagSwitch(VoletsEntity, SwitchEntity):
    """Blocage de l'ouverture horaire : alarme, ou alarme et fenêtre ouverte."""

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
