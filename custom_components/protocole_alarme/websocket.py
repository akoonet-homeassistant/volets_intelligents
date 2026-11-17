"""Commandes websocket utilisées par le panneau.

La lecture est ouverte à tous les utilisateurs. Les règles peuvent être modifiées
et testées par les administrateurs et par les utilisateurs qu'ils ont autorisés
(« éditeurs »). Le mode avancé (script YAML libre) et la liste des éditeurs restent
réservés aux administrateurs : un script libre peut appeler n'importe quel service.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol
import yaml
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from . import regles as R
from . import simulateur
from .const import DOMAIN, ETATS_ARMES, REGLES_MAX, SIGNAL_MAJ, VERSION
from .moteur import MESSAGE_ECHEC_DEFAUT, Moteur


YAML_MAX = 50_000  # caractères acceptés pour un script avancé


def _moteur(hass: HomeAssistant) -> Moteur | None:
    return next(iter((hass.data.get(DOMAIN) or {}).values()), None)


def _services_notification(hass: HomeAssistant) -> list[str]:
    services = [f"notify.{nom}" for nom in sorted(hass.services.async_services_for_domain("notify"))]
    services = [s for s in services if s != "notify.send_message"]
    # Entités de notification (Telegram, e-mail…) : envoyées par notify.send_message.
    # Celles de l'application mobile doublent les services notify.mobile_app_* : masquées.
    registre = er.async_get(hass)
    entites = sorted(
        e for e in hass.states.async_entity_ids("notify")
        if e not in services and getattr(registre.async_get(e), "platform", None) != "mobile_app"
    )
    return ["persistent_notification", *services, *entites]


async def _utilisateurs(hass: HomeAssistant) -> list[dict]:
    """Personnes à qui l'on peut confier les règles (comptes actifs, hors comptes système)."""
    return sorted(
        (
            {"id": u.id, "nom": u.name or u.id, "admin": u.is_admin}
            for u in await hass.auth.async_get_users()
            if u.is_active and not u.system_generated
        ),
        key=lambda u: (not u["admin"], u["nom"].lower()),
    )


async def _etat_complet(hass: HomeAssistant, moteur: Moteur, connection) -> dict[str, Any]:
    admin = connection.user.is_admin
    registre = er.async_get(hass)
    entites = []
    for entree in er.async_entries_for_config_entry(registre, moteur.entry.entry_id):
        etat = hass.states.get(entree.entity_id)
        entites.append({
            "entity_id": entree.entity_id,
            "nom": etat.name if etat else (entree.name or entree.original_name),
            "etat": etat.state if etat else None,
            "cle": entree.translation_key,
        })
    return {
        "version": VERSION,
        "admin": admin,
        "peut_modifier": moteur.peut_modifier(connection.user),
        "editeurs": moteur.editeurs if admin else [],
        "utilisateurs": await _utilisateurs(hass) if admin else [],
        "regles": moteur.regles,
        "types": moteur.types,
        "instantane": moteur.instantane(),
        "memoires": moteur.memoires_public(),
        "journal": moteur.journal,
        "entites": sorted(entites, key=lambda e: e["entity_id"]),
        "simulateur": await simulateur.async_etat(hass),
        "notifications": _services_notification(hass),
        "catalogue": R.catalogue_public(),
        "modes": ETATS_ARMES,
        "message_defaut": MESSAGE_ECHEC_DEFAUT[moteur.langue],
    }


def _avec_editeur(fonction):
    """Comme _avec_moteur, mais refuse les utilisateurs qui ne peuvent pas modifier les règles."""

    async def enveloppe(hass: HomeAssistant, connection, msg: dict) -> None:
        moteur = _moteur(hass)
        if moteur is None:
            connection.send_error(msg["id"], "non_configure", "Protocole Alarme n'est pas configuré")
            return
        if not moteur.peut_modifier(connection.user):
            connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "Unauthorized")
            return
        await fonction(hass, connection, msg, moteur)

    return enveloppe


def _script_libre_autorise(moteur: Moteur, connection, regle: dict) -> bool:
    """Un éditeur non administrateur ne peut pas écrire de script libre.

    Il peut seulement réenregistrer ou tester une règle avancée existante sans en changer le script.
    """
    if connection.user.is_admin or not regle.get("avance"):
        return True
    existante = moteur.regle(str(regle.get("id") or ""))
    return bool(existante and existante.get("avance") and existante.get("sequence") == regle.get("sequence"))


def _erreur(connection, msg, err: Exception) -> None:
    connection.send_error(msg["id"], "regle_invalide", str(err.msg if isinstance(err, vol.Invalid) else err))


@callback
def async_enregistrer(hass: HomeAssistant) -> None:
    for commande in (
        ws_etat, ws_enregistrer, ws_supprimer, ws_dupliquer, ws_activer, ws_tester, ws_actif,
        ws_vider_journal, ws_vers_yaml, ws_depuis_yaml, ws_editeurs, ws_exporter, ws_importer, ws_types, ws_carte,
    ):
        websocket_api.async_register_command(hass, commande)


def _avec_moteur(fonction):
    """Renvoie une erreur propre si l'intégration n'est pas chargée."""

    async def enveloppe(hass: HomeAssistant, connection, msg: dict) -> None:
        moteur = _moteur(hass)
        if moteur is None:
            connection.send_error(msg["id"], "non_configure", "Protocole Alarme n'est pas configuré")
            return
        await fonction(hass, connection, msg, moteur)

    return enveloppe


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/etat"})
@websocket_api.async_response
@_avec_moteur
async def ws_etat(hass, connection, msg, moteur: Moteur) -> None:
    connection.send_result(msg["id"], await _etat_complet(hass, moteur, connection))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/carte"})
@websocket_api.async_response
@_avec_moteur
async def ws_carte(hass, connection, msg, moteur: Moteur) -> None:
    """Abonnement de la carte : règles exécutées depuis le dernier armement / désarmement (lecture seule)."""
    signal = SIGNAL_MAJ.format(moteur.entry.entry_id)

    @callback
    def envoyer() -> None:
        actuel = _moteur(hass)
        if actuel is not None:
            connection.send_message(websocket_api.event_message(msg["id"], actuel.donnees_carte()))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, signal, envoyer)
    connection.send_result(msg["id"])
    envoyer()


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/enregistrer", vol.Required("regle"): dict})
@websocket_api.async_response
@_avec_editeur
async def ws_enregistrer(hass, connection, msg, moteur: Moteur) -> None:
    if not _script_libre_autorise(moteur, connection, msg["regle"]):
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "avance_admin")
        return
    try:
        regle = await moteur.async_enregistrer(msg["regle"])
    except vol.Invalid as err:
        _erreur(connection, msg, err)
        return
    connection.send_result(msg["id"], {"regle": regle})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/supprimer", vol.Required("regle_id"): str})
@websocket_api.async_response
@_avec_editeur
async def ws_supprimer(hass, connection, msg, moteur: Moteur) -> None:
    await moteur.async_supprimer(msg["regle_id"])
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/dupliquer", vol.Required("regle_id"): str,
    vol.Optional("suffixe", default="(copie)"): vol.All(str, vol.Length(max=20)),
})
@websocket_api.async_response
@_avec_editeur
async def ws_dupliquer(hass, connection, msg, moteur: Moteur) -> None:
    try:
        regle = await moteur.async_dupliquer(msg["regle_id"], msg["suffixe"])
    except vol.Invalid as err:
        _erreur(connection, msg, err)
        return
    connection.send_result(msg["id"], {"regle": regle})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/activer", vol.Required("regle_id"): str, vol.Required("actif"): bool,
})
@websocket_api.async_response
@_avec_editeur
async def ws_activer(hass, connection, msg, moteur: Moteur) -> None:
    await moteur.async_activer(msg["regle_id"], msg["actif"])
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/tester", vol.Required("regle"): dict})
@websocket_api.async_response
@_avec_editeur
async def ws_tester(hass, connection, msg, moteur: Moteur) -> None:
    """Teste une règle enregistrée ou le brouillon de l'assistant."""
    if not _script_libre_autorise(moteur, connection, msg["regle"]):
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "avance_admin")
        return
    try:
        await moteur.async_tester(msg["regle"], connection.context(msg))
    except vol.Invalid as err:
        _erreur(connection, msg, err)
        return
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/actif", vol.Required("actif"): bool})
@websocket_api.async_response
@_avec_editeur
async def ws_actif(hass, connection, msg, moteur: Moteur) -> None:
    await moteur.async_changer_actif(msg["actif"])
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/types",
    vol.Required("types"): vol.All([dict], vol.Length(max=R.TYPES_MAX)),
})
@websocket_api.async_response
@_avec_editeur
async def ws_types(hass, connection, msg, moteur: Moteur) -> None:
    """Types de règle : ajout, renommage, icône, ordre, suppression (les règles orphelines vont dans « Autres »)."""
    try:
        await moteur.async_changer_types(msg["types"])
    except vol.Invalid as err:
        _erreur(connection, msg, err)
        return
    connection.send_result(msg["id"], {"types": moteur.types, "regles": moteur.regles})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/vider_journal"})
@websocket_api.async_response
@_avec_editeur
async def ws_vider_journal(hass, connection, msg, moteur: Moteur) -> None:
    await moteur.async_vider_journal()
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/vers_yaml", vol.Required("regle"): dict})
@websocket_api.require_admin
@websocket_api.async_response
@_avec_moteur
async def ws_vers_yaml(hass, connection, msg, moteur: Moteur) -> None:
    """Actions d'une règle simple en YAML de script, pour le mode avancé."""
    try:
        sequence = moteur.sequence_yaml(msg["regle"])
    except (vol.Invalid, R.ErreurRegle) as err:
        _erreur(connection, msg, err)
        return
    texte = yaml.safe_dump(sequence, allow_unicode=True, sort_keys=False, default_flow_style=False)
    connection.send_result(msg["id"], {"yaml": texte})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/depuis_yaml", vol.Required("yaml"): vol.All(str, vol.Length(max=YAML_MAX)),
})
@websocket_api.require_admin
@websocket_api.async_response
@_avec_moteur
async def ws_depuis_yaml(hass, connection, msg, moteur: Moteur) -> None:
    """Lit et vérifie le YAML saisi en mode avancé."""
    try:
        sequence = yaml.safe_load(msg["yaml"]) or []
    except yaml.YAMLError as err:
        connection.send_error(msg["id"], "yaml_invalide", str(err))
        return
    if isinstance(sequence, dict):
        sequence = [sequence]
    if not isinstance(sequence, list) or not sequence or len(sequence) > R.SEQUENCE_MAX or not all(isinstance(e, dict) for e in sequence):
        connection.send_error(msg["id"], "yaml_invalide", "sequence_requise")
        return
    try:
        await moteur.async_valider_sequence({"avance": True, "sequence": sequence})
    except vol.Invalid as err:
        _erreur(connection, msg, err)
        return
    connection.send_result(msg["id"], {"sequence": sequence})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/editeurs",
    vol.Required("editeurs"): vol.All([str], vol.Length(max=200)),
})
@websocket_api.require_admin
@websocket_api.async_response
@_avec_moteur
async def ws_editeurs(hass, connection, msg, moteur: Moteur) -> None:
    """Liste des utilisateurs non administrateurs autorisés à modifier les règles (administrateurs seulement)."""
    connus = {u["id"] for u in await _utilisateurs(hass) if not u["admin"]}
    await moteur.async_changer_editeurs([u for u in msg["editeurs"] if u in connus])
    connection.send_result(msg["id"], {"editeurs": moteur.editeurs})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/exporter"})
@websocket_api.async_response
@_avec_editeur
async def ws_exporter(hass, connection, msg, moteur: Moteur) -> None:
    """Toutes les règles, pour un fichier de sauvegarde."""
    connection.send_result(
        msg["id"], {"application": DOMAIN, "version": VERSION, "types": moteur.types, "regles": moteur.regles}
    )


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/importer",
    vol.Required("regles"): vol.All([dict], vol.Length(min=1, max=REGLES_MAX)),
    vol.Optional("remplacer", default=False): bool,
    vol.Optional("types"): vol.All([dict], vol.Length(max=R.TYPES_MAX)),
})
@websocket_api.async_response
@_avec_editeur
async def ws_importer(hass, connection, msg, moteur: Moteur) -> None:
    """Importe un fichier de règles (tout ou rien). Les scripts avancés restent réservés aux administrateurs."""
    if not connection.user.is_admin and any(r.get("avance") for r in msg["regles"]):
        connection.send_error(msg["id"], websocket_api.ERR_UNAUTHORIZED, "avance_admin")
        return
    try:
        nouvelles = await moteur.async_importer(msg["regles"], msg["remplacer"], msg.get("types"))
    except vol.Invalid as err:
        _erreur(connection, msg, err)
        return
    connection.send_result(msg["id"], {"importees": len(nouvelles)})
