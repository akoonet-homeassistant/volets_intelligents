"""Règles : catalogue des actions, vérification des données et traduction en script Home Assistant.

Ce module ne dépend pas de l'état de Home Assistant : il est testable seul.
"""

from __future__ import annotations

import copy
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

import voluptuous as vol

from .const import ETATS_ARMES, EVENEMENTS, EVT_ARMEMENT, LS_INDEX_MODE, LS_LIBELLES_MODE

TYPE_ENTITE = "entite"
TYPE_SIMULATEUR = "simulateur"
TYPE_NOTIFICATION = "notification"
TYPE_ALARME = "alarme"  # agit sur l'alarme suivie
TYPES_ACTION = [TYPE_ENTITE, TYPE_SIMULATEUR, TYPE_NOTIFICATION, TYPE_ALARME]
ACTIONS_ALARME = {"declencher": "alarm_control_panel.alarm_trigger"}

# Notification « critique » : sonne même en mode silencieux (iOS) / canal alarme (Android)
DONNEES_CRITIQUES = {
    "push": {"sound": {"name": "default", "critical": 1, "volume": 1.0}},
    "ttl": 0,
    "priority": "high",
    "channel": "alarm_stream",
}

IMPULSION = "impulsion"
TITRE_DEFAUT = "Protocole Alarme"
MESSAGE_ECHEC_FR = "⚠️ « {{ regle }} » : {{ entite }} est {{ etat_actuel }} au lieu de {{ etat_attendu }}."

# Types de règle (classement dans le panneau) : types d'origine, traduits dans le panneau
CATEGORIES = ["volets", "intrusion", "acces", "lumieres", "chauffage", "notifications", "autres"]
ICONES_CATEGORIES = {
    "volets": "mdi:window-shutter", "intrusion": "mdi:alarm-light", "acces": "mdi:garage-variant",
    "lumieres": "mdi:lightbulb-group", "chauffage": "mdi:thermostat", "notifications": "mdi:bell-ring",
    "autres": "mdi:shape-outline",
}
TYPE_DEFAUT = "autres"  # ne peut pas être supprimé
TYPES_MAX = 30
_RE_TYPE = re.compile(r"^[\da-z_]{1,32}$")
_RE_ICONE = re.compile(r"^mdi:[\da-z-]{1,64}$")


@dataclass(frozen=True)
class Contexte:
    """Ce que Home Assistant sait au moment de construire le script."""

    entite_ls: str | None = None  # sélecteur « Mode » de Lights Simulator
    options_ls: list | None = None
    alarme: str | None = None  # alarme suivie
    entites_notify: frozenset[str] = field(default_factory=frozenset)  # entités notify.* (Telegram…)

_ONOFF = {"allumer": ("turn_on", ()), "eteindre": ("turn_off", ())}
_ONOFF_IMPULSION = {**_ONOFF, IMPULSION: ("", ("duree",))}

# domaine → action → (service, paramètres réglables)
CATALOGUE: dict[str, dict[str, tuple[str, tuple[str, ...]]]] = {
    "cover": {
        "fermer": ("close_cover", ()),
        "ouvrir": ("open_cover", ()),
        "position": ("set_cover_position", ("position",)),
        "stop": ("stop_cover", ()),
    },
    "light": {"allumer": ("turn_on", ("luminosite",)), "eteindre": ("turn_off", ())},
    "switch": _ONOFF_IMPULSION,
    "input_boolean": _ONOFF_IMPULSION,
    "fan": _ONOFF,
    "siren": _ONOFF,
    "button": {"appuyer": ("press", ())},
    "input_button": {"appuyer": ("press", ())},
    "lock": {"verrouiller": ("lock", ()), "deverrouiller": ("unlock", ())},
    "climate": {
        "preset": ("set_preset_mode", ("preset",)),
        "temperature": ("set_temperature", ("temperature",)),
        "eteindre": ("turn_off", ()),
    },
    "media_player": {"eteindre": ("turn_off", ()), "pause": ("media_pause", ())},
    "scene": {"activer": ("turn_on", ())},
    "script": {"lancer": ("turn_on", ())},
    "automation": {
        "declencher": ("trigger", ()),
        "activer": ("turn_on", ()),
        "desactiver": ("turn_off", ()),
    },
    "select": {"choisir": ("select_option", ("option",))},
    "input_select": {"choisir": ("select_option", ("option",))},
    "valve": {"fermer": ("close_valve", ()), "ouvrir": ("open_valve", ())},
}

ACTIONS_SIMULATEUR = list(LS_INDEX_MODE)  # demarrer, auto, arreter

# paramètre → (validation, clé de données du service, obligatoire)
PARAMETRES: dict[str, tuple[Any, str | None, bool]] = {
    "position": (vol.All(vol.Coerce(int), vol.Range(min=0, max=100)), "position", True),
    "luminosite": (vol.All(vol.Coerce(int), vol.Range(min=1, max=100)), "brightness_pct", False),
    "preset": (vol.All(str, vol.Length(min=1)), "preset_mode", True),
    "temperature": (vol.All(vol.Coerce(float), vol.Range(min=0, max=40)), "temperature", True),
    "option": (vol.All(str, vol.Length(min=1)), "option", True),
    "duree": (vol.All(vol.Coerce(float), vol.Range(min=0.2, max=60)), None, True),
}

DUREE_IMPULSION_DEFAUT = 1.0
SEQUENCE_MAX = 100  # étapes d'un script avancé


class ErreurRegle(Exception):
    """Règle impossible à exécuter ; le code est traduit par le panneau."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


def catalogue_public() -> dict[str, dict[str, list[str]]]:
    """Catalogue envoyé au panneau : domaine → action → paramètres."""
    return {
        domaine: {action: list(params) for action, (_service, params) in actions.items()}
        for domaine, actions in CATALOGUE.items()
    }


def _domaine(entity_id: str) -> str:
    return entity_id.split(".", 1)[0]


# Mêmes règles que Home Assistant : domaine.objet, minuscules, chiffres et « _ »
_RE_ENTITE = re.compile(r"^(?!.+__)(?!_)[\da-z_]+(?<!_)\.(?!_)[\da-z_]+(?<!_)$")
_RE_NOTIFY = re.compile(r"^notify\.[\da-z_]+$")  # service notify.x ou entité notify.x
_RE_ID = re.compile(r"^[\da-z]{1,32}$")


def _entity_id(valeur: Any) -> str:
    valeur = str(valeur or "").strip().lower()
    if len(valeur) > 255 or not _RE_ENTITE.match(valeur):
        raise vol.Invalid("entite_invalide")
    return valeur


def _identifiant(valeur: Any) -> str | None:
    """Identifiant de règle : uniquement lettres minuscules et chiffres (il finit dans le HTML du panneau)."""
    if valeur in (None, ""):
        return None
    valeur = str(valeur)
    if not _RE_ID.match(valeur):
        raise vol.Invalid("regle_invalide")
    return valeur


def _texte(longueur_max: int, obligatoire: bool = True):
    def valider(valeur: Any) -> str:
        texte = str(valeur if valeur is not None else "").strip()
        if obligatoire and not texte:
            raise vol.Invalid("texte_requis")
        return texte[:longueur_max]

    return valider


def _secondes(maximum: int):
    return vol.All(vol.Coerce(int), vol.Range(min=0, max=maximum))


SCHEMA_CONDITION = vol.Schema(
    {vol.Required("entity_id"): _entity_id, vol.Required("etat"): _texte(100)},
    extra=vol.REMOVE_EXTRA,
)

SCHEMA_VERIFICATION = vol.Schema(
    {
        vol.Optional("active", default=False): bool,
        vol.Optional("delai_s", default=45): _secondes(3600),
        vol.Optional("entity_id"): vol.Any(None, _entity_id),
        vol.Optional("etat"): vol.Any(None, _texte(100, obligatoire=False)),
        vol.Optional("notifier"): vol.Any(None, _texte(120, obligatoire=False)),
        vol.Optional("notifiers", default=list): [_texte(120)],
        vol.Optional("message"): vol.Any(None, _texte(500, obligatoire=False)),
        vol.Optional("actions", default=list): vol.All([dict], vol.Length(max=20)),  # en cas d'échec
    },
    extra=vol.REMOVE_EXTRA,
)

# « Remettre l'état au désarmement » : domaines dont l'état se rejoue avec scene.apply.
# Les serrures sont exclues volontairement : on ne déverrouille jamais une porte automatiquement.
DOMAINES_RESTAURABLES = frozenset({
    "light", "switch", "cover", "climate", "fan", "media_player", "input_boolean", "valve", "siren",
    "humidifier", "water_heater", "select", "input_select", "input_number", "number", "automation",
})
RESTAURER_MAX = 100
# Attributs utiles par domaine (ceux que Home Assistant sait rejouer)
ATTRIBUTS_RESTAURES = {
    "light": ("brightness", "color_mode", "color_temp_kelvin", "hs_color", "rgb_color", "rgbw_color", "rgbww_color", "xy_color", "effect"),
    "cover": ("current_position", "current_tilt_position"),
    "valve": ("current_position",),
    "climate": ("temperature", "target_temp_high", "target_temp_low", "preset_mode", "fan_mode", "swing_mode", "humidity"),
    "fan": ("percentage", "preset_mode", "direction", "oscillating"),
    "media_player": ("volume_level", "is_volume_muted", "source", "sound_mode"),
    "humidifier": ("humidity", "mode"),
    "water_heater": ("temperature", "away_mode"),
}


def _entite_restaurable(valeur: Any) -> str:
    entity_id = _entity_id(valeur)
    if _domaine(entity_id) not in DOMAINES_RESTAURABLES:
        raise vol.Invalid("restaurer_domaine")
    return entity_id


SCHEMA_RESTAURER = vol.Schema(
    {
        vol.Optional("active", default=False): bool,
        vol.Optional("entites", default=list): vol.All([_entite_restaurable], vol.Length(max=RESTAURER_MAX)),
    },
    extra=vol.REMOVE_EXTRA,
)

SCHEMA_REGLE = vol.Schema(
    {
        vol.Optional("id"): _identifiant,
        vol.Required("nom"): _texte(80),
        vol.Optional("actif", default=True): bool,
        vol.Required("evenement"): vol.In(EVENEMENTS),
        vol.Optional("modes", default=list): [vol.In(ETATS_ARMES)],
        vol.Optional("conditions", default=list): [SCHEMA_CONDITION],
        vol.Optional("actions", default=list): vol.All([dict], vol.Length(max=50)),
        vol.Optional("delai_s", default=0): _secondes(3600),
        vol.Optional("surveiller", default=False): bool,
        vol.Optional("grace_s", default=0): _secondes(600),
        vol.Optional("tolerer", default=False): bool,
        vol.Optional("tolerer_si", default=None): vol.Any(None, SCHEMA_CONDITION),
        vol.Optional("categorie", default=None): vol.Any(None, vol.Match(_RE_TYPE)),
        vol.Optional("verification", default=None): vol.Any(None, SCHEMA_VERIFICATION),
        vol.Optional("restaurer", default=None): vol.Any(None, SCHEMA_RESTAURER),
        vol.Optional("avance", default=False): bool,
        vol.Optional("sequence", default=list): vol.All([dict], vol.Length(max=SEQUENCE_MAX)),
    },
    extra=vol.REMOVE_EXTRA,
)


def _service_notification(valeur: Any) -> str:
    service = _texte(120)(valeur)
    if service != "persistent_notification" and not _RE_NOTIFY.match(service):
        raise vol.Invalid("notification_invalide")
    return service


def services_notification(*sources: Any) -> list[str]:
    """Liste sans doublon des destinataires (ancien champ unique ou nouvelle liste)."""
    services: list[str] = []
    for source in sources:
        for valeur in source if isinstance(source, list) else [source]:
            if valeur and valeur not in services:
                services.append(_service_notification(valeur))
    return services


def normaliser_action(brute: dict) -> dict:
    """Vérifie une action du mode simple et ne garde que les paramètres utiles."""
    if not isinstance(brute, dict):
        raise vol.Invalid("action_invalide")
    type_action = brute.get("type", TYPE_ENTITE)
    nom_action = str(brute.get("action") or "")
    params_bruts = brute.get("params") or {}
    if not isinstance(params_bruts, dict):
        raise vol.Invalid("action_invalide")

    if type_action == TYPE_ALARME:
        if nom_action not in ACTIONS_ALARME:
            raise vol.Invalid("action_inconnue")
        return {"type": TYPE_ALARME, "action": nom_action, "params": {}}

    if type_action == TYPE_SIMULATEUR:
        if nom_action not in ACTIONS_SIMULATEUR:
            raise vol.Invalid("action_inconnue")
        return {"type": TYPE_SIMULATEUR, "action": nom_action, "params": {}}

    if type_action == TYPE_NOTIFICATION:
        services = services_notification(brute.get("services") or [], brute.get("service"))
        if not services:
            raise vol.Invalid("notification_invalide")
        return {
            "type": TYPE_NOTIFICATION,
            "services": services,
            "action": "envoyer",
            "params": {
                "message": _texte(500)(params_bruts.get("message")),
                "titre": _texte(120, obligatoire=False)(params_bruts.get("titre")),
                "critique": bool(params_bruts.get("critique", False)),
            },
        }

    if type_action != TYPE_ENTITE:
        raise vol.Invalid("action_invalide")
    entity_id = _entity_id(brute.get("entity_id"))
    actions = CATALOGUE.get(_domaine(entity_id))
    if actions is None:
        raise vol.Invalid("domaine_non_gere")
    if nom_action not in actions:
        raise vol.Invalid("action_inconnue")
    params: dict[str, Any] = {}
    for nom_param in actions[nom_action][1]:
        valider, _cle, obligatoire = PARAMETRES[nom_param]
        valeur = params_bruts.get(nom_param)
        if valeur in (None, ""):
            if nom_param == "duree":
                params[nom_param] = DUREE_IMPULSION_DEFAUT
            elif obligatoire:
                raise vol.Invalid("parametre_requis")
            continue
        try:
            params[nom_param] = valider(valeur)
        except vol.Invalid as err:
            raise vol.Invalid("parametre_invalide") from err
    return {"type": TYPE_ENTITE, "entity_id": entity_id, "action": nom_action, "params": params}


def categorie_auto(regle: dict) -> str:
    """Type proposé d'après les actions (le panneau permet de le changer)."""
    actions = regle.get("actions") or []
    types = {a.get("type") for a in actions}
    domaines = {_domaine(a["entity_id"]) for a in actions if a.get("type") == TYPE_ENTITE and a.get("entity_id")}
    if regle.get("avance") or not actions:
        return "autres"
    if TYPE_ALARME in types:
        return "intrusion"
    if "cover" in domaines:
        return "volets"
    if "light" in domaines or TYPE_SIMULATEUR in types:
        return "lumieres"
    if "lock" in domaines or any(a.get("action") == IMPULSION for a in actions):
        return "acces"
    if "climate" in domaines:
        return "chauffage"
    if types == {TYPE_NOTIFICATION}:
        return "notifications"
    return "autres"


def _migrer_verification(verif: dict, message_defaut: str | None) -> None:
    """Ancien format : liste « Prévenir » + message → action de notification (2026.11.8)."""
    services = services_notification(verif.pop("notifiers", None) or [], verif.pop("notifier", None))
    message = verif.pop("message", None)
    if services and not verif.get("actions"):
        verif["actions"] = [{
            "type": TYPE_NOTIFICATION,
            "services": services,
            "action": "envoyer",
            "params": {"message": message or message_defaut or MESSAGE_ECHEC_FR, "titre": TITRE_DEFAUT, "critique": False},
        }]


def normaliser(brute: dict, message_defaut: str | None = None) -> dict:
    """Vérifie une règle envoyée par le panneau. Lève vol.Invalid avec un code.

    message_defaut : message d'échec utilisé pour convertir l'ancien format de vérification.
    """
    try:
        regle = SCHEMA_REGLE(copy.deepcopy(brute))
    except vol.MultipleInvalid as err:
        premiere = err.errors[0]
        raise vol.Invalid(str(premiere.msg if premiere.msg in _CODES else "regle_invalide")) from err
    regle["id"] = regle.get("id") or uuid.uuid4().hex[:12]
    regle["modes"] = [m for m in ETATS_ARMES if m in set(regle["modes"])]
    regle["actions"] = [normaliser_action(a) for a in regle["actions"]]
    if regle["avance"]:
        if not regle["sequence"]:
            raise vol.Invalid("sequence_requise")
    else:
        regle["sequence"] = []
        if not regle["actions"]:
            raise vol.Invalid("action_requise")
    if regle["surveiller"]:
        if regle["evenement"] != EVT_ARMEMENT:
            regle["surveiller"] = False
        elif not regle["conditions"]:
            raise vol.Invalid("surveiller_condition")
    if not (regle["surveiller"] and regle["tolerer"]):
        regle["tolerer_si"] = None
    if not regle["surveiller"]:
        regle["tolerer"] = False
        regle["grace_s"] = 0
    regle["categorie"] = regle["categorie"] or categorie_auto(regle)
    restaurer = regle["restaurer"] or {}
    if regle["evenement"] == EVT_ARMEMENT and restaurer.get("active"):
        entites = list(dict.fromkeys(restaurer["entites"]))
        if not entites:
            raise vol.Invalid("restaurer_vide")
        regle["restaurer"] = {"active": True, "entites": entites}
    else:
        regle["restaurer"] = {"active": False, "entites": []}
    verif = regle["verification"]
    if verif:
        _migrer_verification(verif, message_defaut)
        verif["actions"] = [normaliser_action(a) for a in verif["actions"]]
    if verif and verif["active"] and not (verif.get("entity_id") and verif.get("etat")):
        raise vol.Invalid("verification_incomplete")
    return regle


def textes_modeles(regle: dict) -> list[str]:
    """Messages et titres de notification (modèles Home Assistant) à vérifier avant d'enregistrer."""
    actions = [*(regle.get("actions") or []), *((regle.get("verification") or {}).get("actions") or [])]
    return [
        texte
        for a in actions if a.get("type") == TYPE_NOTIFICATION
        for texte in (a["params"].get("message"), a["params"].get("titre")) if texte
    ]


_CODES = {"texte_requis", "entite_invalide", "action_invalide", "action_inconnue", "regle_invalide", "restaurer_domaine"}


def sequence_actions(actions: list[dict], ctx: Contexte | None = None) -> list[dict]:
    """Traduit des actions du mode simple en étapes de script Home Assistant."""
    ctx = ctx or Contexte()
    etapes: list[dict] = []
    for action in actions:
        etapes.extend(_etapes_action(action, ctx))
    return etapes


def sequence_simple(regle: dict, ctx: Contexte | None = None) -> list[dict]:
    return sequence_actions(regle["actions"], ctx)


def sequence_complete(regle: dict, ctx: Contexte | None = None) -> list[dict]:
    """Script complet de la règle : délai éventuel puis actions (simples ou avancées)."""
    etapes: list[dict] = []
    if regle.get("delai_s"):
        etapes.append({"delay": {"seconds": int(regle["delai_s"])}})
    if regle.get("avance"):
        etapes.extend(copy.deepcopy(regle["sequence"]))
    else:
        etapes.extend(sequence_simple(regle, ctx))
    return etapes


def _etapes_action(action: dict, ctx: Contexte) -> list[dict]:
    type_action = action["type"]
    if type_action == TYPE_ALARME:
        if not ctx.alarme:
            raise ErreurRegle("alarme_absente")
        return [_appel(ACTIONS_ALARME[action["action"]], ctx.alarme)]
    if type_action == TYPE_SIMULATEUR:
        if not ctx.entite_ls:
            raise ErreurRegle("simulateur_absent")
        index = LS_INDEX_MODE[action["action"]]
        options = ctx.options_ls
        option = options[index] if options and len(options) > index else LS_LIBELLES_MODE[action["action"]]
        return [_appel("select.select_option", ctx.entite_ls, {"option": option})]

    if type_action == TYPE_NOTIFICATION:
        params = action["params"]
        donnees = {"message": params["message"]}
        if params.get("titre"):
            donnees["title"] = params["titre"]
        services = action.get("services") or [action["service"]]
        etapes = []
        for service in services:
            if service in ctx.entites_notify:
                # Entité de notification (Telegram…) : notify.send_message, sans options propres aux téléphones
                etapes.append(_appel("notify.send_message", service, dict(donnees)))
                continue
            donnees_service = dict(donnees)
            if params.get("critique") and service != "persistent_notification":
                donnees_service["data"] = copy.deepcopy(DONNEES_CRITIQUES)
            etapes.append({
                "action": "persistent_notification.create" if service == "persistent_notification" else service,
                "data": donnees_service,
                "continue_on_error": True,
            })
        return etapes

    entity_id = action["entity_id"]
    domaine = _domaine(entity_id)
    if action["action"] == IMPULSION:
        duree = float(action["params"].get("duree", DUREE_IMPULSION_DEFAUT))
        return [
            _appel(f"{domaine}.turn_on", entity_id),
            {"delay": {"milliseconds": round(duree * 1000)}},
            _appel(f"{domaine}.turn_off", entity_id),
        ]
    service, noms_params = CATALOGUE[domaine][action["action"]]
    donnees = {}
    for nom_param in noms_params:
        if nom_param in action["params"]:
            donnees[PARAMETRES[nom_param][1]] = action["params"][nom_param]
    return [_appel(f"{domaine}.{service}", entity_id, donnees)]


def _appel(service: str, entity_id: str, donnees: dict | None = None) -> dict:
    etape: dict[str, Any] = {"action": service, "target": {"entity_id": entity_id}, "continue_on_error": True}
    if donnees:
        etape["data"] = donnees
    return etape


def concerne(regle: dict, evenement: str, mode: str | None) -> bool:
    """La règle doit-elle s'exécuter pour cet événement et ce mode d'alarme ?"""
    if not regle.get("actif", True) or regle.get("evenement") != evenement:
        return False
    modes = regle.get("modes") or []
    return not modes or mode in modes


def conditions_remplies(regle: dict, lire_etat) -> tuple[bool, str]:
    """Toutes les conditions sont-elles remplies ? lire_etat(entity_id) → état ou None.

    Renvoie aussi la première condition non remplie (« entité : état actuel »).
    """
    for condition in regle.get("conditions") or []:
        actuel = lire_etat(condition["entity_id"])
        if actuel != condition["etat"]:
            return False, f"{condition['entity_id']} = {actuel}"
    return True, ""


ETATS_INCONNUS = {None, "unknown", "unavailable"}


def entites_surveillees(regles: list[dict]) -> set[str]:
    """Entités des conditions des règles qui surveillent aussi pendant l'armement."""
    entites: set[str] = set()
    for r in regles:
        if r.get("actif", True) and r.get("surveiller") and r.get("evenement") == EVT_ARMEMENT:
            entites.update(c["entity_id"] for c in r.get("conditions") or [])
            if r.get("tolerer") and r.get("tolerer_si"):
                entites.add(r["tolerer_si"]["entity_id"])
    return entites


def declenchee_pendant(regle: dict, entity_id: str, ancien: str | None, nouveau: str | None) -> bool:
    """Une condition de la règle vient-elle de devenir vraie (vrai changement, pas un retour d'indisponibilité) ?"""
    if not regle.get("surveiller") or ancien in ETATS_INCONNUS or ancien == nouveau:
        return False
    return any(c["entity_id"] == entity_id and c["etat"] == nouveau for c in regle.get("conditions") or [])


def tolerance_tient(regle: dict, lire_etat) -> bool:
    """« Tolérer seulement si… » : la condition de tolérance est-elle vraie (toujours vrai sans condition) ?"""
    si = regle.get("tolerer_si") if regle.get("tolerer") else None
    return si is None or lire_etat(si["entity_id"]) == si["etat"]


def doit_declencher(regle: dict, entity_id: str, ancien: str | None, nouveau: str | None, toleree: bool, lire_etat) -> bool:
    """Pendant l'armement : la règle doit-elle s'exécuter après ce changement d'état ?

    toleree : la condition de la règle était déjà vraie à l'armement et « ignorer si déjà le cas » est coché.
    """
    if not regle.get("surveiller"):
        return False
    if declenchee_pendant(regle, entity_id, ancien, nouveau):
        return not toleree or not tolerance_tient(regle, lire_etat)
    si = regle.get("tolerer_si") if regle.get("tolerer") else None
    if toleree and si and entity_id == si["entity_id"] and ancien == si["etat"] and nouveau != si["etat"]:
        # La tolérance tombe (ex. volet rouvert alors que la fenêtre est ouverte)
        return nouveau not in ETATS_INCONNUS and conditions_remplies(regle, lire_etat)[0]
    return False


SCHEMA_TYPE = vol.Schema(
    {
        vol.Required("id"): vol.Match(_RE_TYPE),
        vol.Optional("nom", default=None): vol.Any(None, _texte(40, obligatoire=False)),
        vol.Optional("icone", default="mdi:shape-outline"): vol.Match(_RE_ICONE),
    },
    extra=vol.REMOVE_EXTRA,
)


def types_defaut() -> list[dict]:
    return [{"id": c, "nom": None, "icone": ICONES_CATEGORIES[c]} for c in CATEGORIES]


def normaliser_types(liste: list) -> list[dict]:
    """Types de règle (ordre conservé). Lève vol.Invalid avec un code."""
    if not isinstance(liste, list) or len(liste) > TYPES_MAX:
        raise vol.Invalid("types_invalides")
    types: list[dict] = []
    vus: set[str] = set()
    for brut in liste:
        t = SCHEMA_TYPE(brut)
        if t["id"] in vus:
            raise vol.Invalid("types_invalides")
        nom = (t["nom"] or "").strip() or None
        if nom is None and t["id"] not in CATEGORIES:
            raise vol.Invalid("type_sans_nom")  # un type créé doit avoir un nom
        vus.add(t["id"])
        types.append({"id": t["id"], "nom": nom, "icone": t["icone"]})
    if TYPE_DEFAUT not in vus:
        types.append({"id": TYPE_DEFAUT, "nom": None, "icone": ICONES_CATEGORIES[TYPE_DEFAUT]})
    return types


# ---------------------------------------------------------------- remise en état au désarmement


def entites_a_restaurer(regle: dict) -> list[str]:
    """Entités dont l'état est mémorisé avant que la règle agisse (règles d'armement seulement)."""
    r = regle.get("restaurer") or {}
    if regle.get("evenement") != EVT_ARMEMENT or not r.get("active"):
        return []
    return [e for e in r.get("entites") or [] if _domaine(e) in DOMAINES_RESTAURABLES]


def _valeur_json(valeur: Any) -> Any:
    """Attribut enregistrable sur disque (les tuples deviennent des listes, le reste est écarté)."""
    if isinstance(valeur, (str, int, float, bool)) or valeur is None:
        return valeur
    if isinstance(valeur, (list, tuple)) and len(valeur) <= 5 and all(isinstance(v, (int, float)) for v in valeur):
        return list(valeur)
    return None


def photographier(lire, entites: list[str]) -> dict[str, dict]:
    """État et attributs utiles de chaque entité. lire(entity_id) -> State | None.

    Les entités absentes, inconnues ou indisponibles sont ignorées : il n'y aurait rien de fiable à remettre.
    """
    photo: dict[str, dict] = {}
    for entity_id in entites:
        etat = lire(entity_id)
        if etat is None or etat.state in ("unknown", "unavailable"):
            continue
        attributs = {}
        for cle in ATTRIBUTS_RESTAURES.get(_domaine(entity_id), ()):
            valeur = _valeur_json(etat.attributes.get(cle))
            if valeur is not None:
                attributs[cle] = valeur
        photo[entity_id] = {"state": str(etat.state)[:255], "attributes": attributs}
    return photo


def memoire_valide(memoire: Any) -> dict | None:
    """Relit une mémoire enregistrée sur disque ; renvoie None si elle est abîmée."""
    if not isinstance(memoire, dict) or not isinstance(memoire.get("etats"), dict):
        return None
    etats: dict[str, dict] = {}
    for entity_id, valeur in list(memoire["etats"].items())[:RESTAURER_MAX]:
        try:
            entity_id = _entite_restaurable(entity_id)
        except vol.Invalid:
            continue
        if not isinstance(valeur, dict) or not isinstance(valeur.get("state"), str):
            continue
        attributs = valeur.get("attributes") if isinstance(valeur.get("attributes"), dict) else {}
        permis = ATTRIBUTS_RESTAURES.get(_domaine(entity_id), ())
        etats[entity_id] = {
            "state": valeur["state"][:255],
            "attributes": {k: v for k, v in attributs.items() if k in permis and _valeur_json(v) is not None},
        }
    return {"date": str(memoire.get("date") or ""), "etats": etats}


def scene_a_rejouer(memoires: dict[str, dict], regles: list[dict]) -> tuple[dict[str, dict], dict[str, int]]:
    """Entités à passer à scene.apply et nombre d'entités remises par règle.

    Seules comptent les règles qui existent encore avec l'option active, et les entités encore dans leur liste.
    Une entité mémorisée par plusieurs règles reprend l'état de la mémoire la plus ancienne.
    """
    par_id = {r["id"]: r for r in regles if r.get("id")}
    scene: dict[str, dict] = {}
    comptes: dict[str, int] = {}
    for regle_id, memoire in sorted(memoires.items(), key=lambda m: m[1].get("date") or ""):
        regle = par_id.get(regle_id)
        voulues = set(entites_a_restaurer(regle)) if regle else set()
        n = 0
        for entity_id, valeur in memoire.get("etats", {}).items():
            if entity_id not in voulues:
                continue
            n += 1
            scene.setdefault(entity_id, {"state": valeur["state"], **valeur.get("attributes", {})})
        if n:
            comptes[regle_id] = n
    return scene, comptes
