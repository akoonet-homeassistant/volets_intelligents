/* Protocole Alarme — carte du tableau de bord : armer / désarmer, règles exécutées, capteurs.
   Chargée sur toutes les pages par l'intégration (aucune ressource Lovelace à ajouter). */

const TEXTES = {
  fr: {
    nom: "Protocole Alarme", desarmer: "Désarmer", code: "Code", effacer: "Effacer", valider: "Valider", annuler: "Annuler",
    verif_ok_court: "vérification OK", verif_echec_court: "vérification en échec",
    regles: "Règles exécutées", aucune: "Aucune règle n'a agi.", depuis_arm: "Armement à {h}", depuis_des: "Désarmement à {h}",
    pendant: "pendant l'armement", capteurs: "Capteurs", panneau: "Règles", panneau_aide: "Ouvrir les règles de Protocole Alarme", indisponible: "Alarme indisponible",
    res_ok: "Exécutée", res_erreur: "Erreur", res_verif_ok: "Vérification OK", res_verif_echec: "Vérification en échec", res_restauree: "État remis ({n} entités)", res_restauree_1: "État remis (1 entité)",
    pause: "Protocole en pause : aucune règle ne s'exécute.", choisir_alarme: "Choisissez une alarme dans la configuration de la carte.",
    etats: { disarmed: "Désarmée", armed_away: "Armée · Absent", armed_night: "Armée · Nuit", armed_home: "Armée · Présent",
      armed_vacation: "Armée · Vacances", armed_custom_bypass: "Armée · Personnalisé", arming: "Armement…", pending: "En attente…",
      disarming: "Désarmement…", triggered: "Alarme déclenchée !", unavailable: "Indisponible", unknown: "Inconnu" },
    modes: { armed_away: "Absent", armed_night: "Nuit", armed_home: "Présent", armed_vacation: "Vacances", armed_custom_bypass: "Personnalisé" },
    ed: { entity: "Alarme", nom: "Titre", modes: "Modes affichés", capteurs: "Capteurs à afficher (dans cet ordre)",
      ajouter_capteur: "Ajouter un capteur", monter: "Monter", descendre: "Descendre", retirer: "Retirer", aucun_capteur: "Aucun capteur.",
      afficher_regles: "Afficher les règles exécutées", afficher_capteurs: "Afficher les capteurs", affichage_capteurs: "Affichage des capteurs",
      afficher_panneau: "Afficher le bouton « Règles » (alarme désarmée)" },
    styles: { pastilles: "Pastilles", lignes: "Liste sur deux colonnes", resume: "Résumé (capteurs ouverts seulement)" },
    replier: "Replier", deplier: "Déplier", n_ouverts: "{n} ouvert(s)", tout_ferme: "Tout est fermé ({n} capteurs)",
    voir_tout: "Voir tous les capteurs", masquer_fermes: "Masquer les capteurs fermés",
  },
  en: {
    nom: "Protocole Alarme", desarmer: "Disarm", code: "Code", effacer: "Clear", valider: "Confirm", annuler: "Cancel",
    verif_ok_court: "check OK", verif_echec_court: "check failed",
    regles: "Rules that ran", aucune: "No rule has acted.", depuis_arm: "Armed at {h}", depuis_des: "Disarmed at {h}",
    pendant: "while armed", capteurs: "Sensors", panneau: "Rules", panneau_aide: "Open the Protocole Alarme rules", indisponible: "Alarm unavailable",
    res_ok: "Ran", res_erreur: "Error", res_verif_ok: "Check OK", res_verif_echec: "Check failed", res_restauree: "State restored ({n} entities)", res_restauree_1: "State restored (1 entity)",
    pause: "Protocol paused: no rule runs.", choisir_alarme: "Choose an alarm in the card configuration.",
    etats: { disarmed: "Disarmed", armed_away: "Armed · Away", armed_night: "Armed · Night", armed_home: "Armed · Home",
      armed_vacation: "Armed · Vacation", armed_custom_bypass: "Armed · Custom", arming: "Arming…", pending: "Pending…",
      disarming: "Disarming…", triggered: "Alarm triggered!", unavailable: "Unavailable", unknown: "Unknown" },
    modes: { armed_away: "Away", armed_night: "Night", armed_home: "Home", armed_vacation: "Vacation", armed_custom_bypass: "Custom" },
    ed: { entity: "Alarm", nom: "Title", modes: "Modes shown", capteurs: "Sensors to show (in this order)",
      ajouter_capteur: "Add a sensor", monter: "Move up", descendre: "Move down", retirer: "Remove", aucun_capteur: "No sensor.",
      afficher_regles: "Show rules that ran", afficher_capteurs: "Show sensors", affichage_capteurs: "Sensor display",
      afficher_panneau: "Show the “Rules” button (alarm disarmed)" },
    styles: { pastilles: "Chips", lignes: "Two-column list", resume: "Summary (open sensors only)" },
    replier: "Collapse", deplier: "Expand", n_ouverts: "{n} open", tout_ferme: "All closed ({n} sensors)",
    voir_tout: "Show all sensors", masquer_fermes: "Hide closed sensors",
  },
};

// Bits de supported_features de alarm_control_panel
const MODES = [
  ["armed_away", 2, "alarm_arm_away", "mdi:shield-lock"],
  ["armed_night", 4, "alarm_arm_night", "mdi:shield-moon"],
  ["armed_home", 1, "alarm_arm_home", "mdi:shield-home"],
  ["armed_vacation", 32, "alarm_arm_vacation", "mdi:shield-airplane"],
  ["armed_custom_bypass", 16, "alarm_arm_custom_bypass", "mdi:security"],
];
const ICONES_RES = { restauree: ["mdi:backup-restore", "violet"], ok: ["mdi:check-circle", "vert"], verif_ok: ["mdi:check-decagram", "vert"], verif_echec: ["mdi:alert", "orange"], erreur: ["mdi:alert-circle", "rouge"] };
const ARMES = new Set(MODES.map(([m]) => m));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const langue = (hass) => (String(hass?.locale?.language || hass?.language || "fr").startsWith("fr") ? "fr" : "en");

function bouclier(etat) {
  if (etat === "disarmed") return ["mdi:shield-check", "vert"];
  if (etat === "triggered") return ["mdi:shield-alert", "rouge"];
  if (["arming", "pending", "disarming"].includes(etat)) return ["mdi:shield-sync", "orange"];
  if (ARMES.has(etat)) return ["mdi:shield-lock", "rouge"];
  return ["mdi:shield-off", "gris"];
}

class ProtocoleAlarmeCard extends HTMLElement {
  static getConfigElement() { return document.createElement("protocole-alarme-card-editor"); }
  static getStubConfig(hass) {
    const alarme = Object.keys(hass?.states || {}).find((e) => e.startsWith("alarm_control_panel."));
    return { entity: alarme, modes: ["armed_away", "armed_night"], capteurs: [], afficher_regles: true };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._code = "";
    this._donnees = null;
    this._abonnement = null;
  }

  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Invalid configuration");
    this._config = { afficher_regles: true, afficher_capteurs: true, afficher_panneau: true, capteurs: [], ...config };
    this._rendu();
  }

  set hass(hass) {
    const avant = this._hass;
    this._hass = hass;
    if (!this._abonnement && hass?.connection) this._abonner();
    // Ne redessiner que si une entité affichée a changé (la carte reçoit hass à chaque changement d'état)
    const suivies = [this._entite(), ...(this._config?.capteurs || [])];
    if (!avant || suivies.some((e) => avant.states[e] !== hass.states[e]) || avant.locale !== hass.locale) this._rendu();
  }

  connectedCallback() { if (this._hass && !this._abonnement) this._abonner(); }

  disconnectedCallback() {
    const fin = this._abonnement;
    this._abonnement = null;
    if (fin) fin.then((f) => f && f()).catch(() => {});
  }

  getCardSize() { return 4 + (this._config?.capteurs?.length || 0); }

  _abonner() {
    this._abonnement = this._hass.connection
      .subscribeMessage((d) => { this._donnees = d; this._rendu(); }, { type: "protocole_alarme/carte" })
      .catch(() => { this._donnees = null; return null; }); // intégration non chargée : la carte reste utilisable
  }

  _t(cle, vars = {}) {
    const txt = cle.split(".").reduce((o, k) => o?.[k], TEXTES[langue(this._hass)]) ?? cle;
    return String(txt).replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? "");
  }

  _entite() { return this._config?.entity || this._donnees?.alarme; }

  // Listes repliées : mémorisées sur l'appareil, par alarme
  _cleRepli() { return `protocole_alarme.carte.${this._entite() || "?"}`; }
  _replie(liste) {
    try { return (JSON.parse(localStorage.getItem(this._cleRepli()) || "[]")).includes(liste); } catch (_e) { return !!this._replisMemoire?.has(liste); }
  }
  _basculer(liste) {
    let replis;
    try { replis = new Set(JSON.parse(localStorage.getItem(this._cleRepli()) || "[]")); } catch (_e) { replis = this._replisMemoire || new Set(); }
    if (replis.has(liste)) replis.delete(liste); else replis.add(liste);
    this._replisMemoire = replis;
    try { localStorage.setItem(this._cleRepli(), JSON.stringify([...replis])); } catch (_e) { /* mémoire seulement */ }
    this._rendu();
  }
  _entete(liste, titre, sous = "") {
    const ouvert = !this._replie(liste);
    return `<button class="titre-section" data-l="${liste}" aria-expanded="${ouvert}" aria-label="${esc(`${this._t(ouvert ? "replier" : "deplier")} : ${titre}`)}">
      <span class="t">${esc(titre)}</span><span class="sous">${esc(sous)}</span><ha-icon icon="${ouvert ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon></button>`;
  }

  _heure(iso) {
    try { return new Date(iso).toLocaleTimeString(this._hass?.locale?.language || undefined, { hour: "2-digit", minute: "2-digit" }); } catch (_e) { return ""; }
  }

  _modesVisibles(etat) {
    const feat = Number(etat?.attributes?.supported_features || 0);
    const voulus = this._config.modes?.length ? this._config.modes : MODES.map(([m]) => m);
    return MODES.filter(([m, bit]) => voulus.includes(m) && (feat & bit));
  }

  _codeRequis(etat, pourArmer) {
    const format = etat?.attributes?.code_format;
    if (!format) return false;
    return pourArmer ? etat.attributes.code_arm_required !== false : true;
  }

  _rendu() {
    if (!this._config || !this._hass) return;
    const id = this._entite();
    const etat = id ? this._hass.states[id] : null;
    const st = etat?.state || "unavailable";
    const [icone, couleur] = bouclier(st);
    const titre = this._config.nom || etat?.attributes?.friendly_name || this._t("nom");
    const arme = st !== "disarmed" && st !== "unavailable" && st !== "unknown";
    const format = etat?.attributes?.code_format;
    const enSaisie = this._enSaisie && etat;  // action choisie, code à taper

    const boutons = !etat || st === "unavailable" ? "" : enSaisie
      ? `<button class="action" data-a="annuler">${this._t("annuler")}</button>
         <button class="action ${this._enSaisie === "alarm_disarm" ? "rouge-plein" : "bleu-plein"}" data-a="valider"><ha-icon icon="mdi:check"></ha-icon>${this._t("valider")}</button>`
      : arme
      ? `<button class="action rouge-plein" data-s="alarm_disarm"><ha-icon icon="mdi:shield-off-outline"></ha-icon>${this._t("desarmer")}</button>`
      : this._modesVisibles(etat).map(([m, , service, ic]) =>
          `<button class="action mode-${m}" data-s="${service}"><ha-icon icon="${ic}"></ha-icon>${esc(this._t(`modes.${m}`))}</button>`).join("");

    const clavier = enSaisie ? `
      <div class="code">
        <input type="password" inputmode="${format === "number" ? "numeric" : "text"}" autocomplete="off"
          placeholder="${this._t("code")}" aria-label="${this._t("code")}" value="${esc(this._code)}" data-f="code">
        ${format === "number" ? `<div class="pave">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k) =>
          k === "" ? "<span></span>" : `<button class="touche" data-k="${k}" aria-label="${k === "⌫" ? this._t("effacer") : k}">${k}</button>`).join("")}</div>` : ""}
      </div>` : "";

    const d = this._donnees;
    let regles = "";
    if (this._config.afficher_regles && d) {
      const ev = d.evenement;
      const entete = ev ? this._t(ev.evenement === "armement" ? "depuis_arm" : "depuis_des", { h: this._heure(ev.date) })
        + (ev.mode ? ` · ${this._t(`modes.${ev.mode}`)}` : "") : "";
      // Une ligne par exécution : le résultat de la vérification est rattaché à l'exécution qui la précède
      const lignes = [];
      for (const e of [...(d.executions || [])].reverse()) {
        const verif = e.resultat === "verif_ok" || e.resultat === "verif_echec";
        const prec = verif ? [...lignes].reverse().find((l) => l.regle_id === e.regle_id && l.regle === e.regle && !l.verif) : null;
        if (prec) prec.verif = e.resultat; else lignes.push({ ...e, verif: verif ? e.resultat : null, seule: verif });
      }
      const html = lignes.reverse().map((e) => {
        const res = e.verif === "verif_echec" ? "verif_echec" : e.resultat === "erreur" ? "erreur" : e.resultat === "restauree" ? "restauree" : e.seule ? e.verif : "ok";
        const [ic, coul] = ICONES_RES[res] || ["mdi:circle-small", "gris"];
        const details = [e.seule ? this._t(`res_${e.verif}`) : e.resultat === "restauree" ? this._t(e.detail === "1" ? "res_restauree_1" : "res_restauree", { n: e.detail }) : this._t(`res_${e.resultat}`)];
        if (e.verif && !e.seule) details.push(this._t(`${e.verif}_court`));
        if (e.evenement === "surveillance") details.push(this._t("pendant"));
        details.push(this._heure(e.date));
        return `<li><ha-icon class="${coul}" icon="${ic}"></ha-icon><span class="nom-regle">${esc(e.regle)}</span>
          <span class="sous">${esc(details.join(" · "))}</span></li>`;
      }).join("");
      const n = lignes.length;
      regles = `<section class="regles">
        ${this._entete("regles", `${this._t("regles")}${n ? ` (${n})` : ""}`, entete)}
        ${this._replie("regles") ? "" : `${d.actif === false ? `<p class="sous avertissement">${this._t("pause")}</p>` : ""}
        ${html ? `<ul>${html}</ul>` : `<p class="sous">${this._t("aucune")}</p>`}`}
      </section>`;
    }

    const capteurs = this._config.afficher_capteurs ? (this._config.capteurs || []).filter((e) => this._hass.states[e]) : [];
    const style = this._config.affichage_capteurs || "pastilles";
    const infos = capteurs.map((e) => {
      const s = this._hass.states[e];
      return { e, nom: s.attributes.friendly_name || e, val: this._hass.formatEntityState ? this._hass.formatEntityState(s) : s.state,
        actif: ["on", "open", "opening", "unlocked", "detected"].includes(s.state) };
    });
    const bouton = (c, cls) => `<button class="capteur ${cls} ${c.actif ? "actif" : ""}" data-e="${esc(c.e)}" title="${esc(`${c.nom} : ${c.val}`)}">
      <ha-state-icon></ha-state-icon><span class="nom-capteur">${esc(c.nom)}</span><span class="val">${esc(c.val)}</span></button>`;
    let corps = "";
    if (style === "resume") {
      // Résumé : seuls les capteurs ouverts / en détection, le reste en une ligne
      const ouverts = infos.filter((c) => c.actif);
      corps = `${ouverts.length
        ? `<div class="pastilles">${ouverts.map((c) => bouton(c, "pastille")).join("")}</div>`
        : `<div class="tout-ok"><ha-icon icon="mdi:check-circle"></ha-icon>${this._t("tout_ferme", { n: infos.length })}</div>`}
        ${this._voirTout ? `<div class="pastilles">${infos.filter((c) => !c.actif).map((c) => bouton(c, "pastille")).join("")}</div>` : ""}
        ${infos.length > ouverts.length ? `<button class="voir" data-v="1">${this._t(this._voirTout ? "masquer_fermes" : "voir_tout")}</button>` : ""}`;
    } else if (style === "lignes") {
      corps = `<div class="lignes">${infos.map((c) => bouton(c, "ligne")).join("")}</div>`;
    } else {
      corps = `<div class="pastilles">${infos.map((c) => bouton(c, "pastille")).join("")}</div>`;
    }
    const actifs = infos.filter((c) => c.actif).length;
    const blocCapteurs = infos.length ? `<section class="capteurs">
      ${this._entete("capteurs", this._t("capteurs"), actifs ? this._t("n_ouverts", { n: actifs }) : "")}
      ${this._replie("capteurs") ? "" : corps}</section>` : "";

    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <ha-card>
        <div class="tete">
          <div class="bouclier ${couleur}${st === "triggered" ? " clignote" : ""}"><ha-icon icon="${icone}"></ha-icon></div>
          <div class="noms"><div class="titre">${esc(titre)}</div>
            <div class="etat ${couleur}">${esc(id ? (TEXTES[langue(this._hass)].etats[st] || st) : this._t("choisir_alarme"))}</div></div>
          ${this._config.afficher_panneau && st === "disarmed" && !enSaisie
            ? `<a class="lien" href="/protocole-alarme" title="${this._t("panneau_aide")}"><ha-icon icon="mdi:format-list-checks"></ha-icon>${this._t("panneau")}</a>` : ""}
        </div>
        ${clavier}
        ${boutons ? `<div class="actions">${boutons}</div>` : ""}
        ${regles}
        ${blocCapteurs}
      </ha-card>`;
    // Icônes d'état des capteurs (composant de Home Assistant)
    this.shadowRoot.querySelectorAll(".capteur").forEach((b) => {
      const ic = b.querySelector("ha-state-icon");
      if (ic) { ic.hass = this._hass; ic.stateObj = this._hass.states[b.dataset.e]; }
    });
    this._brancher();
  }

  _brancher() {
    const r = this.shadowRoot;
    r.querySelectorAll("button.action").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.a === "annuler") { this._enSaisie = null; this._code = ""; this._rendu(); return; }
      if (b.dataset.a === "valider") { this._appeler(this._enSaisie); return; }
      const etat = this._hass.states[this._entite()];
      if (this._codeRequis(etat, b.dataset.s !== "alarm_disarm")) { this._enSaisie = b.dataset.s; this._code = ""; this._rendu(); return; }
      this._appeler(b.dataset.s);
    }));
    r.querySelectorAll("button.touche").forEach((b) => b.addEventListener("click", () => {
      this._code = b.dataset.k === "⌫" ? this._code.slice(0, -1) : (this._code + b.dataset.k).slice(0, 12);
      const champ = r.querySelector('[data-f="code"]');
      if (champ) champ.value = this._code;
    }));
    const champ = r.querySelector('[data-f="code"]');
    if (champ) champ.addEventListener("input", () => { this._code = champ.value.slice(0, 32); });
    const voir = r.querySelector("button.voir");
    if (voir) voir.addEventListener("click", () => { this._voirTout = !this._voirTout; this._rendu(); });
    r.querySelectorAll("button.titre-section").forEach((b) => b.addEventListener("click", () => this._basculer(b.dataset.l)));
    r.querySelectorAll("button.capteur").forEach((b) => b.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: b.dataset.e }, bubbles: true, composed: true }));
    }));
    const lien = r.querySelector("a.lien");
    if (lien) lien.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState(null, "", "/protocole-alarme");
      window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    });
  }

  async _appeler(service) {
    const donnees = { entity_id: this._entite() };
    if (this._code) donnees.code = this._code;
    try {
      await this._hass.callService("alarm_control_panel", service, donnees);
    } finally {
      this._code = ""; // le code n'est jamais gardé
      this._enSaisie = null;
      this._rendu();
    }
  }
}

class ProtocoleAlarmeCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._rendu(); }
  set hass(hass) {
    this._hass = hass;
    if (this._form) { this._form.hass = hass; this._ajout.hass = hass; this._liste(); } else this._rendu();
  }

  _changer(config) {
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _rendu() {
    if (!this._hass || !this._config) return;
    const T = TEXTES[langue(this._hass)];
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => T.ed[s.name] || s.name;
      this._form.addEventListener("value-changed", (e) => this._changer({ ...e.detail.value, capteurs: this._config.capteurs || [] }));
      // Capteurs : liste ordonnée (monter / descendre / retirer) + sélecteur pour en ajouter
      this._bloc = document.createElement("div");
      this._bloc.className = "pa-capteurs";
      this._ajout = document.createElement("ha-form");
      this._ajout.computeLabel = () => T.ed.ajouter_capteur;
      this._ajout.schema = [{ name: "ajout", selector: { entity: {} } }];
      this._ajout.addEventListener("value-changed", (e) => {
        const id = e.detail.value?.ajout;
        const liste = this._config.capteurs || [];
        if (id && !liste.includes(id)) this._changer({ ...this._config, capteurs: [...liste, id] });
        this._ajout.data = {};
        this._liste();
      });
      const style = document.createElement("style");
      style.textContent = `.pa-capteurs { margin: 16px 0 8px; } .pa-titre { font-weight: 500; margin-bottom: 6px; }
        .pa-ligne { display: flex; align-items: center; gap: 4px; padding: 4px 0; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
        .pa-nom { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pa-nom small { display: block; color: var(--secondary-text-color); }
        .pa-ligne button { width: 36px; height: 36px; border: 0; border-radius: 50%; background: none; color: inherit; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .pa-ligne button:disabled { opacity: .3; cursor: default; }
        .pa-ligne button:not(:disabled):hover { background: var(--secondary-background-color, #f5f5f5); }
        .pa-vide { color: var(--secondary-text-color); font-size: 14px; padding: 4px 0 8px; }`;
      this.append(style, this._form, this._bloc);
    }
    this._form.hass = this._hass;
    this._form.schema = [
      { name: "entity", selector: { entity: { domain: "alarm_control_panel" } } },
      { name: "nom", selector: { text: {} } },
      { name: "modes", selector: { select: { multiple: true, mode: "list", options: MODES.map(([m]) => ({ value: m, label: T.modes[m] })) } } },
      { name: "afficher_regles", selector: { boolean: {} } },
      { name: "afficher_panneau", selector: { boolean: {} } },
      { name: "afficher_capteurs", selector: { boolean: {} } },
      { name: "affichage_capteurs", selector: { select: { mode: "dropdown", options: [
        { value: "pastilles", label: T.styles.pastilles }, { value: "lignes", label: T.styles.lignes }, { value: "resume", label: T.styles.resume }] } } },
    ];
    this._form.data = { afficher_regles: true, afficher_capteurs: true, afficher_panneau: true, modes: ["armed_away", "armed_night"],
      affichage_capteurs: "pastilles", ...this._config };
    this._ajout.hass = this._hass;
    this._liste();
  }

  _liste() {
    const T = TEXTES[langue(this._hass)];
    const liste = this._config.capteurs || [];
    this._bloc.innerHTML = `<div class="pa-titre">${esc(T.ed.capteurs)}</div>
      ${liste.length ? liste.map((e, k) => {
        const s = this._hass.states[e];
        return `<div class="pa-ligne"><span class="pa-nom">${esc(s?.attributes?.friendly_name || e)}<small>${esc(e)}</small></span>
          <button data-a="haut" data-k="${k}" ${k === 0 ? "disabled" : ""} aria-label="${esc(T.ed.monter)}"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button data-a="bas" data-k="${k}" ${k === liste.length - 1 ? "disabled" : ""} aria-label="${esc(T.ed.descendre)}"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          <button data-a="retirer" data-k="${k}" aria-label="${esc(T.ed.retirer)}"><ha-icon icon="mdi:close"></ha-icon></button></div>`;
      }).join("") : `<div class="pa-vide">${esc(T.ed.aucun_capteur)}</div>`}`;
    this._bloc.appendChild(this._ajout);
    this._bloc.querySelectorAll("button[data-a]").forEach((b) => b.addEventListener("click", () => {
      const l = [...(this._config.capteurs || [])];
      const k = Number(b.dataset.k);
      if (b.dataset.a === "retirer") l.splice(k, 1);
      else {
        const j = b.dataset.a === "haut" ? k - 1 : k + 1;
        [l[k], l[j]] = [l[j], l[k]];
      }
      this._changer({ ...this._config, capteurs: l });
      this._liste();
    }));
  }
}

const STYLE = `
  :host { --vert: var(--success-color, #2e7d32); --rouge: var(--error-color, #c62828); --orange: var(--warning-color, #ef6c00); }
  ha-card { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .tete { display: flex; align-items: center; gap: 14px; }
  .bouclier { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: none; }
  .bouclier ha-icon { --mdc-icon-size: 34px; }
  .bouclier.vert { background: rgba(46,125,50,.14); color: var(--vert); }
  .bouclier.rouge { background: rgba(198,40,40,.14); color: var(--rouge); }
  .bouclier.orange { background: rgba(239,108,0,.14); color: var(--orange); }
  .bouclier.gris { background: rgba(127,127,127,.14); color: var(--disabled-text-color, #9e9e9e); }
  .clignote { animation: clignote 1s infinite; }
  @keyframes clignote { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { .clignote { animation: none; } }
  .noms { flex: 1; min-width: 0; }
  .titre { font-size: 18px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .etat { font-size: 14px; font-weight: 500; margin-top: 2px; }
  .etat.vert { color: var(--vert); } .etat.rouge { color: var(--rouge); } .etat.orange { color: var(--orange); } .etat.gris { color: var(--secondary-text-color); }
  .lien { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 20px; flex: none; text-decoration: none; font-size: 14px; font-weight: 500;
    color: var(--primary-color, #03a9f4); border: 1px solid var(--divider-color, #e0e0e0); }
  .lien:hover { background: var(--secondary-background-color, #f5f5f5); }
  .lien ha-icon { --mdc-icon-size: 20px; }
  .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
  .action { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; border-radius: 12px; cursor: pointer; font: inherit; font-weight: 500;
    border: 1px solid var(--divider-color, #e0e0e0); background: var(--card-background-color, #fff); color: var(--primary-text-color); }
  .action:hover { background: var(--secondary-background-color, #f5f5f5); }
  /* Une couleur par mode d'armement */
  .action[class*="mode-"] { border-color: transparent; background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--c); }
  .action[class*="mode-"]:hover { background: color-mix(in srgb, var(--c) 24%, transparent); }
  .mode-armed_away { --c: #c62828; }
  .mode-armed_night { --c: #3949ab; }
  .mode-armed_home { --c: #ef6c00; }
  .mode-armed_vacation { --c: #00897b; }
  .mode-armed_custom_bypass { --c: #6d4c41; }
  .action.rouge-plein { background: var(--rouge); color: #fff; border-color: transparent; }
  .action.bleu-plein { background: var(--primary-color, #03a9f4); color: #fff; border-color: transparent; }
  .actions > .action:only-child { grid-column: 1 / -1; }
  .code { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .code input { width: 100%; max-width: 240px; box-sizing: border-box; font-size: 20px; letter-spacing: .3em; text-align: center; padding: 10px; border-radius: 10px;
    border: 1px solid var(--divider-color, #e0e0e0); background: transparent; color: inherit; }
  .pave { display: grid; grid-template-columns: repeat(3, 64px); gap: 8px; }
  .touche { height: 48px; border-radius: 12px; border: 1px solid var(--divider-color, #e0e0e0); background: transparent; color: inherit; font-size: 20px; cursor: pointer; }
  .touche:hover { background: var(--secondary-background-color, #f5f5f5); }
  .titre-section { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 4px 0; border: 0; background: none; cursor: pointer; font: inherit;
    font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color); text-align: left; }
  .titre-section .t { flex: 1; white-space: nowrap; }
  .titre-section .sous { text-transform: none; letter-spacing: 0; font-weight: 400; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .titre-section ha-icon { flex: none; }
  .sous { font-size: 13px; color: var(--secondary-text-color); }
  .avertissement { color: var(--orange); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: grid; grid-template-columns: 24px 1fr; column-gap: 10px; padding: 6px 0; border-top: 1px solid var(--divider-color, #eee); }
  li ha-icon { grid-row: span 2; align-self: center; }
  .nom-regle { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ha-icon.violet { color: #8e44ad; } ha-icon.vert, ha-state-icon.vert { color: var(--vert); } ha-icon.rouge { color: var(--rouge); } ha-icon.orange, ha-state-icon.orange, .val.orange { color: var(--orange); }
  .pastilles { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .capteur { font: inherit; cursor: pointer; color: var(--primary-text-color); background: var(--card-background-color, #fff); border: 1px solid var(--divider-color, #e0e0e0); }
  .capteur:hover { background: var(--secondary-background-color, #f5f5f5); }
  .capteur ha-state-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); flex: none; }
  /* Capteur au repos : grisé ; déclenché (ouvert, détection…) : orange */
  .capteur:not(.actif) { background: var(--secondary-background-color, #f2f2f2); border-color: transparent; color: var(--secondary-text-color, #757575); }
  .capteur:not(.actif) ha-state-icon { color: var(--disabled-text-color, #9e9e9e); }
  .capteur:not(.actif):hover { color: var(--primary-text-color); }
  .capteur.actif { border-color: var(--orange); background: rgba(239,108,0,.10); color: var(--primary-text-color); }
  .capteur.actif ha-state-icon, .capteur.actif .val { color: var(--orange); }
  .pastille { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px 0 10px; border-radius: 18px; max-width: 100%; }
  .pastille .nom-capteur { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pastille .val { display: none; }
  .pastille.actif .val { display: inline; font-size: 12px; font-weight: 500; }
  .pastille.actif .val::before { content: "· "; }
  .lignes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
  .ligne { display: grid; grid-template-columns: 22px 1fr; column-gap: 8px; align-items: center; padding: 8px 10px; border-radius: 10px; text-align: left; min-width: 0; }
  .ligne ha-state-icon { grid-row: span 2; }
  .ligne .nom-capteur { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ligne .val { font-size: 12px; color: var(--secondary-text-color); }
  .tout-ok { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--vert); padding: 4px 0; }
  .voir { margin-top: 8px; border: 0; background: none; color: var(--primary-color, #03a9f4); font: inherit; font-size: 13px; cursor: pointer; padding: 6px 0; }
`;

if (!customElements.get("protocole-alarme-card")) customElements.define("protocole-alarme-card", ProtocoleAlarmeCard);
if (!customElements.get("protocole-alarme-card-editor")) customElements.define("protocole-alarme-card-editor", ProtocoleAlarmeCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "protocole-alarme-card")) {
  window.customCards.push({
    type: "protocole-alarme-card", name: "Protocole Alarme",
    description: "Armer / désarmer, règles exécutées et capteurs — Arm / disarm, rules that ran and sensors",
    preview: true, documentationURL: "https://github.com/akoonet-homeassistant/protocole_alarme",
  });
}
