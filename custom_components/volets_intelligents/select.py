"""Sélecteurs du mode global et du scénario."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import MODES
from .entity import VoletsEntity
from .manager import VoletsManager


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    manager: VoletsManager = entry.runtime_data
    async_add_entities(
        [
            ModeSelect(manager, entry.entry_id),
            ScenarioSelect(manager, entry.entry_id),
            WindowEndModeSelect(manager, entry.entry_id),
        ]
    )


class ModeSelect(VoletsEntity, SelectEntity):
    """Mode global : automatique, manuel ou arrêté."""

    _attr_translation_key = "mode"
    _attr_options = list(MODES)
    _attr_icon = "mdi:auto-mode"
    _attr_name = "Volets mode"

    def __init__(self, manager: VoletsManager, entry_id: str) -> None:
        super().__init__(manager, entry_id)
        self._attr_unique_id = f"{entry_id}_mode"

    @property
    def current_option(self) -> str:
        return self.manager.mode

    async def async_select_option(self, option: str) -> None:
        await self.manager.async_set_mode(option)


class ScenarioSelect(VoletsEntity, SelectEntity):
    """Scénario actif : les options portent le nom saisi pour chaque scénario (ex. « Absents »)."""

    _attr_icon = "mdi:weather-sunny"
    _attr_name = "Volets scénario"

    def __init__(self, manager: VoletsManager, entry_id: str) -> None:
        super().__init__(manager, entry_id)
        self._attr_unique_id = f"{entry_id}_scenario"

    def _labels(self) -> dict[str, str]:
        """Clé -> libellé affiché ; un libellé en double est suivi de la clé pour rester unique."""
        raw = {
            key: str(conf.get("label") or "").strip() or key
            for key, conf in self.manager.config["scenarios"].items()
        }
        return {
            key: label if list(raw.values()).count(label) == 1 else f"{label} ({key})"
            for key, label in raw.items()
        }

    @property
    def options(self) -> list[str]:
        return list(self._labels().values())

    @property
    def current_option(self) -> str | None:
        labels = self._labels()
        return labels.get(self.manager.status.get("scenario", self.manager.scenario))

    async def async_select_option(self, option: str) -> None:
        """Accepte le nom affiché ou, pour les automatisations existantes, la clé (summer, vacation…)."""
        labels = self._labels()
        for key, label in labels.items():
            if option == label:
                await self.manager.async_set_scenario(key)
                return
        if option in labels:
            await self.manager.async_set_scenario(option)
            return
        raise HomeAssistantError(f"Scénario inconnu : {option}")


class WindowEndModeSelect(VoletsEntity, SelectEntity):
    """Comment la fin de la plage active est déterminée (heure fixe, entité ou coucher du soleil)."""

    _attr_translation_key = "window_end_mode"
    _attr_options = ["fixed", "entity", "sunset"]
    _attr_icon = "mdi:clock-end"
    _attr_name = "Volets réglage plage mode fin"

    def __init__(self, manager: VoletsManager, entry_id: str) -> None:
        super().__init__(manager, entry_id)
        self._attr_unique_id = f"{entry_id}_window_end_mode"

    @property
    def current_option(self) -> str:
        return self.manager.config["settings"]["window"]["end_mode"]

    async def async_select_option(self, option: str) -> None:
        await self.manager.async_set_window_setting("end_mode", option)
