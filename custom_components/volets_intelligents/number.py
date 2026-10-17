"""Nombres : décalages (coucher, horaires), seuils des scénarios, position « fenêtre ouverte » des volets."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfTemperature, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import ManagedCoverEntity, VoletsEntity, async_setup_dynamic_covers
from .manager import VoletsManager


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    manager = entry.runtime_data
    entry.async_on_unload(
        async_setup_dynamic_covers(
            hass, manager, entry.entry_id, "number", "window_position",
            CoverWindowPositionNumber, async_add_entities,
        )
    )
    async_add_entities(
        [
            SunsetOffsetNumber(manager, entry.entry_id),
            ScheduleOffsetNumber(
                manager, entry.entry_id, "open_offset_minutes",
                "Volets horaire ouverture décalage lever", "mdi:weather-sunset-up",
            ),
            ScheduleOffsetNumber(
                manager, entry.entry_id, "close_offset_minutes",
                "Volets horaire fermeture décalage coucher", "mdi:weather-sunset-down",
            ),
            *(
                ScenarioThresholdNumber(manager, entry.entry_id, scenario, key, label)
                for scenario, key, label in SCENARIO_THRESHOLDS
            ),
        ]
    )


# (scénario, clé du seuil, libellé) : l'identifiant de l'entité en découle
SCENARIO_THRESHOLDS = (
    ("summer", "close_outdoor", "été fermeture extérieur"),
    ("summer", "close_room", "été fermeture pièce"),
    ("summer", "open_outdoor", "été réouverture extérieur"),
    ("summer", "open_room", "été réouverture pièce"),
    ("winter", "gain_outdoor_below", "hiver gain extérieur"),
    ("winter", "gain_room_below", "hiver gain pièce"),
)


class SunsetOffsetNumber(VoletsEntity, NumberEntity):
    """Minutes avant (négatif) ou après (positif) le coucher du soleil."""

    _attr_name = "Volets réglage plage décalage coucher"
    _attr_icon = "mdi:weather-sunset"
    _attr_native_min_value = -240
    _attr_native_max_value = 240
    _attr_native_step = 5
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_mode = NumberMode.BOX

    def __init__(self, manager: VoletsManager, entry_id: str) -> None:
        super().__init__(manager, entry_id)
        self._attr_unique_id = f"{entry_id}_window_sunset_offset"

    @property
    def native_value(self) -> float:
        return self.manager.config["settings"]["window"]["sunset_offset_minutes"]

    async def async_set_native_value(self, value: float) -> None:
        await self.manager.async_set_window_setting("sunset_offset_minutes", int(value))


class ScheduleOffsetNumber(VoletsEntity, NumberEntity):
    """Décalage de l'ouverture (lever du soleil) ou de la fermeture (coucher), de -60 à +60 min."""

    _attr_native_min_value = -60
    _attr_native_max_value = 60
    _attr_native_step = 5
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_mode = NumberMode.BOX

    def __init__(
        self, manager: VoletsManager, entry_id: str, key: str, name: str, icon: str
    ) -> None:
        super().__init__(manager, entry_id)
        self._key = key
        self._attr_name = name
        self._attr_icon = icon
        self._attr_unique_id = f"{entry_id}_schedule_{key}"

    @property
    def native_value(self) -> float:
        return self.manager.config["settings"]["schedule"][self._key]

    async def async_set_native_value(self, value: float) -> None:
        await self.manager.async_set_schedule_setting(self._key, int(value))


class ScenarioThresholdNumber(VoletsEntity, NumberEntity):
    """Seuil de température d'un scénario (été : protection contre la chaleur ; hiver : gain solaire)."""

    _attr_icon = "mdi:thermometer"
    _attr_native_min_value = 0
    _attr_native_max_value = 45
    _attr_native_step = 0.5
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS
    _attr_mode = NumberMode.BOX

    def __init__(
        self, manager: VoletsManager, entry_id: str, scenario: str, key: str, label: str
    ) -> None:
        super().__init__(manager, entry_id)
        self._scenario = scenario
        self._key = key
        self._attr_name = f"Volets seuil {label}"
        self._attr_unique_id = f"{entry_id}_{scenario}_{key}"

    @property
    def available(self) -> bool:
        scenario = self.manager.config["scenarios"].get(self._scenario)
        return bool(scenario and self._key in scenario)

    @property
    def native_value(self) -> float | None:
        scenario = self.manager.config["scenarios"].get(self._scenario) or {}
        return scenario.get(self._key)

    async def async_set_native_value(self, value: float) -> None:
        await self.manager.async_set_scenario_setting(self._scenario, self._key, float(value))


class CoverWindowPositionNumber(ManagedCoverEntity, NumberEntity):
    """Position (en %) du volet à la fermeture du soir si une fenêtre est ouverte (choix « position »)."""

    _attr_icon = "mdi:window-shutter-open"
    _attr_native_min_value = 0
    _attr_native_max_value = 100
    _attr_native_step = 1
    _attr_native_unit_of_measurement = "%"
    _attr_mode = NumberMode.BOX

    def __init__(self, manager: VoletsManager, entry_id: str, cover_id: str) -> None:
        super().__init__(manager, entry_id, cover_id)
        self._attr_unique_id = f"{entry_id}_{cover_id}_window_position"

    @property
    def name(self) -> str:
        cover = self.cover_config()
        return f"Volets {cover['name'] if cover else self.cover_id} horaire fenêtre position"

    @property
    def native_value(self) -> float | None:
        cover = self.cover_config()
        return cover["window_open_position"] if cover else None

    async def async_set_native_value(self, value: float) -> None:
        await self.manager.async_set_cover_window_position(self.cover_id, int(value))
