"""Configuration de Freebox PVR (assistant UI)."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.core import callback
from homeassistant.helpers import selector

from freebox_api.exceptions import AuthorizationError

from .api import FreeboxPvrClient, FreeboxPvrError, PermissionMissing
from .const import (
    CONF_CHANNEL_ALIASES,
    CONF_NOTIFY,
    CONF_MARGIN_AFTER,
    CONF_MARGIN_BEFORE,
    CONF_QUALITY,
    DEFAULT_HOST,
    DEFAULT_MARGIN_AFTER,
    DEFAULT_MARGIN_BEFORE,
    DEFAULT_PORT,
    DEFAULT_QUALITY,
    DOMAIN,
    QUALITIES,
)

_LOGGER = logging.getLogger(__name__)


class FreeboxPvrConfigFlow(ConfigFlow, domain=DOMAIN):
    """Assistant : adresse de la box, puis validation sur l'écran du Freebox Server."""

    VERSION = 1

    def __init__(self) -> None:
        self._host: str = DEFAULT_HOST
        self._port: int = DEFAULT_PORT

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._host = user_input[CONF_HOST].strip()
            self._port = int(user_input[CONF_PORT])
            await self.async_set_unique_id(self._host.lower())
            self._abort_if_unique_id_configured()
            return await self.async_step_link()

        # Reprend l'adresse de l'intégration Freebox officielle si elle existe
        host, port = DEFAULT_HOST, DEFAULT_PORT
        for entry in self.hass.config_entries.async_entries("freebox"):
            host = entry.data.get(CONF_HOST, host)
            port = entry.data.get(CONF_PORT, port)
            break
        schema = vol.Schema(
            {
                vol.Required(CONF_HOST, default=host): str,
                vol.Required(CONF_PORT, default=port): vol.All(vol.Coerce(int), vol.Range(min=1, max=65535)),
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    async def async_step_link(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            from . import token_path  # import tardif : évite une boucle d'import

            token_file = token_path(self.hass, self._host)
            await self.hass.async_add_executor_job(
                lambda: token_file.parent.mkdir(parents=True, exist_ok=True)
            )
            client = FreeboxPvrClient(self._host, self._port, token_file)
            try:
                await client.open()
                await client.get_channels()
                await client.get_records()
            except PermissionMissing:
                errors["base"] = "permission_missing"
            except AuthorizationError:
                errors["base"] = "register_failed"
            except FreeboxPvrError:
                errors["base"] = "cannot_connect"
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Connexion à la Freebox impossible")
                errors["base"] = "cannot_connect"
            finally:
                await client.close()
            if not errors:
                return self.async_create_entry(
                    title=f"Freebox PVR ({self._host})",
                    data={CONF_HOST: self._host, CONF_PORT: self._port},
                )
        return self.async_show_form(step_id="link", errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return FreeboxPvrOptionsFlow()


class FreeboxPvrOptionsFlow(OptionsFlow):
    """Marges, qualité et correspondances de chaînes."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        opts = self.config_entry.options
        notify_services = sorted(
            f"notify.{name}"
            for name in self.hass.services.async_services_for_domain("notify")
            if name not in ("send_message", "persistent_notification", "notify")
        )
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_MARGIN_BEFORE, default=opts.get(CONF_MARGIN_BEFORE, DEFAULT_MARGIN_BEFORE)
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(min=0, max=60, step=1, unit_of_measurement="min", mode=selector.NumberSelectorMode.BOX)
                ),
                vol.Required(
                    CONF_MARGIN_AFTER, default=opts.get(CONF_MARGIN_AFTER, DEFAULT_MARGIN_AFTER)
                ): selector.NumberSelector(
                    selector.NumberSelectorConfig(min=0, max=120, step=1, unit_of_measurement="min", mode=selector.NumberSelectorMode.BOX)
                ),
                vol.Required(CONF_QUALITY, default=opts.get(CONF_QUALITY, DEFAULT_QUALITY)): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=QUALITIES, translation_key="quality", mode=selector.SelectSelectorMode.DROPDOWN)
                ),
                vol.Optional(CONF_NOTIFY, default=[s for s in opts.get(CONF_NOTIFY, []) if s in notify_services]): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=notify_services, multiple=True, mode=selector.SelectSelectorMode.LIST)
                ),
                vol.Optional(
                    CONF_CHANNEL_ALIASES,
                    description={"suggested_value": opts.get(CONF_CHANNEL_ALIASES, "")},
                ): selector.TextSelector(selector.TextSelectorConfig(multiline=True)),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
