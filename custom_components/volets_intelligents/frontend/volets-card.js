/*
 * Volets Intelligents — carte Lovelace (custom element
 * `volets-intelligents-card`).
 *
 * Contrat de données : docs/API.md. JavaScript pur, module ES, sans
 * dépendance. Le DOM est construit avec createElement/textContent : aucune
 * donnée dynamique n'est interprétée comme du HTML.
 */

const WS = "volets_intelligents/";

/* Traductions (fr complet, en complet ; langue = hass.language, repli fr). */
const I18N = {
  fr: {
    "card.loading": "Chargement…",
    "card.unavailable": "Statut indisponible",
    "card.retry": "Réessayer",
    "card.interrupted": "Abonnement interrompu : {error}",
    "card.noCovers": "Aucun volet configuré.",
    "card.cmdFailed": "Commande impossible : {error}",
    "card.badTitle": "Le paramètre « title » doit être une chaîne de caractères.",
    "card.description": "Mode, scénario et état des volets gérés par Volets Intelligents.",
    "card.pause": "Pause",
    "card.resume": "Reprendre",
    "card.pauseAria": "Mettre en pause {name}",
    "card.resumeAria": "Reprendre {name}",
    "card.openAria": "Ouvrir le contrôle de {name}",
    "card.other": "Autres volets",
    "card.collapsible": "Façades repliables",
    "card.count": "{n} volets",
    "card.count1": "1 volet",
    "card.protected": "protégé",
    "card.toggleAria": "Afficher ou masquer les volets de {name}",
    "card.facadeNow": "au soleil",
    "card.facadeNever": "pas de soleil aujourd'hui",
    "card.reopenAt": "Remonte au plus tard vers {time}",
    "card.solar": "Protection solaire",
    "card.open": "Ouverture horaire",
    "card.close": "Fermeture horaire",
    "card.solarShort": "S",
    "card.openShort": "O",
    "card.closeShort": "F",
    "card.flagAria": "{what} de {name} : {state}",
    "card.on": "activée",
    "card.off": "désactivée",
    "card.badConfig": "Paramètre « {key} » invalide : {expected}.",
    "editor.title": "Titre",
    "editor.show": "Fonctions affichées pour chaque volet",
    "editor.order": "Ordre des volets",
    "editor.orderHint": "Les volets non listés viennent après, dans l'ordre d'origine.",
    "editor.up": "Monter",
    "editor.down": "Descendre",
    "editor.reset": "Ordre d'origine",
    "editor.scenarios": "Scénarios proposés",
    "editor.loading": "Chargement des volets…",
    "err.notInstalled": "L'intégration « Volets Intelligents » n'est pas installée ou n'est pas démarrée.",
    "err.unknown": "Erreur inconnue.",
    "err.unauthorized": "Vous n'avez pas le droit d'effectuer cette action",
    "mode.group": "Mode global",
    "mode.auto": "Auto",
    "mode.manual": "Manuel",
    "mode.off": "Arrêt",
    "scenario.group": "Scénario",
    "scenario.summer": "Été",
    "scenario.winter": "Hiver",
    "scenario.vacation": "Vacances",
    "scenario.off": "Désactivé",
    "status.disabled": "Désactivé",
    "status.mode_manual": "Mode manuel",
    "status.mode_off": "Arrêté",
    "status.scenario_off": "Scénario désactivé",
    "status.grace": "Démarrage",
    "status.outside_window": "Hors plage",
    "status.no_data": "Données manquantes",
    "status.paused": "En pause",
    "status.window_open": "Fenêtre ouverte",
    "status.schedule": "Horaire",
    "status.wind_protected": "Protégé du vent",
    "status.shaded": "Protégé du soleil",
    "status.watching": "Surveillance",
    "status.cooldown": "Anti-usure",
    "status.unavailable": "Indisponible",
  },
  en: {
    "card.loading": "Loading…",
    "card.unavailable": "Status unavailable",
    "card.retry": "Retry",
    "card.interrupted": "Subscription interrupted: {error}",
    "card.noCovers": "No shutters configured.",
    "card.cmdFailed": "Command failed: {error}",
    "card.badTitle": "The “title” parameter must be a string.",
    "card.description": "Mode, scenario and state of the shutters managed by Volets Intelligents.",
    "card.pause": "Pause",
    "card.resume": "Resume",
    "card.pauseAria": "Pause {name}",
    "card.resumeAria": "Resume {name}",
    "card.openAria": "Open controls for {name}",
    "card.other": "Other shutters",
    "card.collapsible": "Collapsible facades",
    "card.count": "{n} shutters",
    "card.count1": "1 shutter",
    "card.protected": "protected",
    "card.toggleAria": "Show or hide the shutters of {name}",
    "card.facadeNow": "in the sun",
    "card.facadeNever": "no sun today",
    "card.reopenAt": "Reopens by {time} at the latest",
    "card.solar": "Sun protection",
    "card.open": "Scheduled opening",
    "card.close": "Scheduled closing",
    "card.solarShort": "S",
    "card.openShort": "O",
    "card.closeShort": "C",
    "card.flagAria": "{what} for {name}: {state}",
    "card.on": "on",
    "card.off": "off",
    "card.badConfig": "Invalid “{key}” parameter: {expected}.",
    "editor.title": "Title",
    "editor.show": "Functions shown for each shutter",
    "editor.order": "Shutter order",
    "editor.orderHint": "Shutters not listed come after, in their original order.",
    "editor.up": "Move up",
    "editor.down": "Move down",
    "editor.reset": "Original order",
    "editor.scenarios": "Scenarios offered",
    "editor.loading": "Loading shutters…",
    "err.notInstalled": "The “Volets Intelligents” integration is not installed or not running.",
    "err.unknown": "Unknown error.",
    "err.unauthorized": "You are not allowed to perform this action",
    "mode.group": "Global mode",
    "mode.auto": "Auto",
    "mode.manual": "Manual",
    "mode.off": "Off",
    "scenario.group": "Scenario",
    "scenario.summer": "Summer",
    "scenario.winter": "Winter",
    "scenario.vacation": "Vacation",
    "scenario.off": "Disabled",
    "status.disabled": "Disabled",
    "status.mode_manual": "Manual mode",
    "status.mode_off": "Stopped",
    "status.scenario_off": "Scenario disabled",
    "status.grace": "Starting up",
    "status.outside_window": "Outside active hours",
    "status.no_data": "Missing data",
    "status.paused": "Paused",
    "status.window_open": "Window open",
    "status.schedule": "Schedule",
    "status.wind_protected": "Wind protection",
    "status.shaded": "Sun protection",
    "status.watching": "Watching",
    "status.cooldown": "Wear protection",
    "status.unavailable": "Unavailable",
  },
};

/** Traduit une clé dans la langue donnée (repli fr, puis la clé elle-même). */
function translate(lang, key, vars) {
  const text = (I18N[lang] || I18N.fr)[key] ?? I18N.fr[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

const DEFAULT_CONFIG = { title: "Volets Intelligents", show_solar: true, show_open: true, show_close: true, order: [], scenarios: [] };
const MODE_IDS = ["auto", "manual", "off"];
// Clés fixes des scénarios (contrat §1), utilisées si le statut ne fournit pas `scenarios`.
const SCENARIO_IDS = ["summer", "winter", "vacation", "off"];

// Code de statut -> couleur (contrat §3).
const STATUS_COLORS = {
  disabled: "grey", mode_manual: "grey", mode_off: "grey", scenario_off: "grey",
  grace: "grey", outside_window: "grey", no_data: "red", paused: "blue",
  schedule: "blue", window_open: "purple", wind_protected: "purple", shaded: "orange",
  watching: "green", cooldown: "grey", unavailable: "red",
};

/** Crée un élément DOM sans jamais interpréter de HTML (textContent uniquement). */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (val === undefined || val === null || val === false) continue;
    if (key === "class") node.className = val;
    else if (key === "text") node.textContent = val;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), val);
    else if (key === "disabled" || key === "hidden") node[key] = val;
    else node.setAttribute(key, val === true ? "" : String(val));
  }
  const append = (child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(append);
    else node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  };
  children.forEach(append);
  return node;
}

/** Appelle une fonction de désabonnement sans laisser fuiter d'erreur. */
function safeUnsub(unsub) {
  try {
    const result = unsub();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch (_err) {
    /* connexion déjà fermée : rien à faire */
  }
}

const isPaused = (c) => c.status === "paused" || Boolean(c.paused_until);

const CSS = `
:host { display: block; --c: var(--disabled-color, #9e9e9e); }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; }
.card {
  background: var(--ha-card-background, var(--card-background-color, #fff));
  color: var(--primary-text-color, #212121);
  border: 1px solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
  border-radius: var(--ha-card-border-radius, 12px);
  box-shadow: var(--ha-card-box-shadow, none);
  padding: 16px; display: flex; flex-direction: column; gap: 12px;
  font-family: var(--paper-font-body1_-_font-family, Roboto, "Segoe UI", sans-serif);
  font-size: 14px; line-height: 1.4;
}
h2 { margin: 0; font-size: 18px; font-weight: 500; }
.muted { color: var(--secondary-text-color, #727272); }
.small { font-size: 12px; }
.c-orange { --c: var(--warning-color, #ffa600); }
.c-green { --c: var(--success-color, #43a047); }
.c-blue { --c: var(--info-color, #039be5); }
.c-purple { --c: var(--purple-color, #8e24aa); }
.c-red { --c: var(--error-color, #db4437); }
.c-grey { --c: var(--disabled-color, #9e9e9e); }

/* Mode et scénario : deux listes déroulantes côte à côte. */
.selectors { display: flex; gap: 8px; align-items: flex-end; }
.sel { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sel > span { font-size: 12px; color: var(--secondary-text-color, #727272); }
.sel select {
  width: 100%; min-height: 44px; padding: 0 8px; border-radius: 8px; font: inherit; cursor: pointer;
  border: 1px solid var(--primary-color, #03a9f4); background: var(--card-background-color, #fff);
  color: var(--primary-text-color, #212121);
}
.sel select:disabled { opacity: .5; cursor: default; }
.sel select:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
.btn:disabled { opacity: .5; cursor: default; }
button:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }

.row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-height: 48px; border-top: 1px solid var(--divider-color, #e0e0e0); padding-top: 4px; }
.row:first-of-type { border-top: 0; }
.gbody > .row:first-child { border-top: 0; }
.dot { width: 14px; height: 14px; border-radius: 50%; background: var(--c); flex: none; }
.name { flex: 1 1 140px; min-width: 0; display: flex; flex-direction: column; }
.ctl { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.name > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name.link { cursor: pointer; border-radius: 6px; }
.name.link:hover { background: var(--secondary-background-color, rgba(127,127,127,.12)); }
.pos { white-space: nowrap; }
.flags { display: flex; gap: 4px; }
.flag {
  min-width: 36px; min-height: 36px; padding: 0 6px; border-radius: 8px; cursor: pointer; font-weight: 600;
  border: 1px solid var(--divider-color, #ccc); background: transparent; color: var(--disabled-color, #9e9e9e);
}
.flag.on { border-color: var(--success-color, #43a047); color: var(--success-color, #43a047); background: rgba(67, 160, 71, .14); }
.flag:disabled { opacity: .5; cursor: default; }
.ed { display: flex; flex-direction: column; gap: 12px; font-family: var(--paper-font-body1_-_font-family, Roboto, "Segoe UI", sans-serif); color: var(--primary-text-color, #212121); }
.ed label.f { display: flex; flex-direction: column; gap: 4px; }
.ed input[type="text"] { min-height: 40px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit; font: inherit; }
.ed .chk { display: flex; align-items: center; gap: 8px; min-height: 32px; cursor: pointer; }
.ed fieldset { border: 1px solid var(--divider-color, #ccc); border-radius: 8px; margin: 0; padding: 8px 12px; display: flex; flex-direction: column; }
.ed legend { padding: 0 6px; color: var(--secondary-text-color, #727272); }
.ed .ord { display: flex; align-items: center; gap: 6px; min-height: 40px; border-top: 1px solid var(--divider-color, #e0e0e0); }
.ed .ord:first-of-type { border-top: 0; }
.ed .ord .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ed .ord button { min-width: 36px; min-height: 36px; border-radius: 8px; border: 1px solid var(--divider-color, #ccc); background: transparent; color: inherit; cursor: pointer; }
.ed .ord button:disabled { opacity: .4; cursor: default; }
.groups { display: flex; flex-direction: column; gap: 16px; }
.group { display: flex; flex-direction: column; gap: 4px; }
.ghead {
  display: flex; align-items: center; gap: 10px; min-height: 40px; flex-wrap: wrap;
  padding: 4px 10px; border-radius: 8px; border-left: 4px solid var(--c);
  background: var(--secondary-background-color, rgba(127, 127, 127, .12));
}
.ghead .fname { font-size: 16px; }
.ghead.fold { cursor: pointer; user-select: none; }
.ghead .chev { width: 14px; color: var(--secondary-text-color, #727272); }
.gbody { margin-left: 12px; padding-left: 12px; border-left: 2px solid var(--divider-color, #e0e0e0); }
.opt { display: flex; align-items: center; gap: 8px; min-height: 32px; cursor: pointer; }
.ghead .now, .reopen { color: var(--c); font-weight: 500; }
.btn {
  min-height: 44px; min-width: 44px; padding: 0 12px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--divider-color, #ccc);
  background: transparent; color: var(--primary-text-color, #212121);
}
.notice { border: 1px solid var(--c); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.err { color: var(--error-color, #db4437); }
`;

class VoletsIntelligentsCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._lang = "fr";
    this._config = { ...DEFAULT_CONFIG };
    this._status = null;
    this._error = null; // erreur d'abonnement
    this._cmdError = null; // erreur de la dernière commande
    this._busy = false;
    this._collapsible = this._load("collapsible") === true;
    this._collapsed = new Set(Array.isArray(this._load("collapsed")) ? this._load("collapsed") : []);
    this._focusSel = null;
    this._unsub = null;
    this._subGen = 0;
    this._started = false;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(el("style", { text: CSS }), (this._root = el("div")));
    this._render();
  }

  _t(key, vars) {
    return translate(this._lang, key, vars);
  }

  /** Message d'erreur lisible à partir d'une erreur WebSocket de HA. */
  _describeError(err) {
    if (err && err.code === "unauthorized") return this._t("err.unauthorized");
    if (err && err.code === "unknown_command") return this._t("err.notInstalled");
    if (err && typeof err.message === "string" && err.message) return err.message;
    return this._t("err.unknown");
  }

  /**
   * Configuration Lovelace (toutes les clés sont optionnelles) :
   * title ; show_solar / show_open / show_close (booléens, vrai par défaut) ;
   * order (liste d'entity_id de volets) ; scenarios (liste de clés de scénarios proposés, vide = tous).
   */
  setConfig(config) {
    const cfg = config || {};
    if (cfg.title !== undefined && typeof cfg.title !== "string") {
      throw new Error(this._t("card.badTitle"));
    }
    for (const key of ["show_solar", "show_open", "show_close"]) {
      if (cfg[key] !== undefined && typeof cfg[key] !== "boolean") {
        throw new Error(this._t("card.badConfig", { key, expected: "true / false" }));
      }
    }
    for (const key of ["order", "scenarios"]) {
      if (cfg[key] !== undefined && !(Array.isArray(cfg[key]) && cfg[key].every((x) => typeof x === "string"))) {
        throw new Error(this._t("card.badConfig", { key, expected: "list of strings" }));
      }
    }
    this._config = { ...DEFAULT_CONFIG, ...cfg };
    this._render();
  }

  getCardSize() {
    const covers = this._status && this._status.covers ? this._status.covers.length : 2;
    return 3 + covers;
  }

  static getStubConfig() {
    return {};
  }

  static getConfigElement() {
    return document.createElement("volets-intelligents-card-editor");
  }

  set hass(hass) {
    this._hass = hass;
    const lang = String((hass && hass.language) || "fr").slice(0, 2).toLowerCase();
    const next = lang in I18N ? lang : "fr";
    if (next !== this._lang) {
      this._lang = next;
      this._render();
    }
    this._start();
  }
  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._start();
  }

  disconnectedCallback() {
    this._started = false;
    this._subGen++; // invalide un abonnement encore en cours d'établissement
    if (this._unsub) {
      safeUnsub(this._unsub);
      this._unsub = null;
    }
  }

  _start() {
    if (this._started || !this.isConnected || !this._hass) return;
    this._started = true;
    this._subscribe();
  }

  async _subscribe() {
    const gen = ++this._subGen;
    if (this._unsub) {
      safeUnsub(this._unsub);
      this._unsub = null;
    }
    this._error = null;
    try {
      const unsub = await this._hass.connection.subscribeMessage(
        (status) => this._onStatus(status),
        { type: `${WS}subscribe_status` }
      );
      if (gen !== this._subGen) {
        safeUnsub(unsub);
        return;
      }
      this._unsub = unsub;
    } catch (err) {
      if (gen !== this._subGen) return;
      this._error = this._describeError(err);
      this._render();
    }
  }

  /**
   * Nouveau statut : le DOM n'est reconstruit que si une donnée affichée a changé
   * (sinon le focus clavier serait perdu à chaque évaluation).
   */
  _onStatus(status) {
    const changed = this._viewKey(status) !== this._viewKey(this._status) || this._error !== null;
    this._status = status;
    this._error = null;
    if (changed) this._render();
  }

  /** Signature des seules données affichées par la carte. */
  _viewKey(st) {
    if (!st) return "";
    return JSON.stringify([st.mode, st.scenario, st.scenario_kind, st.scenarios || null,
      Object.entries(st.facades || {}).map(([id, f]) => [id, f.name, f.exposed, f.windows, f.next_end]),
      (st.covers || []).map((c) => [c.entity_id, c.name, c.facade, c.status, c.reason, c.position, c.enabled,
        c.schedule_open_enabled, c.schedule_close_enabled, c.paused_until])]);
  }

  async _command(payload) {
    if (this._busy) return;
    this._busy = true;
    this._cmdError = null;
    this._render();
    try {
      await this._hass.callWS({ type: `${WS}command`, ...payload });
    } catch (err) {
      this._cmdError = this._t("card.cmdFailed", { error: this._describeError(err) });
    } finally {
      this._busy = false;
      this._render();
    }
  }

  /* ---------- Rendu ---------- */

  _render() {
    const card = el("div", { class: "card" }, el("h2", { text: this._config.title }));
    const st = this._status;
    const retry = el("button", { class: "btn", type: "button", text: this._t("card.retry"), onclick: () => this._subscribe() });
    if (!st) {
      card.append(this._error
        ? el("div", { class: "notice c-red", role: "alert" },
          el("strong", { text: this._t("card.unavailable") }),
          el("span", { text: this._error }), retry)
        : el("span", { class: "muted", text: this._t("card.loading") }));
      this._root.replaceChildren(card);
      return;
    }

    // Libellés des scénarios fournis par le statut (clé -> libellé), y compris personnalisés.
    const labels = st.scenarios || {};
    const keys = Object.keys(labels).length ? Object.keys(labels) : SCENARIO_IDS.slice();
    if (!keys.includes(st.scenario)) keys.push(st.scenario);
    const wanted = this._config.scenarios || [];
    const shown = wanted.length ? keys.filter((key) => wanted.includes(key) || key === st.scenario) : keys;
    const scenarios = shown.map((key) => [
      key, labels[key] || (SCENARIO_IDS.includes(key) ? this._t(`scenario.${key}`) : key),
    ]);

    // append() écrit « null » pour une valeur vide : on retire les parties absentes.
    card.append(...[
      this._error ? el("div", { class: "notice c-red", role: "alert" },
        el("span", { text: this._t("card.interrupted", { error: this._error }) }), retry) : null,
      el("div", { class: "selectors" },
        this._dropdown(MODE_IDS.map((m) => [m, this._t(`mode.${m}`)]), st.mode, this._t("mode.group"),
          (v) => this._command({ command: "set_mode", value: v })),
        this._dropdown(scenarios, st.scenario, this._t("scenario.group"),
          (v) => this._command({ command: "set_scenario", value: v }))),
      this._cmdError ? el("span", { class: "err", role: "alert", text: this._cmdError }) : null,
      this._groups(st),
      (st.covers || []).length ? this._option() : null,
      (st.covers || []).length ? null : el("span", { class: "muted", text: this._t("card.noCovers") }),
    ].filter(Boolean));
    this._root.replaceChildren(card);
    if (this._focusSel) {
      const target = this._root.querySelector(this._focusSel);
      this._focusSel = null;
      if (target) target.focus();
    }
  }

  /** HH:MM d'une date ISO, telle qu'envoyée par HA (heure de la maison, pas celle du navigateur). */
  _hhmm(iso) {
    const m = typeof iso === "string" ? /T(\d{2}:\d{2})/.exec(iso) : null;
    return m ? m[1] : null;
  }

  /** Préférences d'affichage propres à ce navigateur (sans effet si le stockage est indisponible). */
  _load(key) {
    try {
      return JSON.parse(localStorage.getItem(`volets-intelligents-card:${key}`));
    } catch (_err) {
      return null;
    }
  }

  _save(key, value) {
    try {
      localStorage.setItem(`volets-intelligents-card:${key}`, JSON.stringify(value));
    } catch (_err) {
      /* stockage indisponible : la préférence ne sera pas conservée */
    }
  }

  _setCollapsible(on) {
    this._collapsible = on;
    this._save("collapsible", on);
    // Au passage en mode repliable, tout démarre replié (puis le choix de chaque façade est retenu).
    if (on) {
      this._collapsed = new Set(Object.keys((this._status && this._status.facades) || {}).concat([""]));
      this._save("collapsed", [...this._collapsed]);
    }
    this._focusSel = ".opt input";
    this._render();
  }

  _toggleGroup(id) {
    if (this._collapsed.has(id)) this._collapsed.delete(id);
    else this._collapsed.add(id);
    this._save("collapsed", [...this._collapsed]);
    this._focusSel = `.ghead[data-id="${id}"]`;
    this._render();
  }

  /** Volets regroupés par façade : plage d'ensoleillement du jour en en-tête de chaque groupe. */
  _groups(st) {
    const covers = this._ordered(st.covers || []);
    const facades = st.facades || {};
    const groups = Object.entries(facades)
      .map(([id, f]) => ({ id, facade: f, covers: covers.filter((c) => c.facade === id) }))
      .filter((g) => g.covers.length);
    const known = new Set(Object.keys(facades));
    const others = covers.filter((c) => !known.has(c.facade));
    if (others.length) groups.push({ id: "", facade: null, covers: others });
    // Les façades suivent l'ordre choisi : celle dont le premier volet vient en tête passe en premier.
    if ((this._config.order || []).length) {
      const rank = (g) => covers.indexOf(g.covers[0]);
      groups.sort((a, b) => rank(a) - rank(b));
    }
    return el("div", { class: "groups" }, groups.map((g) => {
      const f = g.facade;
      const title = f ? (f.name || g.id) : this._t("card.other");
      const windows = f ? (f.windows || []).map((w) => `${w.start}\u00a0–\u00a0${w.end}`) : [];
      const folded = this._collapsible && this._collapsed.has(g.id);
      const shaded = g.covers.some((c) => c.status === "shaded");
      const headProps = {
        class: `ghead c-${f && f.exposed ? "orange" : "grey"}${this._collapsible ? " fold" : ""}`,
        "data-id": g.id,
      };
      if (this._collapsible) {
        Object.assign(headProps, {
          role: "button", tabindex: "0", "aria-expanded": String(!folded),
          "aria-label": this._t("card.toggleAria", { name: title }),
          onclick: () => this._toggleGroup(g.id),
          onkeydown: (ev) => {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); this._toggleGroup(g.id); }
          },
        });
      }
      return el("div", { class: "group" },
        el("div", headProps,
          this._collapsible ? el("span", { class: "chev", "aria-hidden": "true", text: folded ? "▸" : "▾" }) : null,
          el("strong", { class: "fname", text: title }),
          f ? el("span", { class: "muted small",
            text: windows.length ? windows.join(" · ") : this._t("card.facadeNever") }) : null,
          f && f.exposed ? el("span", { class: "small now", text: this._t("card.facadeNow") }) : null,
          folded ? el("span", { class: "small muted count", text: g.covers.length === 1 ? this._t("card.count1") : this._t("card.count", { n: g.covers.length }) }) : null,
          folded && shaded ? el("span", { class: "small c-orange now", text: this._t("card.protected") }) : null),
        folded ? null : el("div", { class: "gbody" }, g.covers.map((c) => this._row(c, st))));
    }));
  }

  /** Volets dans l'ordre choisi (config `order`), les autres à la suite dans l'ordre d'origine. */
  _ordered(covers) {
    const order = this._config.order || [];
    if (!order.length) return covers;
    const rank = (c) => {
      const i = order.indexOf(c.entity_id);
      return i < 0 ? order.length : i;
    };
    return covers.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
  }

  /** Case à cocher : façades repliables (variante C) ou toujours dépliées (variante A). */
  _option() {
    const id = "opt-collapsible";
    return el("label", { class: "opt muted small", for: id },
      el("input", {
        type: "checkbox", id, checked: this._collapsible,
        onchange: (ev) => this._setCollapsible(ev.target.checked),
      }),
      this._t("card.collapsible"));
  }

  /** Liste déroulante avec son intitulé (mode global, scénario). */
  _dropdown(options, active, label, onPick) {
    return el("label", { class: "sel" },
      el("span", { text: label }),
      el("select", { disabled: this._busy, onchange: (ev) => onPick(ev.target.value) },
        options.map(([value, text]) => el("option", { value, text, selected: value === active }))));
  }

  /** Été : heure à laquelle un volet protégé par nous remonte au plus tard (fin du soleil sur sa façade). */
  _reopenText(c, st) {
    if (!st || st.scenario_kind !== "heat_protection" || c.status !== "shaded") return null;
    const facade = (st.facades || {})[c.facade];
    const time = facade && facade.exposed ? this._hhmm(facade.next_end) : null;
    return time ? this._t("card.reopenAt", { time }) : null;
  }

  /** Ouvre la fenêtre de contrôle de l'entité (more-info de Home Assistant). */
  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true, composed: true, detail: { entityId },
    }));
  }

  /** Interrupteurs S / O / F d'un volet (protection solaire, ouverture et fermeture horaires). */
  _flags(c, name) {
    const defs = [
      ["show_solar", "enabled", "solar", c.enabled !== false],
      ["show_open", "schedule_open_enabled", "open", c.schedule_open_enabled !== false],
      ["show_close", "schedule_close_enabled", "close", c.schedule_close_enabled !== false],
    ].filter(([cfg]) => this._config[cfg] !== false);
    if (!defs.length) return null;
    return el("span", { class: "flags", role: "group" }, defs.map(([, field, key, on]) => {
      const what = this._t(`card.${key}`);
      return el("button", {
        class: `flag${on ? " on" : ""}`, type: "button", text: this._t(`card.${key}Short`), title: what,
        "aria-pressed": String(on), disabled: this._busy,
        "aria-label": this._t("card.flagAria", { what, name, state: this._t(on ? "card.on" : "card.off") }),
        onclick: () => this._command({ command: "set_enabled", entity_id: c.entity_id, enabled: !on, field }),
      });
    }));
  }

  _row(c, st) {
    const known = c.status in STATUS_COLORS;
    const label = known ? this._t(`status.${c.status}`) : String(c.status);
    const color = known ? STATUS_COLORS[c.status] : "grey";
    const paused = isPaused(c);
    const name = c.name || c.entity_id;
    return el("div", { class: "row" },
      el("span", { class: `dot c-${color}`, title: label, role: "img", "aria-label": label }),
      el("div", {
        class: "name link", role: "button", tabindex: "0",
        "aria-label": this._t("card.openAria", { name }),
        onclick: () => this._moreInfo(c.entity_id),
        onkeydown: (ev) => {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); this._moreInfo(c.entity_id); }
        },
      },
        el("span", { text: name }),
        el("span", { class: "muted small", title: c.reason || "", text: label }),
        this._reopenText(c, st) ? el("span", { class: "small c-orange reopen", text: this._reopenText(c, st) }) : null),
      el("span", { class: "pos muted", text: typeof c.position === "number" ? `${c.position}\u00a0%` : "—" }),
      el("div", { class: "ctl" },
        this._flags(c, name),
        el("button", {
          class: "btn", type: "button", text: paused ? this._t("card.resume") : this._t("card.pause"),
          disabled: this._busy || c.enabled === false,
          "aria-label": this._t(paused ? "card.resumeAria" : "card.pauseAria", { name }),
          onclick: () => this._command({ command: paused ? "resume" : "pause", entity_id: c.entity_id }),
        })));
  }
}

/** Éditeur visuel de la carte (titre, fonctions affichées, ordre des volets, scénarios proposés). */
class VoletsIntelligentsCardEditor extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._lang = "fr";
    this._config = { ...DEFAULT_CONFIG };
    this._covers = null; // [{ entity_id, name }] une fois le statut lu
    this._scenarios = null; // [[clé, libellé]]
    this._loading = false;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(el("style", { text: CSS }), (this._root = el("div")));
    this._render();
  }

  _t(key, vars) {
    return translate(this._lang, key, vars);
  }

  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...(config || {}) };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const lang = String((hass && hass.language) || "fr").slice(0, 2).toLowerCase();
    const next = lang in I18N ? lang : "fr";
    if (next !== this._lang) {
      this._lang = next;
      this._render();
    }
    if (!this._covers && !this._loading) this._load();
  }
  get hass() {
    return this._hass;
  }

  async _load() {
    this._loading = true;
    try {
      const { status } = await this._hass.callWS({ type: `${WS}get_status` });
      this._covers = (status.covers || []).map((c) => ({ entity_id: c.entity_id, name: c.name || c.entity_id }));
      const labels = status.scenarios || {};
      const keys = Object.keys(labels).length ? Object.keys(labels) : SCENARIO_IDS.slice();
      this._scenarios = keys.map((k) => [k, labels[k] || (SCENARIO_IDS.includes(k) ? this._t(`scenario.${k}`) : k)]);
    } catch (_err) {
      this._covers = [];
      this._scenarios = [];
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _emit(patch) {
    this._config = { ...this._config, ...patch };
    // On n'écrit dans la configuration que ce qui s'écarte des valeurs par défaut (YAML court et lisible).
    const out = {};
    for (const [key, value] of Object.entries(this._config)) {
      const def = DEFAULT_CONFIG[key];
      const same = Array.isArray(def) ? Array.isArray(value) && value.length === 0 : value === def;
      if (key === "type" || !same) out[key] = value;
    }
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: out }, bubbles: true, composed: true }));
    this._render();
  }

  /** Ordre effectif : `order` de la configuration, puis les volets non listés. */
  _currentOrder() {
    const known = (this._covers || []).map((c) => c.entity_id);
    const wanted = (this._config.order || []).filter((id) => known.includes(id));
    return wanted.concat(known.filter((id) => !wanted.includes(id)));
  }

  _move(index, delta) {
    const order = this._currentOrder();
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    this._emit({ order });
  }

  _check(label, checked, onchange) {
    return el("label", { class: "chk" },
      el("input", { type: "checkbox", checked, onchange: (ev) => onchange(ev.target.checked) }), label);
  }

  _render() {
    const names = new Map((this._covers || []).map((c) => [c.entity_id, c.name]));
    const order = this._currentOrder();
    const wanted = this._config.scenarios || [];
    const body = [
      el("label", { class: "f" }, el("span", { class: "muted small", text: this._t("editor.title") }),
        el("input", { type: "text", value: this._config.title || "", onchange: (ev) => this._emit({ title: ev.target.value }) })),
      el("fieldset", {}, el("legend", { text: this._t("editor.show") }),
        this._check(`${this._t("card.solarShort")} – ${this._t("card.solar")}`, this._config.show_solar !== false, (v) => this._emit({ show_solar: v })),
        this._check(`${this._t("card.openShort")} – ${this._t("card.open")}`, this._config.show_open !== false, (v) => this._emit({ show_open: v })),
        this._check(`${this._t("card.closeShort")} – ${this._t("card.close")}`, this._config.show_close !== false, (v) => this._emit({ show_close: v }))),
    ];
    if (this._scenarios && this._scenarios.length) {
      body.push(el("fieldset", {}, el("legend", { text: this._t("editor.scenarios") }),
        this._scenarios.map(([key, label]) => this._check(label, !wanted.length || wanted.includes(key), (v) => {
          const current = wanted.length ? wanted.slice() : this._scenarios.map(([k]) => k);
          const next = v ? current.concat(current.includes(key) ? [] : [key]) : current.filter((k) => k !== key);
          // Tous cochés = pas de filtre ; on garde toujours au moins un scénario.
          this._emit({ scenarios: next.length === this._scenarios.length || !next.length ? [] : next });
        }))));
    }
    body.push(el("fieldset", {}, el("legend", { text: this._t("editor.order") }),
      this._covers === null ? el("span", { class: "muted small", text: this._t("editor.loading") }) : [
        el("span", { class: "muted small", text: this._t("editor.orderHint") }),
        order.map((id, i) => el("div", { class: "ord" },
          el("span", { class: "nm", text: names.get(id) || id }),
          el("button", { type: "button", text: "▲", title: this._t("editor.up"), "aria-label": `${this._t("editor.up")} ${names.get(id) || id}`,
            disabled: i === 0, onclick: () => this._move(i, -1) }),
          el("button", { type: "button", text: "▼", title: this._t("editor.down"), "aria-label": `${this._t("editor.down")} ${names.get(id) || id}`,
            disabled: i === order.length - 1, onclick: () => this._move(i, 1) }))),
        (this._config.order || []).length
          ? el("button", { class: "btn", type: "button", text: this._t("editor.reset"), onclick: () => this._emit({ order: [] }) })
          : null,
      ]));
    this._root.replaceChildren(el("div", { class: "ed" }, body));
  }
}

if (!customElements.get("volets-intelligents-card-editor")) {
  customElements.define("volets-intelligents-card-editor", VoletsIntelligentsCardEditor);
}

if (!customElements.get("volets-intelligents-card")) {
  customElements.define("volets-intelligents-card", VoletsIntelligentsCard);
}

// Le script peut être chargé deux fois (intégration + ressource ajoutée à la main) :
// on ne s'inscrit dans la liste des cartes qu'une seule fois.
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "volets-intelligents-card")) {
  window.customCards.push({
    type: "volets-intelligents-card",
    name: "Volets Intelligents",
    description: translate("fr", "card.description") + " / " + translate("en", "card.description"),
  });
}
