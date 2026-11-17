"""Moteur de Protocole Alarme : suit l'alarme et exécute les règles."""

from __future__ import annotations

import asyncio
import copy
import logging
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Context, Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_call_later, async_track_state_change_event
from homeassistant.helpers.script import Script, async_validate_actions_config
from homeassistant.exceptions import TemplateError
from homeassistant.helpers.storage import Store
from homeassistant.helpers.template import Template
from homeassistant.helpers.translation import async_get_translations
from homeassistant.util import dt as dt_util

from . import regles as R
from . import simulateur
from .const import (
    CONF_ALARME,
    DOMAIN,
    ETATS_ARMES,
    ETATS_AVANT_ARMEMENT,
    ETATS_AVANT_DESARMEMENT,
    EVT_ARMEMENT,
    EVT_DESARMEMENT,
    EVT_SURVEILLANCE,
    FORMAT_STOCKAGE,
    JOURNAL_MAX,
    NOM_APPAREIL,
    REGLES_MAX,
    RES_ANNULEE,
    RES_CONDITION,
    RES_ERREUR,
    RES_OK,
    RES_PAUSE,
    RES_RESTAUREE,
    RES_VERIF_ECHEC,
    RES_VERIF_OK,
    SIGNAL_MAJ,
)

_LOGGER = logging.getLogger(__name__)

EVT_TEST = "test"
# Résultats montrés sur la carte : la règle a réellement agi (ou sa vérification a abouti)
DELAI_REMISE_S = 60  # la remise en état ne bloque jamais les règles de désarmement plus longtemps
RESULTATS_CARTE = {RES_OK, RES_ERREUR, RES_VERIF_OK, RES_VERIF_ECHEC, RES_RESTAUREE}

# Message envoyé quand une vérification échoue (modifiable dans le panneau, même syntaxe)
MESSAGE_ECHEC_DEFAUT = {
    "fr": "⚠️ « {{ regle }} » : {{ entite }} est {{ etat_actuel }} au lieu de {{ etat_attendu }}.",
    "en": "⚠️ “{{ regle }}”: {{ entite }} is {{ etat_actuel }} instead of {{ etat_attendu }}.",
}


class Moteur:
    """Règles, journal et exécution."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.store: Store = Store(hass, FORMAT_STOCKAGE, f"{DOMAIN}.{entry.entry_id}")
        self.regles: list[dict] = []
        self.actif: bool = True
        self.editeurs: list[str] = []  # utilisateurs non administrateurs autorisés à modifier les règles
        self.journal: list[dict] = []
        self.dernier_mode: str | None = None
        self.derniere_execution: dict | None = None
        self.echec_verification: bool = False
        self._taches: dict[str, set[asyncio.Task]] = {EVT_ARMEMENT: set(), EVT_DESARMEMENT: set(), EVT_TEST: set()}
        self.memoires: dict[str, dict] = {}
        self._desabonner = None
        self._desabonner_surveillance = None
        self._regles_en_cours: set[str] = set()

    # ------------------------------------------------------------------ cycle de vie

    @property
    def alarme(self) -> str | None:
        return self.entry.options.get(CONF_ALARME) or self.entry.data.get(CONF_ALARME)

    async def async_demarrer(self) -> None:
        donnees = await self.store.async_load() or {}
        self.regles = [r for r in donnees.get("regles", []) if isinstance(r, dict) and r.get("id")]
        self.actif = bool(donnees.get("actif", True))
        self.editeurs = [str(u) for u in donnees.get("editeurs", []) if u]
        try:
            self.types = R.normaliser_types(donnees["types"]) if donnees.get("types") else R.types_defaut()
        except vol.Invalid:
            self.types = R.types_defaut()
        self.journal = list(donnees.get("journal", []))[:JOURNAL_MAX]
        self.dernier_mode = donnees.get("dernier_mode")
        self.arme_depuis = dt_util.parse_datetime(donnees["arme_depuis"]) if donnees.get("arme_depuis") else None
        # Dernier armement ou désarmement : la carte affiche les règles exécutées depuis
        self.dernier_evenement: dict | None = donnees.get("dernier_evenement")
        self.tolerees: set[str] = set(donnees.get("tolerees", []))
        self.derniere_execution = donnees.get("derniere_execution")
        self.echec_verification = bool(donnees.get("echec_verification", False))
        # États mémorisés à l'armement, à remettre au désarmement : {regle_id: {date, etats}}
        self.memoires: dict[str, dict] = {}
        for regle_id, memoire in (donnees.get("memoires") or {}).items():
            propre = R.memoire_valide(memoire)
            if propre and propre["etats"]:
                self.memoires[str(regle_id)] = propre
        if self._migrer():
            await self.store.async_save(self._a_sauver())
        if self.alarme:
            self._desabonner = async_track_state_change_event(self.hass, [self.alarme], self._alarme_changee)
        self._abonner_surveillance()

    def _migrer(self) -> bool:
        """Met les règles enregistrées au format courant (type de règle, actions de vérification)."""
        change = False
        for index, regle in enumerate(self.regles):
            if "categorie" in regle and "notifiers" not in (regle.get("verification") or {}):
                continue
            try:
                self.regles[index] = self._ranger(R.normaliser(regle, self.message_defaut))
                change = True
            except (vol.Invalid, ValueError) as err:
                _LOGGER.warning("Règle « %s » non convertie : %s", regle.get("nom"), err)
        return change

    async def async_arreter(self) -> None:
        if self._desabonner:
            self._desabonner()
            self._desabonner = None
        if self._desabonner_surveillance:
            self._desabonner_surveillance()
            self._desabonner_surveillance = None
        self._desabonner_surveillance = None
        self._regles_en_cours: set[str] = set()
        for taches in self._taches.values():
            for tache in list(taches):
                tache.cancel()
        await self.store.async_save(self._a_sauver())

    def _a_sauver(self) -> dict:
        return {
            "regles": self.regles,
            "actif": self.actif,
            "editeurs": self.editeurs,
            "types": self.types,
            "journal": self.journal,
            "dernier_evenement": self.dernier_evenement,
            "dernier_mode": self.dernier_mode,
            "arme_depuis": self.arme_depuis.isoformat() if self.arme_depuis else None,
            "tolerees": sorted(self.tolerees),
            "derniere_execution": self.derniere_execution,
            "echec_verification": self.echec_verification,
            "memoires": self.memoires,
        }

    @callback
    def _sauver(self) -> None:
        self.store.async_delay_save(self._a_sauver, 1)

    @callback
    def _signaler(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_MAJ.format(self.entry.entry_id))

    # ------------------------------------------------------------------ alarme

    @callback
    def _alarme_changee(self, event: Event[EventStateChangedData]) -> None:
        ancien = event.data["old_state"].state if event.data["old_state"] else None
        nouveau = event.data["new_state"].state if event.data["new_state"] else None
        evenement = evenement_alarme(ancien, nouveau)
        if evenement is None:
            return
        self.dernier_evenement = {
            "evenement": evenement, "date": dt_util.utcnow().isoformat(),
            "mode": nouveau if evenement == EVT_ARMEMENT else None,
        }
        if evenement == EVT_ARMEMENT:
            self.dernier_mode = nouveau
            self.arme_depuis = dt_util.utcnow()
            # Nouvel armement : les mémoires d'un cycle précédent (désarmé pendant un arrêt de HA) sont oubliées
            self.memoires = {}
            # Règles « ignorer si déjà vrai à l'armement » : on retient celles dont la condition est déjà vraie
            self.tolerees = {
                r["id"] for r in self.regles
                if r.get("surveiller") and r.get("tolerer") and r.get("conditions")
                and R.conditions_remplies(r, self._etat)[0]
            }
            self._sauver()
        else:
            self.arme_depuis = None
            self.tolerees = set()
            self._sauver()
        if not self.actif:
            self.memoires = {}
            self._sauver()
            self._noter(None, evenement, RES_PAUSE, "")
            return
        self.async_lancer(evenement, self.dernier_mode, Context(parent_id=event.context.id))

    @callback
    def async_lancer(self, evenement: str, mode: str | None, contexte: Context | None = None) -> None:
        """Annule les règles de l'événement inverse encore en cours, puis lance les règles concernées."""
        inverse = EVT_DESARMEMENT if evenement == EVT_ARMEMENT else EVT_ARMEMENT
        for tache in list(self._taches[inverse]):
            tache.cancel()
        if evenement == EVT_DESARMEMENT and self.memoires:
            # Remise en état d'abord, puis les règles de désarmement (qui ont ainsi le dernier mot)
            tache = self.entry.async_create_background_task(
                self.hass, self._desarmer(mode, contexte or Context()), f"{DOMAIN} remise en état"
            )
            self._taches[EVT_DESARMEMENT].add(tache)
            tache.add_done_callback(self._taches[EVT_DESARMEMENT].discard)
            return
        self._lancer_regles(evenement, mode, contexte)

    @callback
    def _lancer_regles(self, evenement: str, mode: str | None, contexte: Context | None) -> None:
        for regle in self.regles:
            if R.concerne(regle, evenement, mode):
                copie = copy.deepcopy(regle)
                if evenement == EVT_ARMEMENT:
                    self._photographier(copie)
                self._demarrer_tache(copie, evenement, mode, contexte)

    @callback
    def _photographier(self, regle: dict) -> None:
        """Photo prise avant tout service appelé (fonction synchrone) ; gardée si la règle s'exécute.

        Une règle déjà mémorisée pendant cet armement garde sa première photo (l'état d'avant l'alarme).
        """
        entites = R.entites_a_restaurer(regle)
        if entites and regle["id"] not in self.memoires:
            regle["_photo"] = R.photographier(self.hass.states.get, entites)

    async def _desarmer(self, mode: str | None, contexte: Context) -> None:
        try:
            await self.async_restaurer(contexte)
        finally:
            self._lancer_regles(EVT_DESARMEMENT, mode, contexte)

    async def async_restaurer(self, contexte: Context | None = None) -> None:
        """Remet les entités mémorisées dans leur état d'avant l'armement, puis vide la mémoire."""
        memoires, self.memoires = self.memoires, {}
        self._sauver()
        scene, comptes = R.scene_a_rejouer(memoires, self.regles)
        scene = {e: v for e, v in scene.items() if self.hass.states.get(e) is not None}
        if not scene:
            self._signaler()
            return
        try:
            async with asyncio.timeout(DELAI_REMISE_S):
                await self.hass.services.async_call(
                    "scene", "apply", {"entities": scene}, blocking=True, context=contexte or Context()
                )
        except (vol.Invalid, HomeAssistantError, ValueError, TimeoutError) as err:
            _LOGGER.warning("Remise en état au désarmement : %s", err)
            for regle_id in comptes:
                self._noter(self.regle(regle_id), EVT_DESARMEMENT, RES_ERREUR, str(err))
            return
        for regle_id, n in comptes.items():
            self._noter(self.regle(regle_id), EVT_DESARMEMENT, RES_RESTAUREE, str(n))

    def _demarrer_tache(
        self, regle: dict, evenement: str, mode: str | None, contexte: Context | None = None,
        groupe: str | None = None, declencheur: str | None = None,
    ) -> None:
        """Lance une règle en tâche de fond. groupe : ensemble annulé par l'événement inverse.

        declencheur : entité dont le changement a lancé la règle (surveillance), pour {{ entite }}.
        """
        tache = self.entry.async_create_background_task(
            self.hass, self._executer(regle, evenement, mode, contexte or Context(), declencheur),
            f"{DOMAIN} {regle['nom']}",
        )
        ensemble = self._taches[groupe or evenement]
        ensemble.add(tache)
        tache.add_done_callback(ensemble.discard)
        if regle.get("id"):
            self._regles_en_cours.add(regle["id"])
            tache.add_done_callback(lambda _t, rid=regle["id"]: self._regles_en_cours.discard(rid))

    # ------------------------------------------------------------------ surveillance pendant l'armement

    @callback
    def _abonner_surveillance(self) -> None:
        """Suit les entités des conditions des règles « surveiller aussi pendant l'armement »."""
        if self._desabonner_surveillance:
            self._desabonner_surveillance()
            self._desabonner_surveillance = None
        entites = R.entites_surveillees(self.regles)
        if entites:
            self._desabonner_surveillance = async_track_state_change_event(
                self.hass, sorted(entites), self._entite_changee
            )

    @callback
    def _entite_changee(self, event: Event[EventStateChangedData]) -> None:
        if not self.actif:
            return
        etat_alarme = self._etat(self.alarme) if self.alarme else None
        if etat_alarme not in ETATS_ARMES:
            return
        entity_id = event.data["entity_id"]
        ancien = event.data["old_state"].state if event.data["old_state"] else None
        nouveau = event.data["new_state"].state if event.data["new_state"] else None
        depuis = (dt_util.utcnow() - self.arme_depuis).total_seconds() if self.arme_depuis else None
        for regle in self.regles:
            if (
                R.concerne(regle, EVT_ARMEMENT, etat_alarme)
                and regle["id"] not in self._regles_en_cours
                and not (regle.get("grace_s") and depuis is not None and depuis < regle["grace_s"])
                and R.doit_declencher(regle, entity_id, ancien, nouveau, regle["id"] in self.tolerees, self._etat)
            ):
                copie = copy.deepcopy(regle)
                self._photographier(copie)
                self._demarrer_tache(
                    copie, EVT_SURVEILLANCE, etat_alarme,
                    Context(parent_id=event.context.id), groupe=EVT_ARMEMENT, declencheur=entity_id,
                )

    # ------------------------------------------------------------------ exécution

    def contexte_script(self) -> R.Contexte:
        entite_ls = simulateur.entite_mode(self.hass)
        return R.Contexte(
            entite_ls=entite_ls,
            options_ls=simulateur.options_mode(self.hass, entite_ls),
            alarme=self.alarme,
            entites_notify=frozenset(self.hass.states.async_entity_ids("notify")),
        )

    def _nom(self, entity_id: str | None) -> str:
        if not entity_id:
            return ""
        etat = self.hass.states.get(entity_id)
        return etat.name if etat else entity_id

    async def _lancer_script(self, regle: dict, etapes: list[dict], variables: dict, contexte: Context) -> None:
        """Valide puis exécute des étapes ; arrête proprement le script si la règle est annulée."""
        script: Script | None = None
        try:
            etapes = await async_validate_actions_config(self.hass, cv.SCRIPT_SCHEMA(etapes))
            script = Script(
                self.hass, etapes, f"{NOM_APPAREIL} : {regle['nom']}", DOMAIN,
                script_mode="parallel", max_runs=10, logger=_LOGGER,
            )
            await script.async_run(run_variables=variables, context=contexte)
        except asyncio.CancelledError:
            if script is not None:
                await script.async_stop()
            raise

    async def _executer(
        self, regle: dict, evenement: str, mode: str | None, contexte: Context, declencheur: str | None = None
    ) -> None:
        ok, detail = R.conditions_remplies(regle, self._etat)
        if not ok:
            self._noter(regle, evenement, RES_CONDITION, detail)
            return
        photo = regle.pop("_photo", None)
        if photo and regle.get("id") and regle["id"] not in self.memoires:
            self.memoires[regle["id"]] = {"date": dt_util.utcnow().isoformat(), "etats": photo}
            self._sauver()
            self._signaler()
        # {{ entite }} : l'entité qui a déclenché la règle, sinon celle de la première condition
        entite = declencheur or next((c["entity_id"] for c in regle.get("conditions") or []), None)
        variables = {
            "regle": regle["nom"], "evenement": evenement, "mode_alarme": mode,
            "entite": self._nom(entite), "entite_id": entite or "",
        }
        try:
            await self._lancer_script(regle, R.sequence_complete(regle, self.contexte_script()), variables, contexte)
        except asyncio.CancelledError:
            self._noter(regle, evenement, RES_ANNULEE, "")
            raise
        except R.ErreurRegle as err:
            self._noter(regle, evenement, RES_ERREUR, err.code)
            return
        except (vol.Invalid, HomeAssistantError, ValueError) as err:
            _LOGGER.warning("Règle « %s » : %s", regle["nom"], err)
            self._noter(regle, evenement, RES_ERREUR, str(err))
            return
        self._noter(regle, evenement, RES_OK, "")
        await self._verifier(regle, evenement, mode, contexte)

    async def _verifier(self, regle: dict, evenement: str, mode: str | None, contexte: Context) -> None:
        verif = regle.get("verification") or {}
        if not verif.get("active"):
            return
        await self._attendre(int(verif.get("delai_s") or 0))
        actuel = self._etat(verif["entity_id"])
        if actuel == verif["etat"]:
            self.echec_verification = False
            self._noter(regle, evenement, RES_VERIF_OK, "")
            return
        self.echec_verification = True
        self._noter(regle, evenement, RES_VERIF_ECHEC, f"{verif['entity_id']} = {actuel}")
        if not verif.get("actions"):
            return
        variables = {
            "regle": regle["nom"], "evenement": evenement, "mode_alarme": mode,
            **await self.variables_verification(verif, actuel),
        }
        try:
            await self._lancer_script(
                regle, R.sequence_actions(verif["actions"], self.contexte_script()), variables, contexte
            )
        except R.ErreurRegle as err:
            self._noter(regle, evenement, RES_ERREUR, err.code)
        except (vol.Invalid, HomeAssistantError, ValueError) as err:
            _LOGGER.warning("Règle « %s », actions en cas d'échec : %s", regle["nom"], err)
            self._noter(regle, evenement, RES_ERREUR, str(err))

    async def variables_verification(self, verif: dict, actuel: str | None) -> dict[str, str]:
        """Variables des actions en cas d'échec : {{ entite }}, {{ etat_actuel }}, {{ etat_attendu }}."""
        return {
            "entite": self._nom(verif["entity_id"]),
            "entite_id": verif["entity_id"],
            "etat_actuel": await self._lisible(verif["entity_id"], actuel),
            "etat_attendu": await self._lisible(verif["entity_id"], verif["etat"]),
        }

    async def _attendre(self, secondes: int) -> None:
        """Pause annulable, sur l'horloge de Home Assistant."""
        if secondes <= 0:
            return
        fin: asyncio.Future = self.hass.loop.create_future()

        @callback
        def _fini(_now) -> None:
            if not fin.done():
                fin.set_result(None)

        desabonner = async_call_later(self.hass, secondes, _fini)
        try:
            await fin
        finally:
            desabonner()

    @property
    def langue(self) -> str:
        return "fr" if str(self.hass.config.language or "").startswith("fr") else "en"

    @property
    def message_defaut(self) -> str:
        return MESSAGE_ECHEC_DEFAUT[self.langue]

    async def _lisible(self, entity_id: str, valeur: str | None) -> str:
        """État traduit comme dans Home Assistant (ex. « Ouvert » pour une porte de garage)."""
        if valeur is None:
            valeur = "unavailable"
        domaine = entity_id.split(".", 1)[0]
        etat = self.hass.states.get(entity_id)
        classe = (etat.attributes.get("device_class") if etat else None) or "_"
        try:
            traductions = await async_get_translations(self.hass, self.hass.config.language, "entity_component", [domaine])
        except HomeAssistantError:
            traductions = {}
        for cle in (
            f"component.{domaine}.entity_component.{classe}.state.{valeur}",
            f"component.{domaine}.entity_component._.state.{valeur}",
        ):
            if cle in traductions:
                return traductions[cle].lower()
        return valeur

    def _etat(self, entity_id: str) -> str | None:
        etat = self.hass.states.get(entity_id)
        return etat.state if etat else None

    # ------------------------------------------------------------------ journal

    @callback
    def _noter(self, regle: dict | None, evenement: str, resultat: str, detail: str) -> None:
        entree = {
            "date": dt_util.utcnow().isoformat(),
            "regle": regle["nom"] if regle else None,
            "regle_id": regle["id"] if regle else None,
            "evenement": evenement,
            "resultat": resultat,
            "detail": detail,
        }
        self.journal.insert(0, entree)
        del self.journal[JOURNAL_MAX:]
        if regle and resultat in (RES_OK, RES_ERREUR, RES_CONDITION):
            self.derniere_execution = entree
        self._sauver()
        self._signaler()

    async def async_vider_journal(self) -> None:
        self.journal = []
        self.echec_verification = False
        self._sauver()
        self._signaler()

    # ------------------------------------------------------------------ règles

    def regle(self, regle_id: str) -> dict | None:
        return next((r for r in self.regles if r["id"] == regle_id), None)

    async def async_valider_sequence(self, regle: dict) -> None:
        """Vérifie que Home Assistant accepte le script de la règle (mode avancé surtout)."""
        if not regle.get("avance"):
            return
        try:
            await async_validate_actions_config(self.hass, cv.SCRIPT_SCHEMA(regle["sequence"]))
        except (vol.Invalid, HomeAssistantError) as err:
            raise vol.Invalid(f"sequence_invalide: {err}") from err

    def valider_message(self, regle: dict) -> None:
        """Les messages et titres de notification sont des modèles Home Assistant : syntaxe vérifiée ici."""
        for texte in R.textes_modeles(regle):
            try:
                Template(texte, self.hass).ensure_valid()
            except TemplateError as err:
                raise vol.Invalid(f"message_invalide: {err}") from err

    async def async_enregistrer(self, brute: dict) -> dict:
        regle = self._ranger(R.normaliser(brute, self.message_defaut))
        self.valider_message(regle)
        await self.async_valider_sequence(regle)
        existante = self.regle(regle["id"])
        recharger = existante is None or existante["nom"] != regle["nom"]
        if existante is None:
            if len(self.regles) >= REGLES_MAX:
                raise vol.Invalid("trop_de_regles")
            self.regles.append(regle)
        else:
            self.regles[self.regles.index(existante)] = regle
        await self._appliquer(recharger)
        return regle

    async def async_importer(
        self, brutes: list[dict], remplacer: bool = False, types: list | None = None
    ) -> list[dict]:
        """Ajoute (ou remplace par) une liste de règles. Tout est vérifié avant de modifier quoi que ce soit.

        types : types de règle du fichier ; ceux qui n'existent pas encore sont ajoutés (avant « Autres »).
        """
        anciens_types = self.types
        if types:
            connus = {t["id"] for t in self.types}
            ajout = [t for t in R.normaliser_types(types) if t["id"] not in connus]
            fusion = [t for t in self.types if t["id"] != R.TYPE_DEFAUT] + ajout
            self.types = R.normaliser_types(fusion + [t for t in self.types if t["id"] == R.TYPE_DEFAUT])
        try:
            return await self._importer(brutes, remplacer)
        except vol.Invalid:
            self.types = anciens_types
            raise

    async def _importer(self, brutes: list[dict], remplacer: bool) -> list[dict]:
        nouvelles: list[dict] = []
        for brute in brutes:
            if not isinstance(brute, dict):
                raise vol.Invalid("regle_invalide")
            # En ajout, chaque règle importée reçoit un nouvel identifiant (pas de collision)
            regle = self._ranger(R.normaliser({**brute, "id": None} if not remplacer else brute, self.message_defaut))
            self.valider_message(regle)
            await self.async_valider_sequence(regle)
            nouvelles.append(regle)
        ids = [r["id"] for r in nouvelles]
        if len(set(ids)) != len(ids):
            raise vol.Invalid("regle_invalide: identifiants en double")
        total = len(nouvelles) + (0 if remplacer else len(self.regles))
        if total > REGLES_MAX:
            raise vol.Invalid("trop_de_regles")
        self.regles = nouvelles if remplacer else [*self.regles, *nouvelles]
        await self._appliquer(True)
        return nouvelles

    async def async_supprimer(self, regle_id: str) -> None:
        self.regles = [r for r in self.regles if r["id"] != regle_id]
        await self._appliquer(True)

    async def async_dupliquer(self, regle_id: str, suffixe: str) -> dict | None:
        source = self.regle(regle_id)
        if source is None:
            return None
        copie = copy.deepcopy(source)
        copie["id"] = None
        copie["nom"] = f"{source['nom']} {suffixe}"[:80]
        return await self.async_enregistrer(copie)

    async def async_activer(self, regle_id: str, actif: bool) -> None:
        regle = self.regle(regle_id)
        if regle is not None:
            regle["actif"] = actif
            await self._appliquer(False)

    def peut_modifier(self, utilisateur) -> bool:
        """Administrateur, ou utilisateur ajouté à la liste des éditeurs."""
        return bool(utilisateur and utilisateur.is_active and (utilisateur.is_admin or utilisateur.id in self.editeurs))

    async def async_changer_editeurs(self, editeurs: list[str]) -> None:
        self.editeurs = sorted(set(editeurs))
        await self._appliquer(False)

    def _ranger(self, regle: dict) -> dict:
        """Une règle dont le type n'existe plus va dans « Autres »."""
        if regle.get("categorie") not in {t["id"] for t in self.types}:
            regle["categorie"] = R.TYPE_DEFAUT
        return regle

    async def async_changer_types(self, types: list) -> None:
        self.types = R.normaliser_types(types)
        for regle in self.regles:
            self._ranger(regle)
        await self._appliquer(False)

    async def async_changer_actif(self, actif: bool) -> None:
        self.actif = actif
        await self._appliquer(False)

    async def async_tester(self, brute: dict, contexte: Context | None = None) -> None:
        """Exécute une règle tout de suite, sans armer l'alarme. Les conditions restent vérifiées.

        Le contexte relie les actions à l'utilisateur qui a lancé le test (journal de bord).
        """
        regle = R.normaliser(brute, self.message_defaut)
        self.valider_message(regle)
        await self.async_valider_sequence(regle)
        self._demarrer_tache(regle, EVT_TEST, self.dernier_mode, contexte)

    async def _appliquer(self, recharger: bool) -> None:
        await self.store.async_save(self._a_sauver())
        self._signaler()
        self._abonner_surveillance()
        if recharger:
            # Les entités par règle (interrupteur, bouton) suivent la liste
            self.hass.config_entries.async_schedule_reload(self.entry.entry_id)

    def sequence_yaml(self, brute: dict) -> list[dict]:
        """Script équivalent à une règle simple, pour passer en mode avancé."""
        if brute.get("avance") and brute.get("sequence"):
            return R.normaliser(brute)["sequence"]
        regle = R.normaliser({**brute, "avance": False}, self.message_defaut)
        ctx = self.contexte_script()
        if not ctx.entite_ls:
            ctx = R.Contexte("select.lights_simulator_mode", ctx.options_ls, ctx.alarme, ctx.entites_notify)
        return R.sequence_simple(regle, ctx)

    def instantane(self) -> dict[str, Any]:
        etat = self.hass.states.get(self.alarme) if self.alarme else None
        return {
            "alarme": self.alarme,
            "etat_alarme": etat.state if etat else None,
            "actif": self.actif,
            "dernier_mode": self.dernier_mode,
            "arme_depuis": self.arme_depuis.isoformat() if self.arme_depuis else None,
            "tolerees": sorted(self.tolerees),
            "derniere_execution": self.derniere_execution,
            "echec_verification": self.echec_verification,
            "en_cours": sum(len(t) for t in self._taches.values()),
        }

    def memoires_public(self) -> dict[str, dict]:
        """Pour le panneau : date de la photo et nombre d'entités, par règle."""
        return {rid: {"date": m.get("date"), "n": len(m.get("etats") or {})} for rid, m in self.memoires.items()}

    # ------------------------------------------------------------------ carte du tableau de bord

    def donnees_carte(self) -> dict:
        """Règles qui ont agi depuis le dernier armement / désarmement (pour la carte)."""
        depuis = (self.dernier_evenement or {}).get("date")
        executions = [
            {k: e.get(k) for k in ("date", "regle", "regle_id", "evenement", "resultat", "detail")}
            for e in self.journal
            if e.get("regle") and e.get("resultat") in RESULTATS_CARTE
            and e.get("evenement") != EVT_TEST and (depuis is None or e["date"] >= depuis)
        ]
        return {
            "alarme": self.alarme,
            "actif": self.actif,
            "evenement": self.dernier_evenement,
            "executions": executions[:20],
            "echec_verification": self.echec_verification,
        }


def evenement_alarme(ancien: str | None, nouveau: str | None) -> str | None:
    """Armement, désarmement ou rien, d'après le changement d'état de l'alarme.

    Le redémarrage de Home Assistant (ancien état absent ou inconnu) ne déclenche rien.
    """
    if nouveau in ETATS_ARMES and ancien in ETATS_AVANT_ARMEMENT:
        return EVT_ARMEMENT
    if nouveau == "disarmed" and ancien in ETATS_AVANT_DESARMEMENT:
        return EVT_DESARMEMENT
    return None
