"""Coordinateur : liste des enregistrements programmés et des chaînes."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import FreeboxPvrClient, FreeboxPvrError, PermissionMissing
from .const import CHANNELS_REFRESH, DOMAIN, SCAN_INTERVAL
from .guide import async_check_guide
from .repeat import RepeatManager

_LOGGER = logging.getLogger(__name__)


@dataclass
class PvrData:
    records: list[dict[str, Any]] = field(default_factory=list)
    finished: list[dict[str, Any]] = field(default_factory=list)
    channels: dict[str, dict[str, Any]] = field(default_factory=dict)


class FreeboxPvrCoordinator(DataUpdateCoordinator[PvrData]):
    """Interroge la Freebox toutes les 5 minutes."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, client: FreeboxPvrClient) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=SCAN_INTERVAL,
        )
        self.client = client
        self.repeats = RepeatManager(hass, entry.entry_id)
        self._channels: dict[str, dict[str, Any]] = {}
        self._channels_at: datetime | None = None

    async def async_refresh_channels(self) -> None:
        self._channels = await self.client.get_channels()
        self._channels_at = dt_util.utcnow()

    async def _async_update_data(self) -> PvrData:
        try:
            if (
                not self._channels
                or self._channels_at is None
                or dt_util.utcnow() - self._channels_at > CHANNELS_REFRESH
            ):
                await self.async_refresh_channels()
            records = await self.client.get_records()
            if self.repeats.rules and await self.repeats.async_ensure(self.client, records):
                records = await self.client.get_records()
            # Le jour de la diffusion : contrôle des répétitions avec le guide Programme TNT FR
            if self.repeats.rules and await async_check_guide(self.hass, self, records):
                records = await self.client.get_records()
        except PermissionMissing as err:
            raise UpdateFailed(
                "Droit « Enregistrements TV (PVR) » manquant pour l'application sur la Freebox"
            ) from err
        except FreeboxPvrError as err:
            raise UpdateFailed(str(err)) from err
        except Exception as err:  # réseau, TLS…
            raise UpdateFailed(f"Freebox injoignable : {err}") from err
        records.sort(key=lambda r: r.get("start", 0))
        try:
            finished = await self.client.get_finished()
        except FreeboxPvrError as err:
            _LOGGER.debug("Enregistrements terminés non lisibles : %s", err)
            finished = self.data.finished if self.data else []
        finished.sort(key=lambda r: r.get("start", 0), reverse=True)
        return PvrData(records=records, channels=self._channels, finished=finished)
