"""Accès à l'enregistreur (PVR) de la Freebox via l'API Freebox OS."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
import logging
import os
from pathlib import Path
import re
from typing import Any
import unicodedata

from freebox_api import Freepybox
from freebox_api.exceptions import (
    AuthorizationError,
    HttpRequestError,
    InsufficientPermissionsError,
)

from .const import API_VERSION, APP_DESC

_LOGGER = logging.getLogger(__name__)

# Noms du guide TNT qui diffèrent du nom de la chaîne côté Freebox.
# Clés et valeurs sont des noms normalisés (voir normalize_channel).
BUILTIN_ALIASES: dict[str, list[str]] = {
    "lcp": ["lcpan", "lcpassembleenationale", "lcppublicsenat", "lcp100"],
    "franceinfo": ["franceinfo", "franceinfotv"],
    "bfmtv": ["bfmtv", "bfm"],
    "lequipe": ["lequipe", "lequipe21", "lequipetv"],
    "canalplus": ["canalplus", "canalplusclair", "canalplushd"],
    "tf1seriesfilms": ["tf1seriesfilms", "tf1sf"],
    "rmcdecouverte": ["rmcdecouverte", "rmcdecouvertehd"],
    "t18": ["t18"],
    "novo19": ["novo19"],
}


# Champs renvoyés tels quels lors de la modification d'un enregistrement programmé
EDITABLE_FIELDS = {
    "channel_uuid", "channel_name", "channel_quality", "channel_type", "broadcast_type",
    "media", "path", "name", "subname", "start", "end", "margin_before", "margin_after", "enabled",
}


class FreeboxPvrError(Exception):
    """Erreur générique."""


class ChannelNotFound(FreeboxPvrError):
    """Chaîne introuvable dans la liste Freebox."""


class PermissionMissing(FreeboxPvrError):
    """L'application n'a pas le droit nécessaire sur la Freebox."""


def normalize_channel(name: str | None) -> str:
    """Normalise un nom de chaîne : sans accent, minuscules, '+' → 'plus'."""
    if not name:
        return ""
    text = unicodedata.normalize("NFKD", name)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("+", "plus")
    text = re.sub(r"[^a-z0-9]", "", text)
    if text.endswith("hd") and len(text) > 3:
        text = text[:-2]
    return text


def parse_aliases(raw: str | None) -> dict[str, str]:
    """Lit les correspondances saisies par l'utilisateur : « Nom guide = Nom Freebox »."""
    result: dict[str, str] = {}
    for line in (raw or "").replace(";", "\n").splitlines():
        if "=" not in line:
            continue
        left, right = line.split("=", 1)
        left, right = left.strip(), right.strip()
        if left and right:
            result[normalize_channel(left)] = right
    return result


def find_channel(
    channels: dict[str, dict[str, Any]],
    name: str,
    user_aliases: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Retrouve la chaîne Freebox correspondant à un nom du guide TV."""
    available = [
        ch for ch in channels.values() if ch.get("available", True) and ch.get("uuid")
    ]
    wanted = normalize_channel(name)
    if not wanted:
        raise ChannelNotFound(name)

    # 1. Correspondance saisie par l'utilisateur (nom Freebox ou uuid)
    target = (user_aliases or {}).get(wanted)
    if target:
        if target in channels:
            return channels[target]
        wanted = normalize_channel(target)

    def _keys(ch: dict[str, Any]) -> set[str]:
        return {normalize_channel(ch.get("name")), normalize_channel(ch.get("short_name"))}

    # 2. Nom identique une fois normalisé (on préfère les chaînes avec abonnement)
    exact = [ch for ch in available if wanted in _keys(ch)]
    if exact:
        exact.sort(key=lambda ch: not ch.get("has_abo", True))
        return exact[0]

    # 3. Alias connus
    for candidate in BUILTIN_ALIASES.get(wanted, []):
        for ch in available:
            if candidate in _keys(ch):
                return ch

    # 4. Préfixe unique (ex. « RMC Découverte » ↔ « RMC Découverte HD »)
    prefix = [
        ch for ch in available if any(k.startswith(wanted) for k in _keys(ch) if k)
    ]
    if len(prefix) == 1:
        return prefix[0]

    raise ChannelNotFound(name)


@dataclass
class RecordRequest:
    """Demande d'enregistrement (heures en timestamp Unix, sans les marges)."""

    channel_uuid: str
    channel_name: str
    title: str
    start: int
    end: int
    subtitle: str | None = None
    margin_before: int = 0  # minutes
    margin_after: int = 0  # minutes
    quality: str = "auto"

    def payload(self, media: str | None, path: str | None) -> dict[str, Any]:
        """Corps de la requête POST pvr/programmed/.

        Les marges sont appliquées directement sur start/end : on envoie
        margin_before/margin_after à 0 pour éviter que la box les ajoute une 2e fois.
        """
        data: dict[str, Any] = {
            "channel_uuid": self.channel_uuid,
            "channel_name": self.channel_name,
            "channel_quality": self.quality,
            "channel_type": "",
            "broadcast_type": "tv",
            "name": self.title[:255],
            "subname": (self.subtitle or "")[:255],
            "start": int(self.start - self.margin_before * 60),
            "end": int(self.end + self.margin_after * 60),
            "margin_before": 0,
            "margin_after": 0,
        }
        if media:
            data["media"] = media
        if path:
            data["path"] = path
        return data


def find_record_for_program(
    records: list[dict[str, Any]],
    channel_uuid: str,
    program_start: int,
    program_end: int | None = None,
) -> dict[str, Any] | None:
    """Enregistrement programmé correspondant à ce programme sur cette chaîne.

    Avec la fin du programme : l'enregistrement doit en couvrir au moins la moitié
    (évite de confondre avec le programme suivant, couvert seulement par la marge).
    Sans la fin : l'enregistrement doit couvrir le début du programme.
    """
    for rec in records:
        if rec.get("channel_uuid") != channel_uuid:
            continue
        r_start, r_end = rec.get("start", 0), rec.get("end", 0)
        if program_end and program_end > program_start:
            overlap = min(r_end, program_end) - max(r_start, program_start)
            if overlap * 2 >= program_end - program_start:
                return rec
        elif r_start <= program_start + 60 and r_end > program_start:
            return rec
    return None


def sync_token_file(token_file: Path) -> bool:
    """Aligne la description stockée avec le jeton sur APP_DESC, sans toucher au jeton.

    freebox_api relance une autorisation sur l'écran du Freebox Server si la
    description enregistrée diffère de celle envoyée. Le jeton reste valable tant que
    l'identifiant de l'application est le même : la Freebox ne vérifie que app_id et
    le jeton. Renvoie True si le fichier a été réécrit.
    """
    try:
        with open(token_file, encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, ValueError):
        return False
    if not isinstance(data, dict) or not data.get("app_token") or data.get("app_id") != APP_DESC["app_id"]:
        return False
    if all(data.get(k) == v for k, v in APP_DESC.items()):
        return False
    data.update(APP_DESC)
    tmp = f"{token_file}.tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, token_file)
    return True


class FreeboxPvrClient:
    """Client minimal autour de freebox_api pour la partie TV / PVR."""

    def __init__(self, host: str, port: int, token_file: Path) -> None:
        self.host = host
        self.port = port
        self.token_file = token_file
        self._fbx: Freepybox | None = None

    async def open(self) -> None:
        """Ouvre la session (et enregistre l'application la 1re fois)."""
        if await asyncio.to_thread(sync_token_file, self.token_file):
            _LOGGER.debug("Description de l'application mise à jour dans %s (pas de nouvelle autorisation)", self.token_file)
        fbx = Freepybox(app_desc=APP_DESC, token_file=self.token_file, api_version=API_VERSION)
        try:
            await fbx.open(self.host, str(self.port))
        except Exception:
            await self._safe_close(fbx)
            raise
        self._fbx = fbx

    @staticmethod
    async def _safe_close(fbx: Freepybox) -> None:
        try:
            await fbx.close()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Fermeture de session Freebox impossible", exc_info=True)

    async def close(self) -> None:
        if self._fbx is not None:
            await self._safe_close(self._fbx)
            self._fbx = None

    @property
    def fbx(self) -> Freepybox:
        if self._fbx is None:
            raise FreeboxPvrError("Session Freebox non ouverte")
        return self._fbx

    async def _call(self, coro):
        try:
            return await coro
        except InsufficientPermissionsError as err:
            raise PermissionMissing(str(err)) from err
        except (HttpRequestError, AuthorizationError) as err:
            raise FreeboxPvrError(str(err)) from err

    async def get_permissions(self) -> dict[str, bool]:
        return await self.fbx.get_permissions() or {}

    async def get_channels(self) -> dict[str, dict[str, Any]]:
        data = await self._call(self.fbx.tv.get_tv_channels())
        return data if isinstance(data, dict) else {}

    async def get_records(self) -> list[dict[str, Any]]:
        data = await self._call(self.fbx.tv.get_programmed_tv_records())
        return data if isinstance(data, list) else []

    async def get_destination(self) -> tuple[str | None, str | None]:
        """Disque et dossier par défaut des enregistrements (si la box les donne)."""
        media = path = None
        try:
            cfg = await self._call(self.fbx.tv.get_tv_records_configuration())
            if isinstance(cfg, dict):
                media = cfg.get("media") or None
                path = cfg.get("path") or None
        except FreeboxPvrError:
            _LOGGER.debug("Configuration PVR non lisible", exc_info=True)
        if media is None:
            try:
                medias = await self._call(self.fbx.tv.get_tv_records_media_list())
                if isinstance(medias, list) and medias:
                    media = medias[0].get("media") or medias[0].get("name")
            except FreeboxPvrError:
                _LOGGER.debug("Liste des disques PVR non lisible", exc_info=True)
        return media, path

    async def create_record(
        self, request: RecordRequest, path_override: str | None = None
    ) -> dict[str, Any]:
        media, path = await self.get_destination()
        payload = request.payload(media, path_override or path or "Enregistrements")
        _LOGGER.debug("Création d'un enregistrement Freebox : %s", payload)
        result = await self._call(self.fbx.tv.create_tv_record(payload))
        return result if isinstance(result, dict) else {}

    async def update_record(self, record: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
        """Modifie un enregistrement programmé (horaires en timestamp, marges comprises ; sous-titre…)."""
        payload = {k: v for k, v in record.items() if k in EDITABLE_FIELDS}
        payload.update(changes)
        result = await self._call(self.fbx.tv.edit_programmed_tv_record(int(record["id"]), payload))
        return result if isinstance(result, dict) else {}

    async def update_record_end(self, record: dict[str, Any], new_end: int) -> dict[str, Any]:
        """Change l'heure de fin d'un enregistrement programmé (timestamp, marge comprise)."""
        return await self.update_record(record, {"end": int(new_end)})

    async def set_enabled(self, record: dict[str, Any], enabled: bool) -> dict[str, Any]:
        """Met en pause (désactive) ou reprend un enregistrement programmé, sans le supprimer."""
        return await self.update_record(record, {"enabled": bool(enabled)})

    async def stop_record(self, record: dict[str, Any], now: int) -> dict[str, Any]:
        """Arrête un enregistrement en cours en avançant sa fin à maintenant (la partie enregistrée est gardée)."""
        return await self.update_record(record, {"end": int(now), "margin_after": 0})

    async def get_finished(self) -> list[dict[str, Any]]:
        data = await self._call(self.fbx.tv.get_finished_tv_records())
        return data if isinstance(data, list) else []

    async def delete_finished(self, record_id: int) -> None:
        """Supprime un enregistrement terminé (et son fichier sur le disque)."""
        await self._call(self.fbx.tv.delete_finished_tv_record(int(record_id)))

    async def delete_record(self, record_id: int) -> None:
        await self._call(self.fbx.tv.delete_programmed_tv_record(int(record_id)))
