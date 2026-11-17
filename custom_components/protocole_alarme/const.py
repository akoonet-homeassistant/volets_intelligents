"""Constantes de Protocole Alarme."""

from __future__ import annotations

DOMAIN = "protocole_alarme"
VERSION = "2026.11.11"
NOM_APPAREIL = "Protocole Alarme"

PANEL_URL = "protocole-alarme"
PANEL_TITLE = "Protocole Alarme"
PANEL_ICON = "mdi:shield-home"
PANEL_ELEMENT = "protocole-alarme-panel"
STATIC_URL = "/protocole_alarme_static"

SIGNAL_MAJ = f"{DOMAIN}_maj_{{}}"
FORMAT_STOCKAGE = 1
JOURNAL_MAX = 50
REGLES_MAX = 100

CONF_ALARME = "alarme"
CONF_BARRE_LATERALE = "barre_laterale"

# Moments où une règle s'exécute
EVT_ARMEMENT = "armement"
EVT_DESARMEMENT = "desarmement"
EVENEMENTS = [EVT_ARMEMENT, EVT_DESARMEMENT]
# Journal : règle lancée parce qu'une condition est devenue vraie alors que l'alarme était déjà armée
EVT_SURVEILLANCE = "surveillance"

# États « armée » d'une alarme Home Assistant
ETATS_ARMES = [
    "armed_away",
    "armed_home",
    "armed_night",
    "armed_vacation",
    "armed_custom_bypass",
]
# Un armement compte quand on vient de l'un de ces états (pas au redémarrage de HA)
ETATS_AVANT_ARMEMENT = {"disarmed", "arming"}
# Un désarmement compte quand on vient d'une alarme armée, en entrée ou déclenchée
ETATS_AVANT_DESARMEMENT = set(ETATS_ARMES) | {"pending", "triggered"}

# Résultats écrits dans le journal (traduits par le panneau)
RES_OK = "ok"
RES_CONDITION = "condition"
RES_ERREUR = "erreur"
RES_VERIF_OK = "verif_ok"
RES_VERIF_ECHEC = "verif_echec"
RES_ANNULEE = "annulee"
RES_PAUSE = "pause"
RES_RESTAUREE = "restauree"

# Lights Simulator (intégration du même auteur)
LS_DOMAINE = "lights_simulator"
LS_PROPRIETAIRE = "akoonet-homeassistant"
LS_DEPOT = "lights_simulator"
LS_LIEN_HACS = (
    "https://my.home-assistant.io/redirect/hacs_repository/"
    f"?owner={LS_PROPRIETAIRE}&repository={LS_DEPOT}&category=integration"
)
LS_LIEN_DEPOT = f"https://github.com/{LS_PROPRIETAIRE}/{LS_DEPOT}"
LS_LIEN_CONFIG = f"https://my.home-assistant.io/redirect/config_flow_start/?domain={LS_DOMAINE}"
# Ordre des options du sélecteur « Mode » de Lights Simulator : Arrêt, Auto, Forcé
LS_INDEX_MODE = {"arreter": 0, "auto": 1, "demarrer": 2}
LS_LIBELLES_MODE = {"arreter": "Arrêt", "auto": "Auto", "demarrer": "Forcé"}
