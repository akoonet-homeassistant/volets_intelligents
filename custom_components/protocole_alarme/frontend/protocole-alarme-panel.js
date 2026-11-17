// Protocole Alarme — panneau latéral : règles (assistant en 3 étapes), entités, journal, réglages.

const VERSION_URL = new URL(import.meta.url).search;
const { TEXTES, MODES, ACTIONS, ACTIONS_DOMAINE, DOMAINES, ETATS, TYPES } = await import(`./i18n.js${VERSION_URL}`);

const DOMAINE = "protocole_alarme";
const ORDRE_MODES = ["armed_away", "armed_night", "armed_home", "armed_vacation", "armed_custom_bypass"];
const ONGLETS = ["regles", "entites", "journal", "reglages"];

const ICONES = {
  cover: "mdi:window-shutter", light: "mdi:lightbulb", switch: "mdi:toggle-switch", input_boolean: "mdi:toggle-switch-outline",
  fan: "mdi:fan", siren: "mdi:bullhorn", button: "mdi:gesture-tap-button", input_button: "mdi:gesture-tap-button",
  lock: "mdi:lock", climate: "mdi:thermostat", media_player: "mdi:cast", scene: "mdi:palette", script: "mdi:script-text",
  automation: "mdi:robot", select: "mdi:format-list-bulleted", input_select: "mdi:format-list-bulleted", valve: "mdi:valve",
  binary_sensor: "mdi:checkbox-blank-circle-outline", sensor: "mdi:eye", person: "mdi:account", device_tracker: "mdi:map-marker",
  simulateur: "mdi:home-lightbulb", notification: "mdi:bell-ring", alarm_control_panel: "mdi:shield-home", alarme: "mdi:alarm-light",
};
const COULEURS = {
  cover: "bleu", light: "jaune", switch: "gris", input_boolean: "gris", lock: "vert", climate: "orange", binary_sensor: "orange",
  simulateur: "jaune", notification: "violet", alarme: "orange", alarm_control_panel: "orange", scene: "violet", script: "violet", automation: "violet",
};
const ICONES_CLASSE = {
  door: "mdi:door", garage_door: "mdi:garage", window: "mdi:window-closed-variant", opening: "mdi:square-rounded-outline",
  motion: "mdi:motion-sensor", occupancy: "mdi:home-account", presence: "mdi:home-account", battery: "mdi:battery",
  battery_charging: "mdi:battery-charging", plug: "mdi:power-plug", power: "mdi:flash", problem: "mdi:alert-circle-outline",
  safety: "mdi:shield-alert-outline", smoke: "mdi:smoke-detector", moisture: "mdi:water", gas: "mdi:gas-cylinder",
  lock: "mdi:lock-open-variant", connectivity: "mdi:wifi", temperature: "mdi:thermometer", humidity: "mdi:water-percent",
  illuminance: "mdi:brightness-5", vibration: "mdi:vibrate", tamper: "mdi:shield-alert", running: "mdi:play-circle-outline",
  shutter: "mdi:window-shutter", blind: "mdi:blinds", garage: "mdi:garage", gate: "mdi:gate", curtain: "mdi:curtains",
  outlet: "mdi:power-socket-fr",
};
const CATEGORIES = [
  ["volets", "mdi:window-shutter"], ["intrusion", "mdi:alarm-light"], ["acces", "mdi:garage-variant"],
  ["lumieres", "mdi:lightbulb-group"], ["chauffage", "mdi:thermostat"], ["notifications", "mdi:bell-ring"], ["autres", "mdi:shape-outline"],
];
const TITRE_DEFAUT = "Protocole Alarme";

// Même logique que regles.categorie_auto côté serveur
const TYPES_DEFAUT = CATEGORIES.map(([id, icone]) => ({ id, nom: null, icone }));
// Icônes proposées pour un type de règle
const ICONES_TYPES = [
  "mdi:window-shutter", "mdi:window-open-variant", "mdi:alarm-light", "mdi:shield-home", "mdi:garage-variant", "mdi:door",
  "mdi:lock", "mdi:lightbulb-group", "mdi:home-lightbulb", "mdi:thermostat", "mdi:radiator", "mdi:water",
  "mdi:bell-ring", "mdi:cctv", "mdi:robot-vacuum", "mdi:power-plug", "mdi:television", "mdi:pool",
  "mdi:flower", "mdi:car", "mdi:paw", "mdi:weather-night", "mdi:star", "mdi:shape-outline",
];
// Domaines dont l'état peut être remis à l'identique (scene.apply)
const RESTAURABLES = new Set(["light", "switch", "cover", "climate", "fan", "media_player", "input_boolean", "valve", "siren", "humidifier", "water_heater", "select", "input_select", "input_number", "number", "automation"]);
const CLE_REPLIES = "protocole_alarme.types_replies";
const categorieAuto = (r) => {
  const actions = r.actions || [];
  if (r.avance || !actions.length) return "autres";
  const types = new Set(actions.map((a) => a.type));
  const domaines = new Set(actions.filter((a) => a.type === "entite" && a.entity_id).map((a) => a.entity_id.split(".")[0]));
  if (types.has("alarme")) return "intrusion";
  if (domaines.has("cover")) return "volets";
  if (domaines.has("light") || types.has("simulateur")) return "lumieres";
  if (domaines.has("lock") || actions.some((a) => a.action === "impulsion")) return "acces";
  if (domaines.has("climate")) return "chauffage";
  if (types.size === 1 && types.has("notification")) return "notifications";
  return "autres";
};

const ICONE_EVENEMENT = { armement: "mdi:lock", desarmement: "mdi:lock-open-variant", test: "mdi:play", surveillance: "mdi:eye-outline" };

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const CLE_STATUT = { absent: "non_installe", non_configure: "non_configure", pret: "pret" };
const domaineDe = (entityId) => String(entityId || "").split(".")[0];
const copie = (o) => JSON.parse(JSON.stringify(o));

class ProtocoleAlarmePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._onglet = "regles";
    this._evenement = "armement";
    this._vue = "liste"; // liste | modeles | assistant
    this._etape = 1;
    this._brouillon = null;
    this._siCond = false;
    this._yaml = "";
    this._selecteur = null;
    this._confirmer = null;
    this._message = null;
    this._erreur = null;
    this._d = null;
    // Propriétés posées par Home Assistant avant la définition de l'élément : on les rejoue sur les setters
    for (const nom of ["hass", "narrow", "panel"]) {
      if (Object.prototype.hasOwnProperty.call(this, nom)) {
        const valeur = this[nom];
        delete this[nom];
        this[nom] = valeur;
      }
    }
  }

  // ------------------------------------------------------------------ Home Assistant

  set hass(hass) {
    const premier = !this._hass;
    this._hass = hass;
    if (premier) this._charger();
    else if (this._vue === "liste" && !this._selecteur && Date.now() - (this._dernierDessin || 0) > 5000) this._dessiner();
  }
  set narrow(v) { this._narrow = v; }
  set panel(v) { this._panel = v; }

  connectedCallback() {
    if (!this._ecoute) {
      this.shadowRoot.addEventListener("click", (e) => this._clic(e));
      this.shadowRoot.addEventListener("change", (e) => this._changement(e));
      this.shadowRoot.addEventListener("input", (e) => this._saisie(e));
      this._ecoute = true;
    }
    this._minuterie = setInterval(() => { if (!document.hidden) this._charger(true); }, 15000);
    this._dessiner();
  }
  disconnectedCallback() {
    clearInterval(this._minuterie);
    clearTimeout(this._minuterieMessage);
    clearTimeout(this._minuterieRecherche);
    clearTimeout(this._minuterieEssai);
  }

  get _langue() {
    const l = (this._hass?.locale?.language || this._hass?.language || "en").toLowerCase();
    return l.startsWith("fr") ? "fr" : "en";
  }
  t(cle, vars = {}) {
    let texte = TEXTES[this._langue][cle] ?? TEXTES.en[cle] ?? cle;
    for (const [k, v] of Object.entries(vars)) texte = texte.replaceAll(`{${k}}`, v);
    return texte;
  }
  get _admin() { return this._d ? this._d.admin : !!this._hass?.user?.is_admin; }
  get _editeur() { return this._d ? !!this._d.peut_modifier : this._admin; }

  _ws(type, extra = {}) { return this._hass.callWS({ type: `${DOMAINE}/${type}`, ...extra }); }

  async _charger(silencieux = false) {
    if (!this._hass) return;
    try {
      this._d = await this._ws("etat");
      this._erreur = null;
      this._essais = 0;
    } catch (err) {
      this._erreur = err.message || String(err);
      // Intégration en cours de rechargement : nouvel essai rapide
      this._essais = (this._essais || 0) + 1;
      clearTimeout(this._minuterieEssai);
      if (this._essais <= 10) this._minuterieEssai = setTimeout(() => this._charger(true), 2000);
    }
    if (silencieux && this._vue !== "liste" && this._d) return;
    const actif = this.shadowRoot.activeElement;
    if (silencieux && actif && ["INPUT", "SELECT", "TEXTAREA"].includes(actif.tagName)) return;
    this._dessiner();
  }

  _annoncer(texte, erreur = false) {
    this._message = { texte, erreur };
    this._dessiner();
    clearTimeout(this._minuterieMessage);
    this._minuterieMessage = setTimeout(() => { this._message = null; this._dessiner(); }, erreur ? 7000 : 3500);
  }
  _texteErreur(err) {
    const brut = err?.message || String(err);
    const code = brut.split(":")[0].trim();
    if (code === "avance_admin") return this.t("avance_admin");
    return TEXTES[this._langue][`err.${code}`] ? this.t(`err.${code}`) : brut;
  }

  // ------------------------------------------------------------------ libellés

  _nomEntite(entityId) {
    const s = this._hass?.states?.[entityId];
    return s?.attributes?.friendly_name || entityId || "";
  }
  _etatLisible(entityId, etat) {
    const s = this._hass?.states?.[entityId];
    if (s && typeof this._hass.formatEntityState === "function") {
      try { return this._hass.formatEntityState(s, etat); } catch (e) { /* ancien frontend */ }
    }
    return ETATS[this._langue][etat] ?? etat;
  }
  _libelleAction(action) {
    const cle = action.type === "entite" ? `${domaineDe(action.entity_id)}.${action.action}` : "";
    return ACTIONS_DOMAINE[this._langue][cle] || ACTIONS[this._langue][action.action] || action.action;
  }
  _nomService(s) {
    if (!s) return "";
    if (s === "persistent_notification") return "Home Assistant";
    const entite = this._hass?.states?.[s];
    if (entite) return entite.attributes?.friendly_name || s;  // entité de notification (Telegram…)
    const nom = s.replace("notify.", "").replace("mobile_app_", "").replaceAll("_", " ");
    return nom.charAt(0).toUpperCase() + nom.slice(1);
  }
  _servicesDe(action) { return action.services || (action.service ? [action.service] : []); }
  _choixServices(choisis, nomAction, i, L = "") {
    const services = this._d.notifications || [];
    return `<div class="chips">${services.map((s) => {
      const on = choisis.includes(s);
      const icone = on ? "mdi:check" : this._hass?.states?.[s] ? "mdi:send" : "";
      return `<button type="button" class="chip ${on ? "on" : ""}" aria-pressed="${on}" data-a="${nomAction}" data-i="${i}"${L} data-v="${esc(s)}">${icone ? `<ha-icon icon="${icone}"></ha-icon>` : ""}${esc(this._nomService(s))}</button>`;
    }).join("")}</div>`;
  }
  _libelleMode(m) { return MODES[this._langue][m] || m; }
  _nombre(v) { return String(v).replace(".", this._langue === "fr" ? "," : "."); }

  _cible(action) {
    if (action.type === "simulateur") return this.t("simulateur");
    if (action.type === "alarme") return esc(this._nomEntite(this._d?.instantane?.alarme) || this.t("alarme"));
    if (action.type === "notification") return esc(this._servicesDe(action).map((x) => this._nomService(x)).join(", "));
    return action.entity_id ? this._nomEntite(action.entity_id) : this.t("choisir_entite_manquante");
  }
  _detailParams(action) {
    const p = action.params || {};
    const morceaux = [];
    if (action.action === "impulsion") morceaux.push(`${this._nombre(p.duree ?? 1)} s`);
    if (p.position !== undefined && action.action === "position") morceaux.push(`${p.position} %`);
    if (p.luminosite) morceaux.push(`${p.luminosite} %`);
    if (p.preset) morceaux.push(esc(p.preset));
    if (p.temperature !== undefined && action.action === "temperature") morceaux.push(`${this._nombre(p.temperature)} °`);
    if (p.option) morceaux.push(esc(p.option));
    if (action.type === "notification" && p.critique) morceaux.push(esc(this.t("critique").toLowerCase()));
    return morceaux.length ? ` (${morceaux.join(", ")})` : "";
  }
  _phrase(regle) {
    const conds = (regle.conditions || []).map(
      (c) => `<b>${esc(this._nomEntite(c.entity_id))}</b> ${this.t("est")} <i>${esc(this._etatLisible(c.entity_id, c.etat))}</i>`
    );
    const debut = conds.length ? `${this.t("si")} ${conds.join(` ${this.t("et")} `)}` : this.t("toujours");
    const actions = regle.avance
      ? this.t("script_avance", { n: (regle.sequence || []).length })
      : (regle.actions || []).map((a) => `<b>${esc(this._libelleAction(a))}</b> ${a.type === "entite" ? esc(this._cible(a)) : this._cible(a)}${this._detailParams(a)}`).join(", ");
    return `${debut} → ${actions}`;
  }
  _tolererSiTexte(regle) {
    const si = regle.tolerer_si;
    return this.t("tolerer_si_court", { e: this._nomEntite(si.entity_id), s: String(this._etatLisible(si.entity_id, si.etat)).toLowerCase() });
  }
  _modesTexte(regle) {
    const modes = regle.modes || [];
    return modes.length ? modes.map((m) => this._libelleMode(m)).join(" · ") : this.t("tous_modes");
  }

  // ------------------------------------------------------------------ événements

  async _clic(e) {
    const cible = e.target.closest("[data-a]");
    if (!cible || cible.disabled) return;
    const d = cible.dataset;
    const i = d.i !== undefined ? Number(d.i) : null;
    const b = this._brouillon;
    try {
      switch (d.a) {
        case "menu":
          this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
          return;
        case "onglet": this._onglet = d.v; this._vue = "liste"; break;
        case "evenement": this._evenement = d.v; break;
        case "actif": await this._ws("actif", { actif: !this._d.instantane.actif }); await this._charger(); return;
        case "activer": await this._ws("activer", { regle_id: d.id, actif: d.v !== "1" }); await this._charger(); return;
        case "tester": await this._ws("tester", { regle: this._regle(d.id) }); this._annoncer(this.t("teste")); return;
        case "dupliquer": await this._ws("dupliquer", { regle_id: d.id, suffixe: this.t("copie") }); await this._attendreRechargement(); return;
        case "supprimer":
          if (this._confirmer !== d.id) { this._confirmer = d.id; break; }
          this._confirmer = null;
          await this._ws("supprimer", { regle_id: d.id });
          this._annoncer(this.t("supprime"));
          await this._attendreRechargement();
          return;
        case "nouvelle": this._ouvrirAssistant(this._regleVide()); return;
        case "modifier": this._ouvrirAssistant(copie(this._regle(d.id))); return;
        case "modeles": this._vue = "modeles"; break;
        case "modele": this._ouvrirAssistant(this._modele(d.v)); return;
        case "fermer-assistant": this._vue = "liste"; this._brouillon = null; this._selecteur = null; break;
        case "etape": await this._allerEtape(Number(d.v)); return;
        case "moment": b.evenement = d.v; if (d.v !== "armement") b.surveiller = false; break;
        case "surveiller": b.surveiller = !b.surveiller; break;
        case "tolerer": b.tolerer = !b.tolerer; if (!b.tolerer) b.tolerer_si = null; break;
        case "tolerer-si":
          if (b.tolerer_si) { b.tolerer_si = null; break; }
          this._ouvrirSelecteur("tolerer", null); return;
        case "tolerer-si-entite": this._ouvrirSelecteur("tolerer", null); return;
        case "tolerer-si-etat": b.tolerer_si.etat = d.v; break;
        case "categorie": b.categorie = d.v; break;
        case "critique": { const a = this._liste(d)[i]; a.params.critique = !a.params.critique; break; }
        case "mode": b.modes = b.modes.includes(d.v) ? b.modes.filter((m) => m !== d.v) : [...b.modes, d.v]; break;
        case "si": this._siCond = d.v === "1"; if (this._siCond && !b.conditions.length) this._ouvrirSelecteur("condition", null); break;
        case "ajouter-condition": this._ouvrirSelecteur("condition", null); return;
        case "changer-condition": this._ouvrirSelecteur("condition", i); return;
        case "etat-condition": b.conditions[i].etat = d.v; break;
        case "retirer-condition": b.conditions.splice(i, 1); if (!b.conditions.length) this._siCond = false; break;
        case "ajouter-action": this._ouvrirSelecteur("action", null, d.l); return;
        case "changer-action": this._ouvrirSelecteur("action", i, d.l); return;
        case "choix-action": { const a = this._liste(d)[i]; a.action = d.v; this._paramsParDefaut(a); break; }
        case "retirer-action": {
          const [retiree] = this._liste(d).splice(i, 1);
          if (d.l !== "v") this._oublierRestaurer(retiree);
          break;
        }
        case "verif":
          b.verification.active = !b.verification.active;
          if (b.verification.active && !b.verification.actions.length) b.verification.actions.push(this._notifEchec());
          this._completerVerif(); break;
        case "verif-entite": this._ouvrirSelecteur("verif", null); return;
        case "restaurer":
          b.restaurer.active = !b.restaurer.active;
          if (b.restaurer.active && !b.restaurer.entites.length) b.restaurer.entites = this._ciblesRestaurables(b);
          break;
        case "restaurer-ajouter": this._ouvrirSelecteur("restaurer", null); return;
        case "restaurer-retirer": {
          const [id] = b.restaurer.entites.splice(i, 1);
          b.restaurer.manuelles = (b.restaurer.manuelles || []).filter((e) => e !== id);
          break;
        }
        case "verif-etat": b.verification.etat = d.v; break;
        case "notif-service": {
          const a = this._liste(d)[i];
          const l = a.services;
          if (l.includes(d.v) && l.length === 1) break;
          a.services = l.includes(d.v) ? l.filter((x) => x !== d.v) : [...l, d.v];
          break;
        }
        case "delai": b.delai_s = Math.max(0, Math.min(3600, (b.delai_s || 0) + Number(d.v))); break;
        case "choisir": this._choisir(d.v); return;
        case "fermer-selecteur": this._selecteur = null; break;
        case "domaine-filtre": this._selecteur.domaine = this._selecteur.domaine === d.v ? null : d.v; break;
        case "tester-brouillon": await this._ws("tester", { regle: await this._brouillonPret() }); this._annoncer(this.t("teste")); return;
        case "enregistrer": await this._enregistrer(); return;
        case "avance": await this._passerAvance(); return;
        case "simple": b.avance = false; b.sequence = []; this._yaml = ""; break;
        case "editeur": {
          const liste = new Set(this._d.editeurs || []);
          if (liste.has(d.id)) liste.delete(d.id); else liste.add(d.id);
          const res = await this._ws("editeurs", { editeurs: [...liste] });
          this._d.editeurs = res.editeurs;
          break;
        }
        case "groupe": this._basculerGroupe(d.v); break;
        case "groupes-tous": {
          const r = this._replies();
          const ids = this._types().map((t) => t.id);
          if (d.v === "1") ids.forEach((id) => r.delete(id)); else ids.forEach((id) => r.add(id));
          try { localStorage.setItem(CLE_REPLIES, JSON.stringify([...r])); } catch (_e) { /* mémoire seulement */ }
          break;
        }
        case "type-ajouter": {
          const types = [...this._types()];
          const id = `t${Math.random().toString(36).slice(2, 10)}`;
          types.splice(Math.max(types.findIndex((t) => t.id === "autres"), 0), 0, { id, nom: this.t("nouveau_type"), icone: "mdi:star" });
          await this._enregistrerTypes(types);
          this._typeEdite = id;
          break;
        }
        case "type-monter":
        case "type-descendre": {
          const types = [...this._types()];
          const k = types.findIndex((t) => t.id === d.v);
          const j = d.a === "type-monter" ? k - 1 : k + 1;
          if (k < 0 || j < 0 || j >= types.length) break;
          [types[k], types[j]] = [types[j], types[k]];
          await this._enregistrerTypes(types);
          break;
        }
        case "type-supprimer": await this._enregistrerTypes(this._types().filter((t) => t.id !== d.v)); break;
        case "type-icones": this._typeEdite = this._typeEdite === d.v ? null : d.v; break;
        case "type-icone": {
          await this._enregistrerTypes(this._types().map((t) => (t.id === d.id ? { ...t, icone: d.v } : t)));
          this._typeEdite = null;
          break;
        }
        case "exporter": await this._exporter(false); return;
        case "copier-export": await this._exporter(true); return;
        case "import-mode": this._import.remplacer = d.v === "1"; this._import.confirmer = false; break;
        case "import-annuler": this._import = null; break;
        case "import-valider": await this._importer(); return;
        case "vider-journal": await this._ws("vider_journal"); await this._charger(); return;
        case "plus-info":
          this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: d.id }, bubbles: true, composed: true }));
          return;
        default: return;
      }
      this._dessiner();
    } catch (err) {
      this._annoncer(this._texteErreur(err), true);
    }
  }

  _saisie(e) {
    const c = e.target;
    const b = this._brouillon;
    if (!c.dataset.f) return;
    const i = c.dataset.i !== undefined ? Number(c.dataset.i) : null;
    switch (c.dataset.f) {
      case "nom": b.nom = c.value; break;
      case "recherche":
        this._selecteur.recherche = c.value;
        clearTimeout(this._minuterieRecherche);
        this._minuterieRecherche = setTimeout(() => this._dessinerListe(), 120);
        break;
      case "yaml": this._yaml = c.value; break;
      case "message":
      case "titre": {
        this._liste(c.dataset)[i].params[c.dataset.f] = c.value;
        const apercu = this.shadowRoot.getElementById(`apercu-${c.dataset.l || ""}${i}`);
        if (apercu) apercu.textContent = this._apercu(this._liste(c.dataset)[i].params.message, c.dataset.l);
        break;
      }
      case "param": {
        const action = this._liste(c.dataset)[i];
        action.params[c.dataset.p] = c.type === "range" || c.type === "number" ? Number(c.value) : c.value;
        const sortie = this.shadowRoot.getElementById(`val-${c.dataset.l || ""}${i}-${c.dataset.p}`);
        if (sortie) sortie.textContent = this._valeurParam(c.dataset.p, action.params[c.dataset.p]);
        break;
      }
      default: break;
    }
  }

  _changement(e) {
    const c = e.target;
    if (c.dataset.f === "fichier-import") { this._lireFichier(c.files?.[0]); c.value = ""; return; }
    if (c.dataset.f === "type-nom") {
      const nom = c.value.trim();
      const types = this._types().map((t) => {
        if (t.id !== c.dataset.id) return t;
        const origine = CATEGORIES.some(([x]) => x === t.id);
        // Nom vide : un type d'origine reprend son nom traduit ; un type créé garde l'ancien nom
        return { ...t, nom: nom || (origine ? null : t.nom) };
      });
      this._enregistrerTypes(types).then(() => this._dessiner()).catch((err) => this._annoncer(this._texteErreur(err), true));
      return;
    }
    const b = this._brouillon;
    if (!c.dataset.f) return;
    const i = c.dataset.i !== undefined ? Number(c.dataset.i) : null;
    switch (c.dataset.f) {
      case "param-select": this._liste(c.dataset)[i].params[c.dataset.p] = c.value === "" ? undefined : c.value; break;
      case "etat-libre": b.conditions[i].etat = c.value.trim(); break;
      case "grace": b.grace_s = Math.max(0, Math.min(600, Number(c.value) || 0)); break;
      case "verif-delai": b.verification.delai_s = Math.max(0, Number(c.value) || 0); break;
      case "verif-etat-libre": b.verification.etat = c.value.trim(); break;
      case "tolerer-si-libre": b.tolerer_si.etat = c.value.trim(); break;
      default: return;
    }
    this._dessiner();
  }

  async _attendreRechargement() {
    // Ajouter ou supprimer une règle recharge l'intégration (entités par règle) : on relit jusqu'à ce que ce soit prêt
    const avant = JSON.stringify((this._d?.regles || []).map((r) => r.id));
    for (let essai = 0; essai < 8; essai += 1) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const d = await this._ws("etat");
        this._d = d;
        if (JSON.stringify(d.regles.map((r) => r.id)) !== avant || essai >= 2) break;
      } catch (err) { /* intégration en cours de rechargement */ }
    }
    this._dessiner();
  }

  // ------------------------------------------------------------------ règles et brouillon

  _regle(id) { return (this._d?.regles || []).find((r) => r.id === id); }

  // ---- Types de règle
  _types() { return this._d?.types?.length ? this._d.types : TYPES_DEFAUT; }
  _nomType(t) { return t.nom || (CATEGORIES.some(([c]) => c === t.id) ? this.t(`cat_${t.id}`) : t.id); }
  _categorieDe(r) {
    const ids = new Set(this._types().map((t) => t.id));
    if (ids.has(r.categorie)) return r.categorie;
    const auto = categorieAuto(r);
    return ids.has(auto) ? auto : "autres";
  }
  _replies() {
    if (!this.__replies) {
      try { this.__replies = new Set(JSON.parse(localStorage.getItem(CLE_REPLIES) || "[]")); } catch (_e) { this.__replies = new Set(); }
    }
    return this.__replies;
  }
  _basculerGroupe(id) {
    const r = this._replies();
    if (r.has(id)) r.delete(id); else r.add(id);
    try { localStorage.setItem(CLE_REPLIES, JSON.stringify([...r])); } catch (_e) { /* stockage indisponible : l'état reste en mémoire */ }
  }
  async _enregistrerTypes(types) {
    const res = await this._ws("types", { types });
    this._d.types = res.types;
    this._d.regles = res.regles;
  }

  // Liste d'actions visée : actions de la règle, ou actions en cas d'échec de la vérification (data-l="v")
  _liste(d) { return d?.l === "v" ? this._brouillon.verification.actions : this._brouillon.actions; }

  _regleVide(evenement = this._evenement) {
    return {
      nom: "", actif: true, evenement, modes: [], conditions: [], actions: [], delai_s: 0, grace_s: 0, tolerer: false,
      tolerer_si: null, categorie: null,
      verification: { active: false, delai_s: 45, entity_id: null, etat: null, actions: [] },
      restaurer: { active: false, entites: [] },
      avance: false, sequence: [],
    };
  }
  _notifEchec() {
    return { type: "notification", services: [this._notifParDefaut()], action: "envoyer", params: { message: this._messageDefaut(), titre: TITRE_DEFAUT, critique: false } };
  }
  _notifParDefaut() {
    const liste = this._d?.notifications || [];
    return liste.find((s) => s.startsWith("notify.mobile_app")) || liste[0] || "persistent_notification";
  }

  _modele(cle) {
    const r = this._regleVide("armement");
    const nom = this.t(`m_${cle}`);
    const action = (domaine, act, params = {}) => ({ type: "entite", entity_id: "", action: act, params, _domaine: domaine });
    switch (cle) {
      case "garage":
        r.modes = ["armed_away", "armed_night"];
        r.nom = this._langue === "fr" ? "Fermer le garage" : "Close the garage";
        r.conditions = [{ entity_id: "", etat: "on", _domaine: "binary_sensor" }];
        r.surveiller = true;
        r.actions = [action("switch", "impulsion", { duree: 1 })];
        r.verification = { ...r.verification, active: true, delai_s: 45, etat: "off", actions: [this._notifEchec()] };
        break;
      case "volet":
        r.nom = this._langue === "fr" ? "Volet si fenêtre ouverte" : "Shutter if window open";
        r.conditions = [{ entity_id: "", etat: "on", _domaine: "binary_sensor" }];
        r.surveiller = true;
        r.actions = [action("cover", "fermer")];
        break;
      case "simu":
        r.nom = this.t("simulateur");
        r.modes = ["armed_away", "armed_vacation"];
        r.actions = [{ type: "simulateur", action: "demarrer", params: {} }];
        break;
      case "simu_stop":
        r.evenement = "desarmement";
        r.nom = this._langue === "fr" ? "Arrêt du simulateur" : "Simulator off";
        r.actions = [{ type: "simulateur", action: "arreter", params: {} }];
        break;
      case "lumiere":
        r.nom = this._langue === "fr" ? "Lumière de l'entrée" : "Hallway light";
        r.actions = [action("light", "allumer")];
        break;
      case "intrusion":
        r.nom = this._langue === "fr" ? "Intrusion par une fenêtre" : "Window intrusion";
        r.modes = ["armed_away", "armed_night"];
        r.surveiller = true; r.grace_s = 60; r.tolerer = true;
        r.conditions = [{ entity_id: "", etat: "on", _domaine: "binary_sensor" }];
        r.actions = [
          { type: "alarme", action: "declencher", params: {} },
          { type: "notification", services: [this._notifParDefaut()], action: "envoyer", params: { message: this.t("notif_intrusion"), titre: this.t("titre_intrusion"), critique: true } },
        ];
        break;
      case "notif":
        r.evenement = "desarmement";
        r.nom = nom;
        r.actions = [{ type: "notification", services: [this._notifParDefaut()], action: "envoyer", params: { message: this.t("notif_defaut"), titre: "" } }];
        break;
      default: break;
    }
    return r;
  }

  _ouvrirAssistant(regle) {
    if (!regle.verification) regle.verification = this._regleVide().verification;
    const v = regle.verification;
    if (!Array.isArray(v.actions)) v.actions = [];
    // Ancien format (avant 2026.11.8) : liste « Prévenir » → action de notification
    const anciens = [...(v.notifiers || []), ...(v.notifier ? [v.notifier] : [])];
    if (anciens.length && !v.actions.length) v.actions.push({ ...this._notifEchec(), services: anciens, params: { ...this._notifEchec().params, message: v.message || this._messageDefaut() } });
    delete v.notifier; delete v.notifiers; delete v.message;
    regle.tolerer_si = regle.tolerer_si || null;
    regle.restaurer = { active: !!regle.restaurer?.active, entites: [...(regle.restaurer?.entites || [])] };
    // Entités ajoutées à la main = celles qu'aucune action ne pilote
    const pilotees = new Set((regle.actions || []).filter((a) => a.type === "entite").map((a) => a.entity_id));
    regle.restaurer.manuelles = regle.restaurer.entites.filter((e) => !pilotees.has(e));
    for (const a of [...(regle.actions || []), ...v.actions]) {
      if (a.type === "notification" && !a.services) { a.services = a.service ? [a.service] : [this._notifParDefaut()]; delete a.service; }
    }
    this._brouillon = regle;
    this._siCond = (regle.conditions || []).length > 0;
    this._yaml = "";
    this._etape = 1;
    this._vue = "assistant";
    this._selecteur = null;
    this._dessiner();
    if (regle.avance) this._chargerYamlExistant();
  }

  async _chargerYamlExistant() {
    // Règle déjà avancée : le serveur renvoie son script en YAML
    try {
      const res = await this._ws("vers_yaml", { regle: this._brouillonNettoye() });
      this._yaml = res.yaml;
    } catch (err) {
      this._annoncer(this._texteErreur(err), true);
    }
    this._dessiner();
  }

  _brouillonNettoye() {
    const b = copie(this._brouillon);
    if (!this._siCond) b.conditions = [];
    b.conditions = b.conditions.map(({ entity_id, etat }) => ({ entity_id, etat }));
    const propre = (a) => { const { _domaine: _ignore, ...reste } = a; return reste; };
    b.actions = b.actions.map(propre);
    b.verification = { ...b.verification, active: !!b.verification?.active, actions: (b.verification?.actions || []).map(propre) };
    if (!b.surveiller || !b.tolerer) b.tolerer_si = null;
    const rs = b.restaurer || {};
    b.restaurer = b.evenement === "armement" && rs.active ? { active: true, entites: [...new Set(rs.entites || [])] } : { active: false, entites: [] };
    return b;
  }

  async _brouillonPret() {
    const b = this._brouillonNettoye();
    if (b.avance) {
      const res = await this._ws("depuis_yaml", { yaml: this._yaml });
      b.sequence = res.sequence;
      this._brouillon.sequence = res.sequence;
    }
    return b;
  }

  async _allerEtape(etape) {
    const b = this._brouillon;
    if (etape > this._etape) {
      if (this._etape === 1 && !b.nom.trim()) { this._annoncer(this.t("err.texte_requis"), true); return; }
      if (this._etape === 2 && this._siCond && b.conditions.some((c) => !c.entity_id || !c.etat)) { this._annoncer(this.t("err.entite_invalide"), true); return; }
      if (this._etape === 2 && b.surveiller && (!this._siCond || !b.conditions.length)) { this._annoncer(this.t("err.surveiller_condition"), true); return; }
      if (this._etape === 3 && b.evenement === "armement" && b.restaurer?.active && !b.restaurer.entites.length) { this._annoncer(this.t("err.restaurer_vide"), true); return; }
      if (this._etape === 3) {
        try {
          await this._brouillonPret();
        } catch (err) { this._annoncer(this._texteErreur(err), true); return; }
        if (!b.avance && !b.actions.length) { this._annoncer(this.t("err.action_requise"), true); return; }
        if (!b.avance && [...b.actions, ...(b.verification.active ? b.verification.actions : [])].some((a) => a.type === "entite" && !a.entity_id)) { this._annoncer(this.t("err.entite_invalide"), true); return; }
        if (b.verification.active && (!b.verification.entity_id || !b.verification.etat)) { this._annoncer(this.t("err.verification_incomplete"), true); return; }
      }
    }
    this._etape = etape;
    this._dessiner();
  }

  async _enregistrer() {
    try {
      const regle = await this._brouillonPret();
      await this._ws("enregistrer", { regle });
      this._vue = "liste";
      this._evenement = regle.evenement;
      this._brouillon = null;
      this._annoncer(this.t("enregistre"));
      await this._attendreRechargement();
    } catch (err) {
      this._annoncer(this._texteErreur(err), true);
    }
  }

  async _passerAvance() {
    const b = this._brouillonNettoye();
    const res = await this._ws("vers_yaml", { regle: { ...b, avance: false } });
    this._brouillon.avance = true;
    this._yaml = res.yaml;
    this._etape = 3;
    this._dessiner();
  }

  _paramsParDefaut(action) {
    const s = this._hass.states[action.entity_id];
    const p = {};
    if (action.action === "impulsion") p.duree = action.params?.duree ?? 1;
    if (action.action === "position") p.position = 0;
    if (action.action === "preset") p.preset = s?.attributes?.preset_modes?.[0] || "";
    if (action.action === "temperature") p.temperature = 17;
    if (action.action === "choisir") p.option = s?.attributes?.options?.[0] || "";
    action.params = p;
  }

  _completerVerif() {
    const v = this._brouillon.verification;
    if (v.active && !v.entity_id && this._brouillon.conditions[0]?.entity_id) {
      v.entity_id = this._brouillon.conditions[0].entity_id;
      v.etat = v.etat || this._etatsPossibles(v.entity_id).find((e) => e !== this._brouillon.conditions[0].etat) || null;
    }
  }

  _etatsPossibles(entityId) {
    const s = this._hass?.states?.[entityId];
    const d = domaineDe(entityId);
    const parDomaine = {
      binary_sensor: ["on", "off"], switch: ["on", "off"], light: ["on", "off"], input_boolean: ["on", "off"],
      fan: ["on", "off"], siren: ["on", "off"], automation: ["on", "off"],
      cover: ["open", "closed"], valve: ["open", "closed"], lock: ["locked", "unlocked"],
      person: ["home", "not_home"], device_tracker: ["home", "not_home"],
      media_player: ["playing", "paused", "idle", "off"],
    };
    if (parDomaine[d]) return parDomaine[d];
    if (d === "climate") return s?.attributes?.hvac_modes || [];
    if (["select", "input_select"].includes(d)) return s?.attributes?.options || [];
    return s ? [s.state] : [];
  }

  // ------------------------------------------------------------------ sélecteur d'entité

  _ouvrirSelecteur(cible, index, liste = null) {
    let domaine = null;
    const b = this._brouillon;
    if (cible === "condition" && index !== null) domaine = b.conditions[index]?._domaine || null;
    if (cible === "action" && index !== null) domaine = this._liste({ l: liste })[index]?._domaine || null;
    if (cible === "tolerer") domaine = "cover";
    const tri = (s) => (s.attributes.friendly_name || s.entity_id).toLowerCase();
    const base = Object.values(this._hass.states)
      .map((s) => ({ s, cle: `${tri(s)} ${s.entity_id}`, nom: tri(s) }))
      .sort((x, y) => x.nom.localeCompare(y.nom));
    this._selecteur = { cible, index, liste, recherche: "", domaine, base };
    this._dessiner();
    setTimeout(() => this.shadowRoot.getElementById("recherche")?.focus(), 50);
  }

  _entitesFiltrees() {
    const sel = this._selecteur;
    const catalogue = this._d?.catalogue || {};
    const terme = (sel.recherche || "").toLowerCase().trim();
    const exclues = new Set([this._d?.simulateur?.entite].filter(Boolean));
    const resultat = [];
    for (const { s, cle } of sel.base) {
      const d = domaineDe(s.entity_id);
      if (sel.cible === "action" && (!catalogue[d] || exclues.has(s.entity_id))) continue;
      if (sel.cible === "restaurer" && (!RESTAURABLES.has(d) || exclues.has(s.entity_id) || this._brouillon.restaurer.entites.includes(s.entity_id))) continue;
      if (s.entity_id.startsWith(`switch.${DOMAINE}`) || s.entity_id.startsWith(`button.${DOMAINE}`)) continue;
      if (sel.domaine && d !== sel.domaine) continue;
      if (terme && !cle.includes(terme)) continue;
      resultat.push(this._hass.states[s.entity_id] || s);
      if (resultat.length >= 150) break;
    }
    return resultat;
  }

  _choisir(valeur) {
    const sel = this._selecteur;
    const b = this._brouillon;
    if (sel.cible === "condition") {
      const etats = this._etatsPossibles(valeur);
      const ancienne = sel.index !== null ? b.conditions[sel.index] : null;
      const etat = ancienne && etats.includes(ancienne.etat) ? ancienne.etat : etats[0] || "";
      const cond = { entity_id: valeur, etat };
      const v = b.verification;
      if (ancienne?.entity_id && v.entity_id === ancienne.entity_id) {
        v.entity_id = valeur;
        if (!etats.includes(v.etat)) v.etat = etats.find((e) => e !== etat) || null;
      }
      if (sel.index === null) b.conditions.push(cond); else b.conditions[sel.index] = cond;
      this._siCond = true;
    } else if (sel.cible === "tolerer") {
      const etats = this._etatsPossibles(valeur);
      b.tolerer_si = { entity_id: valeur, etat: etats.includes("closed") ? "closed" : etats[0] || "" };
    } else if (sel.cible === "restaurer") {
      if (!b.restaurer.entites.includes(valeur)) b.restaurer.entites.push(valeur);
      b.restaurer.manuelles = [...new Set([...(b.restaurer.manuelles || []), valeur])];
    } else if (sel.cible === "verif") {
      b.verification.entity_id = valeur;
      const etats = this._etatsPossibles(valeur);
      if (!etats.includes(b.verification.etat)) b.verification.etat = etats[0] || null;
    } else {
      const liste = this._liste({ l: sel.liste });
      let action;
      if (valeur === "@simulateur") action = { type: "simulateur", action: "demarrer", params: {} };
      else if (valeur === "@alarme") action = { type: "alarme", action: "declencher", params: {} };
      else if (valeur === "@notification") action = sel.liste === "v" ? this._notifEchec() : { type: "notification", services: [this._notifParDefaut()], action: "envoyer", params: { message: this.t("notif_defaut"), titre: "" } };
      else {
        const actions = Object.keys(this._d.catalogue[domaineDe(valeur)] || {});
        const ancienne = sel.index !== null ? liste[sel.index] : null;
        const voulue = ancienne && actions.includes(ancienne.action) ? ancienne.action : actions[0];
        action = { type: "entite", entity_id: valeur, action: voulue, params: { ...(ancienne?.params || {}) } };
        this._paramsParDefaut(action);
        if (ancienne?.params?.duree && action.action === "impulsion") action.params.duree = ancienne.params.duree;
      }
      const remplacee = sel.index !== null ? liste[sel.index] : null;
      if (sel.index === null) liste.push(action); else liste[sel.index] = action;
      if (sel.liste !== "v" && remplacee) this._oublierRestaurer(remplacee);
      // Nouvelle entité pilotée : elle rejoint la liste à remettre en état
      const r = b.restaurer;
      if (sel.liste !== "v" && r?.active && action.type === "entite" && RESTAURABLES.has(domaineDe(action.entity_id)) && !r.entites.includes(action.entity_id)) r.entites.push(action.entity_id);
    }
    this._selecteur = null;
    this._completerVerif();
    this._dessiner();
  }

  // ------------------------------------------------------------------ dessin

  _dessiner() {
    try {
      this._dessinerPage();
    } catch (err) {
      console.error("Protocole Alarme :", err);
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><main><div class="carte"><h2>Protocole Alarme</h2>
        <p class="sous">${esc(this.t("erreur_affichage"))}</p><pre class="code">${esc(err && (err.stack || err.message) || err)}</pre>
        <button type="button" class="btn" data-a="onglet" data-v="regles">${esc(this.t("retour"))}</button></div></main>`;
    }
  }

  _dessinerPage() {
    if (!this.shadowRoot) return;
    this._dernierDessin = Date.now();
    const d = this._d;
    let contenu;
    if (this._erreur && !d) contenu = `<div class="carte"><p>${esc(this._erreur)}</p></div>`;
    else if (!d) contenu = `<div class="carte"><p class="sous">${this._hass ? this.t("chargement") : "…"}</p></div>`;
    else if (this._vue === "assistant") contenu = this._assistant();
    else if (this._vue === "modeles") contenu = this._modeles();
    else contenu = { regles: () => this._regles(), entites: () => this._entites(), journal: () => this._journal(), reglages: () => this._reglages() }[this._onglet]();

    const inst = d?.instantane;
    const etatAlarme = inst?.etat_alarme;
    const pastille = d
      ? `<span class="pastille ${etatAlarme && etatAlarme.startsWith("armed") ? "armee" : etatAlarme === "triggered" ? "alerte" : ""}">
           <span class="point"></span>${esc(etatAlarme ? this._etatLisible(inst.alarme, etatAlarme) : this.t("alarme_absente"))}</span>`
      : "";
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <header>
        <div class="ligne-titre">
          ${this._narrow ? `<button type="button" class="icone-btn" data-a="menu" aria-label="Menu"><ha-icon icon="mdi:menu"></ha-icon></button>` : ""}
          <ha-icon icon="mdi:shield-home" class="logo"></ha-icon>
          <h1>${this.t("titre")}</h1>
          ${pastille}
        </div>
        ${this._vue === "assistant" ? "" : `<nav aria-label="${this.t("titre")}">${ONGLETS.map((o) => `<button type="button" class="onglet ${o === this._onglet ? "on" : ""}" aria-current="${o === this._onglet ? "page" : "false"}" data-a="onglet" data-v="${o}">${this.t(`onglet_${o}`)}</button>`).join("")}</nav>`}
      </header>
      ${this._message ? `<div class="message ${this._message.erreur ? "erreur" : ""}" role="status">${esc(this._message.texte)}</div>` : ""}
      <main>${contenu}</main>
      ${this._selecteur ? this._selecteurHtml() : ""}`;
  }

  _dessinerListe() {
    const liste = this.shadowRoot.getElementById("liste-entites");
    if (liste) liste.innerHTML = this._lignesEntites();
  }

  _interrupteur(on, attrs, label) {
    return `<button type="button" class="sw ${on ? "on" : ""}" role="switch" aria-checked="${on}" aria-label="${esc(label)}" ${attrs} ${this._editeur ? "" : "disabled"}><span></span></button>`;
  }
  _pastilleIcone(domaine, entityId) {
    const s = entityId ? this._hass?.states?.[entityId] : null;
    const classe = s?.attributes?.device_class;
    const icone = s?.attributes?.icon || ICONES_CLASSE[classe] || ICONES[domaine] || "mdi:shape";
    return `<span class="ic ${COULEURS[domaine] || "gris"}"><ha-icon icon="${icone}"></ha-icon></span>`;
  }
  _type(entityId) {
    const s = this._hass?.states?.[entityId];
    const d = domaineDe(entityId);
    const classe = s?.attributes?.device_class;
    return TYPES[this._langue].classe[classe] || TYPES[this._langue].domaine[d] || d;
  }

  // ---- onglet Règles

  _regles() {
    const d = this._d;
    const toutes = d.regles || [];
    const liste = toutes.filter((r) => r.evenement === this._evenement);
    const nb = (ev) => toutes.filter((r) => r.evenement === ev).length;
    const ls = d.simulateur;
    const utiliseLs = toutes.some((r) => r.actif && (r.actions || []).some((a) => a.type === "simulateur"));
    const avert = [];
    if (!this._editeur) avert.push(`<div class="bandeau">${this.t("lecture_seule")}</div>`);
    if (!d.instantane.actif) avert.push(`<div class="bandeau orange">${this.t("protocole_pause")}</div>`);
    if (utiliseLs && ls.double_pilotage) avert.push(`<div class="bandeau orange">${this.t("ls_double")}</div>`);
    if (utiliseLs && ls.statut !== "pret") avert.push(`<div class="bandeau orange">${this.t("err.simulateur_absent")}</div>`);
    const replies = this._replies();
    const groupes = this._types().map((t) => [t, liste.filter((r) => this._categorieDe(r) === t.id)]).filter(([, rs]) => rs.length);
    const cartes = groupes.map(([t, rs]) => {
      const ouvert = !replies.has(t.id);
      const actives = rs.filter((r) => r.actif).length;
      return `
      <section class="groupe">
        <button type="button" class="titre-groupe" aria-expanded="${ouvert}" data-a="groupe" data-v="${esc(t.id)}">
          <ha-icon icon="${esc(t.icone)}"></ha-icon><span class="nom-groupe">${esc(this._nomType(t))}</span>
          <span class="nb" title="${esc(this.t("n_actives", { a: actives, n: rs.length }))}">${actives === rs.length ? rs.length : `${actives}/${rs.length}`}</span>
          <ha-icon class="chevron" icon="${ouvert ? "mdi:chevron-up" : "mdi:chevron-down"}"></ha-icon>
        </button>
        ${ouvert ? `<div class="pile">${rs.map((r) => this._carteRegle(r)).join("")}</div>` : ""}
      </section>`;
    }).join("") || `<div class="carte vide">${this.t("aucune_regle")}</div>`;
    const tousReplies = groupes.length > 1 && groupes.every(([t]) => replies.has(t.id));
    const outils = groupes.length > 1 ? `<div class="outils-groupes"><button type="button" class="lien" data-a="groupes-tous" data-v="${tousReplies ? "1" : "0"}">
      <ha-icon icon="${tousReplies ? "mdi:unfold-more-horizontal" : "mdi:unfold-less-horizontal"}"></ha-icon>${this.t(tousReplies ? "tout_deplier" : "tout_replier")}</button></div>` : "";
    return `
      ${avert.join("")}
      <div class="seg" role="tablist">
        ${["armement", "desarmement"].map((ev) => `<button type="button" role="tab" aria-selected="${ev === this._evenement}" class="${ev === this._evenement ? "on" : ""}" data-a="evenement" data-v="${ev}">
          <ha-icon icon="${ICONE_EVENEMENT[ev]}"></ha-icon>${this.t(ev)} (${nb(ev)})</button>`).join("")}
      </div>
      ${outils}
      ${cartes}
      ${this._editeur ? `<div class="boutons-bas">
        <button type="button" class="btn primaire grand" data-a="nouvelle"><ha-icon icon="mdi:plus"></ha-icon>${this.t("ajouter_regle")}</button>
        <button type="button" class="btn grand" data-a="modeles"><ha-icon icon="mdi:view-grid-outline"></ha-icon>${this.t("partir_modele")}</button>
      </div>` : ""}`;
  }

  _carteRegle(r) {
    const premiere = (r.actions || [])[0];
    const dom = r.avance ? "script" : premiere?.type === "entite" ? domaineDe(premiere.entity_id) : premiere?.type || "script";
    const nEchec = (r.verification?.actions || []).length;
    const verif = r.verification?.active ? `<div class="meta"><ha-icon icon="mdi:check-decagram-outline"></ha-icon>${this.t("verif_apres", { s: r.verification.delai_s })}${nEchec ? ` · ${this.t("sinon_n", { n: nEchec })}` : ""}</div>` : "";
    const options = [r.grace_s ? this.t("grace_court", { s: r.grace_s }) : "", r.tolerer ? `${this.t("tolerer_court")}${r.tolerer_si ? ` ${this._tolererSiTexte(r)}` : ""}` : ""].filter(Boolean).join(" · ");
    const surveille = r.surveiller ? `<div class="meta"><ha-icon icon="mdi:eye-outline"></ha-icon>${this.t("surveiller_court")}${options ? ` (${esc(options)})` : ""}</div>` : "";
    const rs = r.evenement === "armement" && r.restaurer?.active ? r.restaurer : null;
    const memo = rs ? (this._d.memoires || {})[r.id] : null;
    const restaurer = rs ? `<div class="meta restaurer"><ha-icon icon="mdi:backup-restore"></ha-icon><span>${this.t(rs.entites.length === 1 ? "restaurer_court_1" : "restaurer_court", { n: rs.entites.length })}</span></div>${memo ? `<div class="meta memo"><ha-icon icon="mdi:content-save-check-outline"></ha-icon><span>${this.t(memo.n === 1 ? "memorise_a_1" : "memorise_a", { h: this._heure(memo.date), n: memo.n })}</span></div>` : ""}` : "";
    const delai = r.delai_s ? `<div class="meta"><ha-icon icon="mdi:timer-outline"></ha-icon>${this.t("delai_avant")} : ${r.delai_s} s</div>` : "";
    const confirmer = this._confirmer === r.id;
    return `
      <article class="carte regle ${r.actif ? "" : "eteinte"}">
        <div class="tete">
          ${this._pastilleIcone(dom)}
          <div class="noms"><div class="nom">${esc(r.nom)}</div><div class="sous">${esc(this._modesTexte(r))}</div></div>
          ${this._interrupteur(r.actif, `data-a="activer" data-id="${esc(r.id)}" data-v="${r.actif ? 1 : 0}"`, r.nom)}
        </div>
        <div class="phrase">${this._phrase(r)}</div>
        ${surveille}${verif}${restaurer}${delai}
        ${this._editeur ? `<div class="actions-carte">
          <button type="button" class="lien" data-a="tester" data-id="${esc(r.id)}"><ha-icon icon="mdi:play"></ha-icon>${this.t("tester")}</button>
          <button type="button" class="lien" data-a="modifier" data-id="${esc(r.id)}"><ha-icon icon="mdi:pencil"></ha-icon>${this.t("modifier")}</button>
          <span class="espace"></span>
          <button type="button" class="icone-btn bleu" data-a="dupliquer" data-id="${esc(r.id)}" aria-label="${this.t("dupliquer")}" title="${this.t("dupliquer")}"><ha-icon icon="mdi:content-copy"></ha-icon></button>
          ${confirmer
            ? `<button type="button" class="lien danger" data-a="supprimer" data-id="${esc(r.id)}"><ha-icon icon="mdi:delete-outline"></ha-icon>${this.t("confirmer")}</button>`
            : `<button type="button" class="icone-btn danger" data-a="supprimer" data-id="${esc(r.id)}" aria-label="${this.t("supprimer")}" title="${this.t("supprimer")}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>`}
        </div>` : ""}
      </article>`;
  }

  _modeles() {
    const liste = [["garage", "garage-variant"], ["volet", "window-shutter"], ["simu", "home-lightbulb"], ["simu_stop", "home-lightbulb-outline"], ["lumiere", "lightbulb-on"], ["notif", "bell-ring"], ["intrusion", "alarm-light"]];
    return `
      <div class="entete-vue"><button type="button" class="icone-btn" data-a="onglet" data-v="regles" aria-label="${this.t("retour")}"><ha-icon icon="mdi:arrow-left"></ha-icon></button><h2>${this.t("modeles")}</h2></div>
      <p class="sous">${this.t("modeles_desc")}</p>
      <div class="grille-modeles">
        ${liste.map(([cle, icone]) => `<button type="button" class="carte modele" data-a="modele" data-v="${cle}">
          <span class="ic bleu"><ha-icon icon="mdi:${icone}"></ha-icon></span>
          <span><span class="nom">${this.t(`m_${cle}`)}</span><span class="sous">${this.t(`m_${cle}_d`)}</span></span></button>`).join("")}
      </div>`;
  }

  // ---- assistant

  _assistant() {
    const b = this._brouillon;
    const etapes = [["etape_quand", 1], ["etape_si", 2], ["etape_alors", 3]];
    const corps = { 1: () => this._etape1(), 2: () => this._etape2(), 3: () => this._etape3(), 4: () => this._etape4() }[this._etape]();
    return `
      <div class="assistant">
        <div class="entete-vue">
          <button type="button" class="icone-btn" data-a="fermer-assistant" aria-label="${this.t("annuler")}"><ha-icon icon="mdi:close"></ha-icon></button>
          <h2>${esc(b.nom || this.t("nouvelle_regle"))}</h2>
        </div>
        <ol class="progression">
          ${etapes.map(([cle, n]) => `<li class="${n < this._etape ? "fait" : n === this._etape ? "en-cours" : ""}"><span class="barre"></span>${n} · ${this.t(cle)}</li>`).join("")}
        </ol>
        <div class="corps">${corps}</div>
        <div class="pied">
          ${this._etape === 1
            ? `<button type="button" class="btn grand" data-a="fermer-assistant">${this.t("annuler")}</button>`
            : `<button type="button" class="btn grand" data-a="etape" data-v="${this._etape - 1}">${this.t("precedent")}</button>`}
          ${this._etape < 4
            ? `<button type="button" class="btn primaire grand" data-a="etape" data-v="${this._etape + 1}">${this.t("suivant")}</button>`
            : `<button type="button" class="btn primaire grand" data-a="enregistrer"><ha-icon icon="mdi:check"></ha-icon>${this.t("enregistrer")}</button>`}
        </div>
      </div>`;
  }

  _etape1() {
    const b = this._brouillon;
    const option = (ev, icone, couleur, titre, desc) => `
      <button type="button" class="option grande ${b.evenement === ev ? "on" : ""}" aria-pressed="${b.evenement === ev}" data-a="moment" data-v="${ev}">
        <span class="ic ${couleur}"><ha-icon icon="${icone}"></ha-icon></span>
        <span class="nom">${this.t(titre)}</span><span class="sous">${this.t(desc)}</span>
        <span class="coche"></span>
      </button>`;
    return `
      <label class="champ"><span>${this.t("nom_regle")}</span>
        <input type="text" data-f="nom" value="${esc(b.nom)}" maxlength="80"></label>
      <h3 class="titre-etape">${this.t("quand_titre")}</h3>
      <div class="deux">
        ${option("armement", "mdi:lock", "orange", "a_larmement", "quand_active")}
        ${option("desarmement", "mdi:lock-open-variant", "vert", "au_desarmement", "quand_coupe")}
      </div>
      ${b.evenement === "armement" ? `
      <button type="button" class="option ${b.surveiller ? "on" : ""}" aria-pressed="${!!b.surveiller}" data-a="surveiller">
        <span class="ic bleu"><ha-icon icon="mdi:eye-outline"></ha-icon></span>
        <span class="noms"><span class="nom">${this.t("surveiller")}</span><span class="sous">${this.t("surveiller_desc")}</span></span>
        <span class="case ${b.surveiller ? "on" : ""}">${b.surveiller ? '<ha-icon icon="mdi:check"></ha-icon>' : ""}</span>
      </button>` : ""}
      ${b.evenement === "armement" && b.surveiller ? `
      <div class="carte bloc sous-options">
        <label class="champ court"><span>${this.t("grace")}</span>
          <input type="number" min="0" max="600" step="5" value="${b.grace_s || 0}" data-f="grace"></label>
        <p class="sous">${this.t("grace_desc")}</p>
        <button type="button" class="option ${b.tolerer ? "on" : ""}" aria-pressed="${!!b.tolerer}" data-a="tolerer">
          <span class="noms"><span class="nom">${this.t("tolerer")}</span><span class="sous">${this.t("tolerer_desc")}</span></span>
          <span class="case ${b.tolerer ? "on" : ""}">${b.tolerer ? '<ha-icon icon="mdi:check"></ha-icon>' : ""}</span>
        </button>
        ${b.tolerer ? `
        <div class="retrait">
          <button type="button" class="option ${b.tolerer_si ? "on" : ""}" aria-pressed="${!!b.tolerer_si}" data-a="tolerer-si">
            <span class="noms"><span class="nom">${this.t("tolerer_si")}</span><span class="sous">${this.t("tolerer_si_desc")}</span></span>
            <span class="case ${b.tolerer_si ? "on" : ""}">${b.tolerer_si ? '<ha-icon icon="mdi:check"></ha-icon>' : ""}</span>
          </button>
          ${b.tolerer_si ? `${this._boutonEntite(b.tolerer_si.entity_id, `data-a="tolerer-si-entite"`, "cover")}
            <span class="etiquette">${this.t("etat_attendu")}</span>${this._choixEtats(b.tolerer_si.entity_id, b.tolerer_si.etat, "tolerer-si-etat", 0, "tolerer-si-libre")}` : ""}
        </div>` : ""}
      </div>` : ""}
      <h4>${this.t("pour_modes")}</h4>
      <p class="sous">${this.t("aucun_coche")}</p>
      <div class="chips">
        ${ORDRE_MODES.filter((m) => (this._d.modes || ORDRE_MODES).includes(m)).map((m) => `<button type="button" class="chip ${b.modes.includes(m) ? "on" : ""}" aria-pressed="${b.modes.includes(m)}" data-a="mode" data-v="${m}">${b.modes.includes(m) ? '<ha-icon icon="mdi:check"></ha-icon>' : ""}${this._libelleMode(m)}</button>`).join("")}
      </div>`;
  }

  _boutonEntite(entityId, attrs, domaineIndice) {
    if (!entityId) {
      return `<button type="button" class="entite-btn vide" ${attrs}>${this._pastilleIcone(domaineIndice || "sensor")}
        <span class="noms"><span class="nom">${this.t("choisir_entite")}</span>${domaineIndice ? `<span class="sous">${esc(DOMAINES[this._langue][domaineIndice] || domaineIndice)}</span>` : ""}</span>
        <ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
    }
    const s = this._hass.states[entityId];
    return `<button type="button" class="entite-btn" ${attrs}>${this._pastilleIcone(domaineDe(entityId), entityId)}
      <span class="noms"><span class="nom">${esc(this._nomEntite(entityId))}</span>
      <span class="type"><span class="tag-type">${esc(this._type(entityId))}</span>${s ? `<span>${esc(this._etatLisible(entityId, s.state))}</span>` : ""}</span>
      <span class="id">${esc(entityId)}</span></span>
      <ha-icon icon="mdi:chevron-right"></ha-icon></button>`;
  }

  _choixEtats(entityId, valeur, action, i, champLibre) {
    if (!entityId) return "";
    const etats = this._etatsPossibles(entityId);
    const chips = etats.map((e) => `<button type="button" class="chip ${e === valeur ? "on" : ""}" aria-pressed="${e === valeur}" data-a="${action}" data-i="${i}" data-v="${esc(e)}">${esc(this._etatLisible(entityId, e))}</button>`).join("");
    const libre = !etats.length || (valeur && !etats.includes(valeur))
      ? `<label class="champ court"><span>${this.t("autre_etat")}</span><input type="text" data-f="${champLibre}" data-i="${i}" value="${esc(valeur || "")}"></label>` : "";
    return `<div class="chips">${chips}</div>${libre}`;
  }

  _etape2() {
    const b = this._brouillon;
    const conds = b.conditions.map((c, i) => `
      <div class="carte bloc">
        <div class="tete-bloc"><span class="etiquette">${this.t("entite")}</span>
          ${b.conditions.length > 1 || true ? `<button type="button" class="icone-btn" data-a="retirer-condition" data-i="${i}" aria-label="${this.t("retirer")}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>` : ""}</div>
        ${this._boutonEntite(c.entity_id, `data-a="changer-condition" data-i="${i}"`, c._domaine)}
        ${c.entity_id ? `<span class="etiquette">${this.t("etat_attendu")}</span>${this._choixEtats(c.entity_id, c.etat, "etat-condition", i, "etat-libre")}<p class="sous">${this.t("etats_entite")}</p>` : ""}
      </div>`).join("");
    return `
      <h3 class="titre-etape">${this.t("si_titre")} <span class="sous">${this.t("facultatif")}</span></h3>
      <button type="button" class="option ${!this._siCond ? "on" : ""}" aria-pressed="${!this._siCond}" data-a="si" data-v="0"><span class="rond"></span>
        <span class="noms"><span class="nom">${this.t("toujours")}</span><span class="sous">${this.t("toujours_desc")}</span></span></button>
      <button type="button" class="option ${this._siCond ? "on" : ""}" aria-pressed="${this._siCond}" data-a="si" data-v="1"><span class="rond"></span>
        <span class="noms"><span class="nom">${this.t("seulement_si")}</span><span class="sous">${this.t("seulement_si_desc")}</span></span></button>
      ${this._siCond ? `${conds}<button type="button" class="btn pointille" data-a="ajouter-condition"><ha-icon icon="mdi:plus"></ha-icon>${this.t("ajouter_condition")}</button>` : ""}`;
  }

  _valeurParam(p, v) {
    if (p === "duree") return `${this._nombre(v ?? 1)} s`;
    if (p === "position" || p === "luminosite") return v ? `${v} %` : this.t("luminosite_inchangee");
    return String(v ?? "");
  }

  _params(action, i, l = "") {
    const L = l ? ` data-l="${l}"` : "";
    const s = this._hass.states[action.entity_id];
    const p = action.params || {};
    const curseur = (nom, min, max, pas, valeur, libelle) => `
      <div class="reglage">
        <div class="ligne"><label for="p-${l}${i}-${nom}">${this.t(libelle)}</label><output id="val-${l}${i}-${nom}">${esc(this._valeurParam(nom, valeur))}</output></div>
        <input id="p-${l}${i}-${nom}" type="range" min="${min}" max="${max}" step="${pas}" value="${valeur ?? min}" data-f="param" data-p="${nom}" data-i="${i}"${L}>
      </div>`;
    const liste = (nom, options, libelle, vide) => `
      <label class="champ"><span>${this.t(libelle)}</span><select data-f="param-select" data-p="${nom}" data-i="${i}"${L}>
        ${vide ? `<option value="">${this.t("luminosite_inchangee")}</option>` : ""}
        ${options.map((o) => `<option value="${esc(o)}" ${String(p[nom]) === String(o) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    switch (action.action) {
      case "impulsion": return curseur("duree", 0.5, 10, 0.5, p.duree ?? 1, "duree_impulsion");
      case "position": return curseur("position", 0, 100, 5, p.position ?? 0, "position");
      case "allumer": return action.entity_id.startsWith("light.") ? curseur("luminosite", 0, 100, 5, p.luminosite ?? 0, "luminosite") : "";
      case "preset": return liste("preset", s?.attributes?.preset_modes || [], "preset");
      case "temperature": return `<label class="champ court"><span>${this.t("temperature")}</span><input type="number" min="5" max="35" step="0.5" value="${p.temperature ?? 17}" data-f="param" data-p="temperature" data-i="${i}"${L}></label>`;
      case "choisir": return liste("option", s?.attributes?.options || [], "option");
      default: return "";
    }
  }

  _carteAction(a, i, l = "") {
    const L = l ? ` data-l="${l}"` : "";
    const tete = `<div class="tete-bloc"><span class="etiquette">${this.t("action_n", { n: i + 1 })}</span>
      <button type="button" class="icone-btn" data-a="retirer-action" data-i="${i}"${L} aria-label="${this.t("retirer")}"><ha-icon icon="mdi:delete-outline"></ha-icon></button></div>`;
    if (a.type === "simulateur") {
      const ls = this._d.simulateur;
      return `<div class="carte bloc">${tete}
        <button type="button" class="entite-btn" data-a="changer-action" data-i="${i}"${L}>${this._pastilleIcone("simulateur")}
          <span class="noms"><span class="nom">${this.t("simulateur")}</span><span class="sous">Lights Simulator · ${this.t(CLE_STATUT[ls.statut])}</span></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>
        ${ls.statut !== "pret" ? this._carteLs(true) : ""}
        <div class="chips">${["demarrer", "auto", "arreter"].map((x) => `<button type="button" class="chip ${a.action === x ? "on" : ""}" aria-pressed="${a.action === x}" data-a="choix-action" data-i="${i}"${L} data-v="${x}">${ACTIONS[this._langue][x]}</button>`).join("")}</div>
        ${ls.double_pilotage ? `<p class="avert">${this.t("ls_double")}</p>` : ""}
      </div>`;
    }
    if (a.type === "alarme") {
      return `<div class="carte bloc">${tete}
        <button type="button" class="entite-btn" data-a="changer-action" data-i="${i}"${L}>${this._pastilleIcone("alarm_control_panel")}
          <span class="noms"><span class="nom">${esc(this._nomEntite(this._d.instantane.alarme))}</span><span class="id">${esc(this._d.instantane.alarme || "")}</span></span><ha-icon icon="mdi:chevron-right"></ha-icon></button>
        <div class="chips"><button type="button" class="chip on" aria-pressed="true" data-a="choix-action" data-i="${i}"${L} data-v="declencher">${this.t("declencher_alarme")}</button></div>
        <p class="sous">${this.t("declencher_alarme_desc")}</p>
      </div>`;
    }
    if (a.type === "notification") {
      return `<div class="carte bloc">${tete}
        <span class="etiquette">${this.t("service_notif")}</span>${this._choixServices(a.services || [], "notif-service", i, L)}
        <label class="champ"><span>${this.t("titre_notif")}</span><input type="text" data-f="titre" data-i="${i}"${L} value="${esc(a.params.titre || "")}"></label>
        <label class="champ"><span>${this.t("message")}</span><textarea rows="3" data-f="message" data-i="${i}"${L}>${esc(a.params.message || "")}</textarea></label>
        <p class="sous">${esc(this.t(l ? "variables_echec" : "variables_action"))}</p>
        ${String(a.params.message || "").includes("{{") ? `<div class="apercu"><span class="etiquette">${this.t("apercu")}</span><span id="apercu-${l}${i}">${esc(this._apercu(a.params.message, l))}</span></div>` : ""}
        <button type="button" class="option ${a.params.critique ? "on" : ""}" aria-pressed="${!!a.params.critique}" data-a="critique" data-i="${i}"${L}>
          <span class="ic orange"><ha-icon icon="mdi:bell-alert"></ha-icon></span>
          <span class="noms"><span class="nom">${this.t("critique")}</span><span class="sous">${this.t("critique_desc")}</span></span>
          <span class="case ${a.params.critique ? "on" : ""}">${a.params.critique ? '<ha-icon icon="mdi:check"></ha-icon>' : ""}</span>
        </button>
      </div>`;
    }
    const actions = Object.keys(this._d.catalogue[domaineDe(a.entity_id)] || {});
    const choix = a.entity_id
      ? `<div class="chips">${actions.map((x) => `<button type="button" class="chip ${a.action === x ? "on" : ""}" aria-pressed="${a.action === x}" data-a="choix-action" data-i="${i}"${L} data-v="${x}">${esc(this._libelleAction({ ...a, action: x }))}</button>`).join("")}</div>${this._params(a, i, l)}`
      : "";
    return `<div class="carte bloc">${tete}${this._boutonEntite(a.entity_id, `data-a="changer-action" data-i="${i}"${L}`, a._domaine)}${choix}</div>`;
  }

  _etape3() {
    const b = this._brouillon;
    const v = b.verification;
    if (b.avance) {
      return `
        <h3 class="titre-etape">${this.t("alors_titre")}</h3>
        <div class="carte bloc">
          <span class="etiquette">${this.t("avance_titre")}</span>
          <textarea class="code" rows="14" spellcheck="false" data-f="yaml" aria-label="${this.t("avance_titre")}" ${this._admin ? "" : "readonly"}>${esc(this._yaml)}</textarea>
          <p class="sous">${esc(this.t(this._admin ? "avance_note" : "avance_admin"))}</p>
          <button type="button" class="lien" data-a="simple"><ha-icon icon="mdi:undo"></ha-icon>${this.t("mode_simple")}</button>
          <p class="sous">${this.t("mode_simple_note")}</p>
        </div>
        ${this._carteRestaurer()}
        ${this._carteDelai()}`;
    }
    const verif = `
      <div class="carte bloc">
        <div class="tete"><span class="ic vert"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></span>
          <span class="noms"><span class="nom">${this.t("verifier_resultat")}</span></span>
          ${this._interrupteur(v.active, `data-a="verif"`, this.t("verifier_resultat"))}</div>
        ${v.active ? `
          <div class="phrase-verif">
            <label class="champ court"><span>${this.t("apres")} (s)</span><input type="number" min="0" max="3600" value="${v.delai_s}" data-f="verif-delai"></label>
            ${this._boutonEntite(v.entity_id, `data-a="verif-entite"`)}
            ${v.entity_id ? `<span class="etiquette">${this.t("doit_etre")}</span>${this._choixEtats(v.entity_id, v.etat, "verif-etat", 0, "verif-etat-libre")}` : ""}
          </div>
          <h4 class="sinon">${this.t("sinon_faire")}</h4>
          ${(v.actions || []).map((a, i) => this._carteAction(a, i, "v")).join("")}
          <button type="button" class="btn pointille" data-a="ajouter-action" data-l="v"><ha-icon icon="mdi:plus"></ha-icon>${this.t("ajouter_action_echec")}</button>
          ${(v.actions || []).length ? "" : `<p class="sous">${this.t("aucune_action_echec")}</p>`}
          <p class="sous">${this.t("verif_note")}</p>` : ""}
      </div>`;
    return `
      <h3 class="titre-etape">${this.t("alors_titre")}</h3>
      ${b.actions.map((a, i) => this._carteAction(a, i)).join("")}
      <button type="button" class="btn pointille" data-a="ajouter-action"><ha-icon icon="mdi:plus"></ha-icon>${this.t("ajouter_action")}</button>
      ${verif}
      ${this._carteRestaurer()}
      ${this._carteDelai()}`;
  }

  _messageDefaut() { return this._d?.message_defaut || ""; }

  _apercu(message, l) {
    // Aperçu avec des valeurs d'exemple tirées de la règle en cours
    const b = this._brouillon;
    const v = b.verification;
    const autre = this._etatsPossibles(v.entity_id).find((e) => e !== v.etat) || "unknown";
    const entite = l ? v.entity_id : b.conditions[0]?.entity_id;
    const valeurs = {
      regle: b.nom || this.t("nouvelle_regle"),
      entite: entite ? this._nomEntite(entite) : this.t("entite"),
      etat_actuel: l ? String(this._etatLisible(v.entity_id, autre)).toLowerCase() : "",
      etat_attendu: l ? String(this._etatLisible(v.entity_id, v.etat)).toLowerCase() : "",
      evenement: "",
    };
    return String(message || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (tout, nom) => (nom in valeurs && valeurs[nom] !== "" ? valeurs[nom] : tout));
  }

  _heure(iso) {
    try { return new Date(iso).toLocaleString(this._langue === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }

  // Entité retirée des actions : elle quitte la liste « à remettre », sauf si on l'avait ajoutée à la main
  // ou si une autre action la pilote encore
  _oublierRestaurer(action) {
    const r = this._brouillon.restaurer;
    if (!r?.active || action?.type !== "entite") return;
    const id = action.entity_id;
    if ((r.manuelles || []).includes(id) || this._brouillon.actions.some((a) => a.type === "entite" && a.entity_id === id)) return;
    r.entites = r.entites.filter((e) => e !== id);
  }

  _ciblesRestaurables(b) {
    const ids = (b.actions || []).filter((a) => a.type === "entite" && RESTAURABLES.has(domaineDe(a.entity_id))).map((a) => a.entity_id);
    return [...new Set(ids)];
  }

  _carteRestaurer() {
    const b = this._brouillon;
    if (b.evenement !== "armement") return "";
    const r = b.restaurer;
    return `
      <div class="carte bloc">
        <div class="tete"><span class="ic violet"><ha-icon icon="mdi:backup-restore"></ha-icon></span>
          <span class="noms"><span class="nom">${this.t("restaurer")}</span><span class="sous">${this.t("restaurer_desc")}</span></span>
          ${this._interrupteur(r.active, `data-a="restaurer"`, this.t("restaurer"))}</div>
        ${r.active ? `
          <span class="etiquette">${this.t("restaurer_entites")}</span>
          <div class="liste-restaurer">
            ${r.entites.map((id, i) => `<div class="ligne-restaurer">${this._pastilleIcone(domaineDe(id), id)}
              <span class="noms"><span class="nom">${esc(this._nomEntite(id))}</span><span class="id">${esc(id)}</span></span>
              <button type="button" class="icone-btn" data-a="restaurer-retirer" data-i="${i}" aria-label="${this.t("retirer")}" title="${this.t("retirer")}"><ha-icon icon="mdi:close"></ha-icon></button></div>`).join("")}
          </div>
          <button type="button" class="btn pointille" data-a="restaurer-ajouter"><ha-icon icon="mdi:plus"></ha-icon>${this.t("restaurer_ajouter")}</button>
          <p class="sous">${this.t("restaurer_note")}</p>` : ""}
      </div>`;
  }

  _carteDelai() {
    const b = this._brouillon;
    return `<div class="carte ligne-delai"><ha-icon icon="mdi:timer-outline"></ha-icon><span class="nom">${this.t("delai_avant")}</span>
      <button type="button" class="icone-btn" data-a="delai" data-v="-10" aria-label="-10 s">−</button>
      <span class="valeur">${b.delai_s || 0} s</span>
      <button type="button" class="icone-btn" data-a="delai" data-v="10" aria-label="+10 s">+</button></div>`;
  }

  _etape4() {
    const b = this._brouillon;
    const v = b.verification;
    const premiere = b.actions[0];
    const dom = b.avance ? "script" : premiere?.type === "entite" ? domaineDe(premiere.entity_id) : premiere?.type;
    const ligne = (cle, texte) => `<div class="recap-ligne"><span class="etiquette">${cle}</span><span>${texte}</span></div>`;
    const actions = b.avance
      ? this.t("script_avance", { n: (b.sequence || []).length })
      : b.actions.map((a) => `<b>${esc(this._libelleAction(a))}</b> ${a.type === "entite" ? esc(this._cible(a)) : this._cible(a)}${this._detailParams(a)}`).join("<br>");
    const conds = this._siCond && b.conditions.length
      ? b.conditions.map((c) => `<b>${esc(this._nomEntite(c.entity_id))}</b> ${this.t("est")} <i>${esc(this._etatLisible(c.entity_id, c.etat))}</i>`).join(`<br>${this.t("et")} `)
      : this.t("toujours");
    return `
      <div class="carte recap">
        <div class="tete">${this._pastilleIcone(dom || "script")}<span class="nom grand">${esc(b.nom)}</span></div>
        ${ligne(this.t("etape_quand").toUpperCase(), `${this.t(b.evenement === "armement" ? "a_larmement" : "au_desarmement")}${b.surveiller ? ` ${this.t("et_pendant")}` : ""}${b.surveiller && b.grace_s ? ` · ${esc(this.t("grace_court", { s: b.grace_s }))}` : ""}${b.surveiller && b.tolerer ? ` · ${esc(this.t("tolerer_court"))}` : ""}${b.surveiller && b.tolerer && b.tolerer_si?.entity_id ? ` ${esc(this._tolererSiTexte(b))}` : ""} · <b>${esc(this._modesTexte(b))}</b>`)}
        ${ligne(this.t("etape_si").toUpperCase(), conds)}
        ${ligne(this.t("etape_alors").toUpperCase(), actions + (b.delai_s ? `<br><span class="sous">${this.t("delai_avant")} : ${b.delai_s} s</span>` : ""))}
        ${b.evenement === "armement" && b.restaurer?.active ? ligne(this.t("recap_restaurer").toUpperCase(), `${this.t("restaurer_recap")} ${b.restaurer.entites.map((id) => `<b>${esc(this._nomEntite(id))}</b>`).join(", ")}`) : ""}
        ${v.active ? ligne(this.t("verifier_resultat").split(" ")[0].toUpperCase(), `${this.t("apres")} ${v.delai_s} s, <b>${esc(this._nomEntite(v.entity_id))}</b> ${this.t("doit_etre")} <i>${esc(this._etatLisible(v.entity_id, v.etat))}</i>${(v.actions || []).length ? `<br>${this.t("sinon_faire")} ${v.actions.map((a) => `<b>${esc(this._libelleAction(a))}</b> ${a.type === "entite" ? esc(this._cible(a)) : this._cible(a)}${this._detailParams(a)}`).join(", ")}` : ""}`) : ""}
      </div>
      <div class="carte bloc">
        <span class="etiquette">${this.t("type_regle")}</span>
        <div class="chips">${this._types().map((t) => {
          const on = this._categorieDe(b) === t.id;
          return `<button type="button" class="chip ${on ? "on" : ""}" aria-pressed="${on}" data-a="categorie" data-v="${esc(t.id)}"><ha-icon icon="${on ? "mdi:check" : esc(t.icone)}"></ha-icon>${esc(this._nomType(t))}</button>`;
        }).join("")}</div>
        <p class="sous">${this.t("type_regle_desc")}</p>
      </div>
      <button type="button" class="btn grand contour" data-a="tester-brouillon"><ha-icon icon="mdi:play"></ha-icon>${this.t("tester_maintenant")}</button>
      <p class="sous centre">${this.t("tester_note")}</p>
      ${b.avance || !this._admin ? "" : `<button type="button" class="lien centre" data-a="avance"><ha-icon icon="mdi:code-braces"></ha-icon>${this.t("mode_avance")}</button>`}`;
  }

  // ---- sélecteur d'entité (feuille)

  _carteLs(compacte = false) {
    const ls = this._d.simulateur;
    if (ls.statut === "pret") return "";
    const bouton = ls.statut === "absent"
      ? `<a class="btn primaire grand" href="${esc(ls.hacs ? ls.lien_hacs : ls.lien_depot)}" target="_blank" rel="noopener"><ha-icon icon="mdi:download"></ha-icon>${this.t(ls.hacs ? "ls_installer" : "ls_sans_hacs")}</a>`
      : `<a class="btn primaire grand" href="${esc(ls.lien_config)}" target="_blank" rel="noopener"><ha-icon icon="mdi:cog"></ha-icon>${this.t("ls_configurer")}</a>`;
    const note = ls.statut === "absent" ? this.t("ls_installer_note") : this.t("ls_configurer_note");
    return `<div class="carte ls ${compacte ? "compacte" : ""}">
      ${compacte ? "" : `<div class="tete">${this._pastilleIcone("simulateur")}<span class="noms"><span class="nom">${this.t("simulateur")}</span>
        <span class="badge">${this.t(CLE_STATUT[ls.statut])}</span></span></div><p>${this.t("ls_desc")}</p>`}
      ${bouton}
      <p class="sous"><ha-icon icon="mdi:information-outline"></ha-icon> ${note}</p></div>`;
  }

  _lignesEntites() {
    const entites = this._entitesFiltrees();
    if (!entites.length) return `<p class="sous centre">${this.t("aucune_entite")}</p>`;
    return entites.map((s) => `
      <button type="button" class="ligne-entite" data-a="choisir" data-v="${esc(s.entity_id)}">
        ${this._pastilleIcone(domaineDe(s.entity_id), s.entity_id)}
        <span class="noms"><span class="nom">${esc(s.attributes.friendly_name || s.entity_id)}</span>
        <span class="type"><span class="tag-type">${esc(this._type(s.entity_id))}</span><span>${esc(this._etatLisible(s.entity_id, s.state))}</span></span>
        <span class="id">${esc(s.entity_id)}</span></span></button>`).join("");
  }

  _selecteurHtml() {
    const sel = this._selecteur;
    const action = sel.cible === "action";
    const catalogue = this._d.catalogue || {};
    const presents = new Set(Object.keys(this._hass.states).map(domaineDe));
    const domaines = (action ? Object.keys(catalogue) : ["binary_sensor", "cover", "lock", "light", "switch", "person", "device_tracker", "climate", "sensor", "input_boolean", "media_player"]).filter((d) => presents.has(d));
    const ls = this._d.simulateur;
    const speciaux = action && sel.index === null || (action && ["simulateur", "notification", "alarme"].includes(this._brouillon.actions[sel.index]?.type))
      ? `
        ${ls.statut === "pret"
          ? `<button type="button" class="ligne-entite speciale" data-a="choisir" data-v="@simulateur">${this._pastilleIcone("simulateur")}<span class="noms"><span class="nom">${this.t("simulateur")}</span><span class="sous">Lights Simulator · ${esc(ls.entite)}</span></span></button>`
          : this._carteLs()}
        <button type="button" class="ligne-entite speciale" data-a="choisir" data-v="@alarme">${this._pastilleIcone("alarm_control_panel")}<span class="noms"><span class="nom">${this.t("declencher_alarme")}</span><span class="sous">${esc(this._nomEntite(this._d.instantane.alarme))}</span></span></button>
        <button type="button" class="ligne-entite speciale" data-a="choisir" data-v="@notification">${this._pastilleIcone("notification")}<span class="noms"><span class="nom">${this.t("notification")}</span><span class="sous">${this.t("notification_desc")}</span></span></button>`
      : "";
    return `
      <div class="voile" role="dialog" aria-modal="true" aria-label="${this.t(action ? "que_piloter" : "quelle_entite")}">
        <div class="feuille">
          <div class="entete-vue">
            <button type="button" class="icone-btn" data-a="fermer-selecteur" aria-label="${this.t("annuler")}"><ha-icon icon="mdi:close"></ha-icon></button>
            <h2>${this.t(action ? "que_piloter" : "quelle_entite")}</h2>
          </div>
          <label class="recherche"><ha-icon icon="mdi:magnify"></ha-icon>
            <input id="recherche" type="search" placeholder="${this.t("rechercher")}" aria-label="${this.t("rechercher")}" data-f="recherche" value="${esc(sel.recherche)}"></label>
          <div class="chips defile-h">${domaines.map((d) => `<button type="button" class="chip petit ${sel.domaine === d ? "on" : ""}" aria-pressed="${sel.domaine === d}" data-a="domaine-filtre" data-v="${d}">${esc(DOMAINES[this._langue][d] || d)}</button>`).join("")}</div>
          <div class="defile-v">
            ${speciaux}
            <div id="liste-entites">${this._lignesEntites()}</div>
          </div>
        </div>
      </div>`;
  }

  // ---- autres onglets

  _entites() {
    const lignes = (this._d.entites || []).map((e) => `<li class="entree">
      <div class="ligne-j"><button type="button" class="lien sans-marge" data-a="plus-info" data-id="${esc(e.entity_id)}">${esc(e.nom)}</button>
        <span class="valeur-etat">${esc(this._etatAffiche(e))}</span></div>
      <div class="sous">${esc(e.entity_id)}</div></li>`).join("");
    return `<div class="carte">
      <h2>${this.t("entites_titre")}</h2><p class="sous">${this.t("entites_desc")}</p>
      <ul class="journal">${lignes}</ul></div>`;
  }
  _etatAffiche(e) {
    const s = this._hass.states[e.entity_id];
    if (!s) return e.etat ?? "—";
    if (s.attributes.device_class === "timestamp" && s.state && !["unknown", "unavailable"].includes(s.state)) {
      try { return new Date(s.state).toLocaleString(this._langue === "fr" ? "fr-FR" : "en-GB", { dateStyle: "short", timeStyle: "short" }); } catch (err) { return s.state; }
    }
    return this._etatLisible(e.entity_id, s.state);
  }

  _journal() {
    const j = this._d.journal || [];
    const date = (iso) => { try { return new Date(iso).toLocaleString(this._langue === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch (e) { return iso; } };
    const classe = { restauree: "vert", ok: "vert", verif_ok: "vert", condition: "gris", pause: "gris", annulee: "gris", erreur: "rouge", verif_echec: "rouge" };
    const detail = (x) => {
      if (!x) return "";
      const m = /^([a-z_]+\.[\w]+) = (.*)$/.exec(x);
      if (m) return `${this._nomEntite(m[1])}${this._langue === "fr" ? " : " : ": "}${this._etatLisible(m[1], m[2])}`;
      const code = x.split(":")[0];
      return TEXTES[this._langue][`err.${code}`] ? this.t(`err.${code}`) : x;
    };
    const lignes = j.map((x) => `<li class="entree">
      <div class="ligne-j"><span class="nom">${esc(x.regle || "—")}</span><span class="tag ${classe[x.resultat] || "gris"}">${esc(this.t(`res_${x.resultat}`))}</span></div>
      <div class="sous"><ha-icon class="petite" icon="${ICONE_EVENEMENT[x.evenement] || "mdi:help"}"></ha-icon> ${esc(this.t(x.evenement))} · ${esc(date(x.date))}</div>
      ${x.detail ? `<div class="sous detail">${esc(x.resultat === "restauree" ? this.t(x.detail === "1" ? "n_entites_1" : "n_entites", { n: x.detail }) : detail(x.detail))}</div>` : ""}</li>`).join("");
    return `<div class="carte">
      <div class="entete-carte"><h2>${this.t("onglet_journal")}</h2>
        ${this._editeur && j.length ? `<button type="button" class="btn" data-a="vider-journal">${this.t("vider_journal")}</button>` : ""}</div>
      ${j.length ? `<ul class="journal">${lignes}</ul>` : `<p class="sous">${this.t("journal_vide")}</p>`}</div>`;
  }

  _carteImportExport() {
    const imp = this._import;
    const apercu = imp ? `
      <div class="apercu">
        <span class="etiquette">${this.t("import_trouve", { n: imp.regles.length })}</span>
        <span>${imp.regles.slice(0, 12).map((r) => esc(r.nom || "?")).join(" · ")}${imp.regles.length > 12 ? " …" : ""}</span>
      </div>
      <button type="button" class="option ${!imp.remplacer ? "on" : ""}" aria-pressed="${!imp.remplacer}" data-a="import-mode" data-v="0"><span class="rond"></span>
        <span class="noms"><span class="nom">${this.t("import_ajouter")}</span><span class="sous">${this.t("import_ajouter_desc")}</span></span></button>
      <button type="button" class="option ${imp.remplacer ? "on" : ""}" aria-pressed="${!!imp.remplacer}" data-a="import-mode" data-v="1"><span class="rond"></span>
        <span class="noms"><span class="nom">${this.t("import_remplacer")}</span><span class="sous">${this.t("import_remplacer_desc", { n: (this._d.regles || []).length })}</span></span></button>
      <div class="deux">
        <button type="button" class="btn" data-a="import-annuler">${this.t("annuler")}</button>
        <button type="button" class="btn primaire ${imp.remplacer ? "danger-plein" : ""}" data-a="import-valider">${imp.confirmer ? this.t("confirmer") : this.t("importer")}</button>
      </div>` : "";
    return `<div class="carte">
      <h2>${this.t("import_export_titre")}</h2>
      <p class="sous">${this.t("import_export_desc")}</p>
      <div class="deux">
        <button type="button" class="btn" data-a="exporter"><ha-icon icon="mdi:download"></ha-icon>${this.t("exporter")}</button>
        <label class="btn"><ha-icon icon="mdi:upload"></ha-icon>${this.t("importer_fichier")}
          <input type="file" accept=".json,application/json" data-f="fichier-import" class="masque"></label>
      </div>
      <button type="button" class="lien" data-a="copier-export"><ha-icon icon="mdi:content-copy"></ha-icon>${this.t("copier_export")}</button>
      ${apercu}
    </div>`;
  }

  async _exporter(copier) {
    const res = await this._ws("exporter");
    const texte = JSON.stringify(res, null, 2);
    if (copier) {
      await navigator.clipboard.writeText(texte);
      this._annoncer(this.t("export_copie", { n: res.regles.length }));
      return;
    }
    const url = URL.createObjectURL(new Blob([texte], { type: "application/json" }));
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = `protocole_alarme_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this._annoncer(this.t("export_fait", { n: res.regles.length }));
  }

  async _lireFichier(fichier) {
    if (!fichier) return;
    if (fichier.size > 1_000_000) { this._annoncer(this.t("err.fichier_invalide"), true); return; }
    try {
      const donnees = JSON.parse(await fichier.text());
      const regles = Array.isArray(donnees) ? donnees : donnees?.regles;
      if (!Array.isArray(regles) || !regles.length || !regles.every((r) => r && typeof r === "object")) throw new Error("format");
      const types = Array.isArray(donnees?.types) ? donnees.types.filter((t) => t && typeof t === "object").slice(0, 30) : undefined;
      this._import = { regles, types, remplacer: false, confirmer: false };
    } catch (err) {
      this._import = null;
      this._annoncer(this.t("err.fichier_invalide"), true);
      return;
    }
    this._dessiner();
  }

  async _importer() {
    const imp = this._import;
    if (imp.remplacer && !imp.confirmer) { imp.confirmer = true; this._dessiner(); return; }
    const res = await this._ws("importer", { regles: imp.regles, remplacer: imp.remplacer, ...(imp.types?.length ? { types: imp.types } : {}) });
    this._import = null;
    this._annoncer(this.t("import_fait", { n: res.importees }));
    await this._attendreRechargement();
  }

  _carteTypes() {
    const types = this._types();
    const regles = this._d.regles || [];
    const lignes = types.map((t, k) => {
      const n = regles.filter((r) => this._categorieDe(r) === t.id).length;
      const autres = t.id === "autres";
      return `
      <div class="ligne-type">
        <button type="button" class="ic bleu bouton-ic" data-a="type-icones" data-v="${esc(t.id)}" aria-label="${esc(this.t("type_icone"))}" aria-expanded="${this._typeEdite === t.id}"><ha-icon icon="${esc(t.icone)}"></ha-icon></button>
        <label class="nom-type"><span class="cache">${this.t("type_nom")}</span>
          <input type="text" maxlength="40" data-f="type-nom" data-id="${esc(t.id)}" value="${esc(this._nomType(t))}">
          <span class="sous n-regles">${this.t("n_regles", { n })}</span></label>
        <button type="button" class="icone-btn" data-a="type-monter" data-v="${esc(t.id)}" ${k === 0 ? "disabled" : ""} aria-label="${esc(this.t("type_monter"))}"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
        <button type="button" class="icone-btn" data-a="type-descendre" data-v="${esc(t.id)}" ${k === types.length - 1 ? "disabled" : ""} aria-label="${esc(this.t("type_descendre"))}"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
        <button type="button" class="icone-btn" data-a="type-supprimer" data-v="${esc(t.id)}" ${autres ? "disabled" : ""} aria-label="${esc(this.t("type_supprimer"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
      </div>
      ${this._typeEdite === t.id ? `<div class="palette">${ICONES_TYPES.map((ic) => `<button type="button" class="chip ${ic === t.icone ? "on" : ""}" data-a="type-icone" data-id="${esc(t.id)}" data-v="${ic}" aria-label="${ic}"><ha-icon icon="${ic}"></ha-icon></button>`).join("")}</div>` : ""}`;
    }).join("");
    return `<div class="carte">
      <h2>${this.t("types_titre")}</h2>
      <p class="sous">${this.t("types_desc")}</p>
      ${lignes}
      <button type="button" class="btn pointille" data-a="type-ajouter" ${types.length >= 30 ? "disabled" : ""}><ha-icon icon="mdi:plus"></ha-icon>${this.t("ajouter_type")}</button>
    </div>`;
  }

  _carteEditeurs() {
    const editeurs = new Set(this._d.editeurs || []);
    const lignes = (this._d.utilisateurs || []).map((u) => `
      <div class="ligne-reglage">
        <span class="noms"><span class="nom">${esc(u.nom)}</span>${u.admin ? `<span class="sous">${this.t("administrateur")}</span>` : ""}</span>
        ${u.admin
          ? `<span class="badge vert">${this.t("toujours_autorise")}</span>`
          : `<button type="button" class="sw ${editeurs.has(u.id) ? "on" : ""}" role="switch" aria-checked="${editeurs.has(u.id)}" aria-label="${esc(u.nom)}" data-a="editeur" data-id="${esc(u.id)}"><span></span></button>`}
      </div>`).join("");
    return `<div class="carte">
      <h2>${this.t("editeurs_titre")}</h2>
      <p class="sous">${this.t("editeurs_desc")}</p>
      ${lignes}
      <p class="sous"><ha-icon class="petite" icon="mdi:information-outline"></ha-icon> ${this.t("editeurs_note")}</p></div>`;
  }

  _reglages() {
    const d = this._d;
    const inst = d.instantane;
    const ls = d.simulateur;
    const etatAlarme = inst.etat_alarme ? this._etatLisible(inst.alarme, inst.etat_alarme) : this.t("alarme_absente");
    // Une seule colonne, des sections titrées : lisible sur téléphone comme sur grand écran
    const general = `
      <section class="section-reglages">
        <h2 class="titre-reglages">${this.t("sec_general")}</h2>
        <div class="carte liste-reglages">
          <div class="ligne-r">
            ${this._pastilleIcone("alarm_control_panel")}
            <span class="noms"><span class="nom">${this.t("reglages_alarme")}</span>
              <span class="sous">${esc(this._nomEntite(inst.alarme))} · ${esc(etatAlarme)}</span></span>
            ${this._admin ? `<a class="btn-mini" href="/config/integrations/integration/${DOMAINE}" title="${esc(this.t("changer_alarme"))}">${this.t("changer")}</a>` : ""}
          </div>
          <div class="ligne-r">
            ${this._pastilleIcone("switch")}
            <span class="noms"><span class="nom">${this.t("protocole_actif")}</span>
              <span class="sous">${this.t(inst.actif ? "protocole_actif_desc" : "protocole_pause")}</span></span>
            ${this._interrupteur(inst.actif, `data-a="actif"`, this.t("protocole_actif"))}
          </div>
          ${ls.statut === "pret" ? `
          <div class="ligne-r">
            ${this._pastilleIcone("simulateur")}
            <span class="noms"><span class="nom">${this.t("reglages_ls")}</span>
              <span class="sous">Lights Simulator · ${esc(ls.entite)}</span></span>
            <span class="badge vert">${this.t("pret")}</span>
          </div>
          ${ls.double_pilotage ? `<p class="avert">${this.t("ls_double")}</p>` : ""}` : ""}
        </div>
        ${ls.statut !== "pret" ? this._carteLs() : ""}
      </section>`;
    return `<div class="reglages">
      ${general}
      ${this._editeur ? `<section class="section-reglages"><h2 class="titre-reglages">${this.t("sec_organisation")}</h2>${this._carteTypes()}</section>` : ""}
      ${this._admin ? `<section class="section-reglages"><h2 class="titre-reglages">${this.t("sec_acces")}</h2>${this._carteEditeurs()}</section>` : ""}
      ${this._editeur ? `<section class="section-reglages"><h2 class="titre-reglages">${this.t("sec_sauvegarde")}</h2>${this._carteImportExport()}</section>` : ""}
      <p class="pied-version">Protocole Alarme ${esc(d.version)} · <a href="https://github.com/akoonet-homeassistant/protocole_alarme" target="_blank" rel="noopener noreferrer">GitHub</a></p>
    </div>`;
  }
}

const STYLE = `
  :host { display: block; min-height: 100vh; background: var(--primary-background-color, #f4f5f7); color: var(--primary-text-color, #1c1c1e);
    font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif); --bleu: var(--primary-color, #0b6bcb); --carte: var(--card-background-color, #fff);
    --trait: var(--divider-color, #e3e6ea); --gris: var(--secondary-text-color, #5f6368); }
  * { box-sizing: border-box; }
  ha-icon { --mdc-icon-size: 20px; }
  header { background: var(--app-header-background-color, var(--bleu)); color: var(--app-header-text-color, #fff); padding: 8px 16px 0; }
  .ligne-titre { display: flex; align-items: center; gap: 10px; min-height: 52px; max-width: 980px; margin: 0 auto; }
  .ligne-titre .logo { --mdc-icon-size: 26px; }
  h1 { margin: 0; font-size: 21px; font-weight: 500; flex: 1; }
  .pastille { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,.18); border-radius: 999px; padding: 6px 12px; font-size: 13px; font-weight: 500; white-space: nowrap; }
  .pastille .point { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .pastille.armee { background: #fff1e0; color: #8a4204; } .pastille.alerte { background: #fde7e9; color: #9b1c1c; }
  nav { display: flex; gap: 2px; overflow-x: auto; max-width: 980px; margin: 4px auto 0; }
  .onglet { border: 0; background: none; padding: 12px 14px; font: inherit; font-size: 14px; font-weight: 500; color: inherit; opacity: .8; border-bottom: 3px solid transparent; cursor: pointer; min-height: 48px; white-space: nowrap; }
  .onglet.on { opacity: 1; border-bottom-color: currentColor; }
  main { max-width: 980px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .message { max-width: 948px; margin: 12px auto 0; padding: 10px 16px; border-radius: 10px; background: #e3f0fb; color: #0b4f96; font-size: 14px; }
  .message.erreur { background: #fde7e9; color: #9b1c1c; }
  .bandeau { padding: 10px 14px; border-radius: 10px; background: #e3f0fb; color: #0b4f96; font-size: 14px; }
  .bandeau.orange, .avert { background: #fff1e0; color: #7a3a04; } .avert { padding: 10px 12px; border-radius: 10px; font-size: 13px; margin: 8px 0 0; }
  .carte { background: var(--carte); border-radius: var(--ha-card-border-radius, 14px); border: 1px solid var(--trait); padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .carte.vide { color: var(--gris); text-align: center; padding: 28px 16px; }
  .pile { display: flex; flex-direction: column; gap: 12px; }
  .reglages { display: flex; flex-direction: column; gap: 22px; max-width: 760px; width: 100%; margin: 0 auto; }
  .section-reglages { display: flex; flex-direction: column; gap: 10px; }
  .titre-reglages { margin: 0 4px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--gris); }
  .liste-reglages { gap: 0; padding: 4px 16px; }
  .ligne-r { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 0; }
  .ligne-r + .ligne-r { border-top: 1px solid var(--trait); }
  .ligne-r .noms { flex: 1; min-width: 0; }
  .ligne-r .sous { overflow-wrap: anywhere; }
  .liste-reglages .avert { margin: 0 0 12px; }
  .btn-mini { display: inline-flex; align-items: center; min-height: 36px; padding: 0 14px; border-radius: 18px; border: 1px solid var(--trait); color: var(--bleu); text-decoration: none; font-size: 14px; font-weight: 500; white-space: nowrap; }
  .btn-mini:hover { background: var(--secondary-background-color, #f1f3f4); }
  .section-reglages > .carte > h2:first-child { display: none; }
  .pied-version { text-align: center; font-size: 13px; color: var(--gris); margin: 0 0 8px; }
  .pied-version a { color: inherit; }
  .groupe { display: flex; flex-direction: column; gap: 8px; }
  .groupe + .groupe { margin-top: 10px; }
  .titre-groupe { display: flex; align-items: center; gap: 8px; width: 100%; margin: 4px 0 0; padding: 8px 4px; min-height: 44px; border: 0; background: none; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color, #5f6368); text-align: left; border-radius: 8px; }
  .titre-groupe:hover { background: rgba(0,0,0,.04); }
  .titre-groupe .nom-groupe { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .titre-groupe .chevron { --mdc-icon-size: 22px; }
  .outils-groupes { display: flex; justify-content: flex-end; margin-bottom: -6px; }
  .ligne-type { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid var(--trait); }
  .ligne-type .nom-type { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; }
  .ligne-type .nom-type input { flex: 1; min-width: 0; }
  @media (max-width: 560px) { .ligne-type .nom-type { flex-direction: column; align-items: stretch; gap: 2px; } }
  .ligne-type input { width: 100%; font: inherit; font-size: 15px; padding: 6px 10px; border: 1px solid transparent; border-radius: 8px; background: var(--secondary-background-color, #f5f6f8); color: inherit; min-height: 38px; }
  .ligne-type input:hover { border-color: var(--trait); }
  .ligne-type input:focus { outline: none; border-color: var(--bleu); background: transparent; }
  .ligne-type .n-regles { white-space: nowrap; padding-left: 4px; }
  .ligne-type .icone-btn { width: 40px; height: 40px; }
  .bouton-ic { border: 0; cursor: pointer; flex: none; }
  .icone-btn:disabled { opacity: .3; cursor: default; }
  .icone-btn:not(:disabled):hover { background: rgba(0,0,0,.06); }
  .palette { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 0 10px 46px; }
  .palette .chip { padding: 8px; min-width: 40px; justify-content: center; }
  .cache { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .titre-groupe ha-icon { --mdc-icon-size: 18px; }
  .titre-groupe .nb { margin-left: auto; font-weight: 500; background: var(--secondary-background-color, #eceff1); border-radius: 999px; padding: 1px 9px; font-size: 12px; }
  .retrait { display: flex; flex-direction: column; gap: 8px; margin-left: 14px; padding-left: 12px; border-left: 3px solid var(--divider-color, #e0e0e0); }
  h4.sinon { margin: 10px 0 0; }
  .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; align-items: start; }
  h2 { margin: 0; font-size: 18px; font-weight: 500; } h3.titre-etape { margin: 4px 0 0; font-size: 20px; font-weight: 700; } h4 { margin: 8px 0 0; font-size: 16px; font-weight: 500; }
  .sous { color: var(--gris); font-size: 13px; margin: 0; } .centre { text-align: center; justify-content: center; }
  .seg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; background: var(--secondary-background-color, #e8eaed); border-radius: 12px; padding: 4px; }
  .seg button { min-height: 44px; border: 0; border-radius: 9px; background: transparent; color: inherit; font: inherit; font-size: 14px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
  .seg button.on { background: var(--carte); color: var(--bleu); box-shadow: 0 1px 2px rgba(0,0,0,.12); }
  .tete { display: flex; align-items: center; gap: 12px; } .noms { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; text-align: left; }
  .noms .sous, .noms .nom, .noms .id { overflow-wrap: anywhere; }
  .noms .type { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 13px; color: var(--primary-text-color, #1c1c1e); }
  .tag-type { font-size: 12px; font-weight: 700; color: var(--bleu); background: color-mix(in srgb, var(--bleu) 10%, transparent); border-radius: 999px; padding: 2px 8px; }
  .noms .id { font-size: 12px; color: var(--gris); }
  .liste-restaurer { display: flex; flex-direction: column; gap: 6px; }
  .ligne-restaurer { display: flex; align-items: center; gap: 10px; padding: 6px 4px 6px 8px; border: 1px solid var(--bord, #dde2e9); border-radius: 10px; }
  .ligne-restaurer .noms { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .meta.restaurer ha-icon, .meta.memo { color: #6b2e9a; } .meta.memo { font-weight: 500; } .entite-btn > ha-icon { flex: none; }
  .nom { font-size: 16px; font-weight: 500; } .nom.grand { font-size: 19px; font-weight: 700; }
  .ic { width: 40px; height: 40px; flex: none; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; }
  .ic.gris { background: #eef0f3; color: #3c4043; } .ic.bleu { background: #e6f0fb; color: #0b4f96; } .ic.jaune { background: #fff6d6; color: #7a5a00; }
  .ic.orange { background: #fff1e0; color: #9a4a06; } .ic.vert { background: #e3f4ea; color: #1d6b3a; } .ic.violet { background: #f3e8fb; color: #6b2e9a; }
  .regle.eteinte { opacity: .62; }
  .phrase { font-size: 14px; line-height: 1.5; background: var(--secondary-background-color, #f4f5f7); border-radius: 10px; padding: 10px 12px; }
  .meta { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--gris); } .meta ha-icon { --mdc-icon-size: 16px; }
  .actions-carte { display: flex; flex-wrap: wrap; gap: 4px; border-top: 1px solid var(--trait); padding-top: 4px; }
  .lien { min-height: 44px; border: 0; background: transparent; color: var(--bleu); font: inherit; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; padding: 0 8px; cursor: pointer; text-decoration: none; }
  .lien ha-icon { --mdc-icon-size: 18px; } .lien.danger, .icone-btn.danger { color: var(--error-color, #b3261e); } .icone-btn.bleu { color: var(--bleu); } .espace { flex: 1; } .lien.sans-marge { padding: 0; min-height: 0; text-align: left; }
  .sw { width: 48px; height: 44px; border: 0; background: transparent; padding: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
  .sw span { width: 44px; height: 26px; border-radius: 13px; background: #b9bec6; position: relative; display: block; }
  .sw span::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: left .15s; }
  .sw.on span { background: var(--bleu); } .sw.on span::after { left: 21px; } .sw:disabled { cursor: default; opacity: .6; }
  .btn { min-height: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid #c9ced6; background: var(--carte); color: var(--primary-text-color, #1c1c1e); font: inherit; font-size: 15px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; text-decoration: none; }
  .btn.grand { min-height: 50px; width: 100%; } .btn.primaire { background: var(--bleu); border-color: var(--bleu); color: #fff; }
  .btn.danger-plein { background: var(--error-color, #b3261e); border-color: var(--error-color, #b3261e); }
  label.btn { position: relative; } .masque { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  .btn.contour { border-color: var(--bleu); color: var(--bleu); } .btn.pointille { border: 1px dashed #9aa3ae; background: transparent; color: var(--bleu); min-height: 48px; }
  .boutons-bas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 10px; }
  .icone-btn { width: 44px; height: 44px; border: 0; background: transparent; color: inherit; display: inline-flex; align-items: center; justify-content: center; border-radius: 22px; cursor: pointer; font-size: 20px; flex: none; }
  .entete-vue { display: flex; align-items: center; gap: 4px; } .entete-vue h2 { flex: 1; }
  .grille-modeles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 10px; }
  .modele { flex-direction: row; align-items: center; text-align: left; cursor: pointer; font: inherit; color: inherit; min-height: 72px; }
  .modele > span:last-child { display: flex; flex-direction: column; gap: 2px; }
  .assistant { display: flex; flex-direction: column; gap: 14px; max-width: 620px; width: 100%; margin: 0 auto; }
  .progression { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .progression li { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--gris); }
  .progression .barre { height: 4px; border-radius: 2px; background: #d6dae0; } .progression .fait .barre, .progression .en-cours .barre { background: var(--bleu); }
  .progression .en-cours { color: var(--bleu); font-weight: 700; }
  .corps { display: flex; flex-direction: column; gap: 12px; }
  .pied { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; position: sticky; bottom: 0; padding: 12px 0; background: var(--primary-background-color, #f4f5f7); }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; color: var(--gris); }
  .champ.court { max-width: 200px; }
  input[type=text], input[type=number], input[type=search], select, textarea { min-height: 48px; border: 1px solid #c9ced6; border-radius: 12px; padding: 0 14px; font: inherit; font-size: 16px; background: var(--carte); color: var(--primary-text-color, #1c1c1e); width: 100%; }
  textarea { padding: 10px 14px; resize: vertical; } textarea.code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.45; }
  .deux { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .option { position: relative; display: flex; align-items: center; gap: 12px; text-align: left; width: 100%; padding: 14px; border-radius: 14px; border: 1px solid #d6dae0; background: var(--carte); color: inherit; font: inherit; cursor: pointer; }
  .option.on { border: 2px solid var(--bleu); background: color-mix(in srgb, var(--bleu) 9%, var(--carte)); padding: 13px; }
  .option.grande { flex-direction: column; align-items: flex-start; gap: 8px; min-height: 150px; padding: 16px 14px; } .option.grande.on { padding: 15px 13px; }
  .option .coche { position: absolute; top: 14px; right: 14px; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #9aa3ae; }
  .option.on .coche { border: 6px solid var(--bleu); }
  .sous-options { margin-top: -4px; }
  .case { margin-left: auto; width: 24px; height: 24px; flex: none; border-radius: 6px; border: 2px solid #9aa3ae; display: inline-flex; align-items: center; justify-content: center; }
  .case.on { background: var(--bleu); border-color: var(--bleu); color: #fff; } .case ha-icon { --mdc-icon-size: 16px; }
  .option .rond { width: 20px; height: 20px; flex: none; border-radius: 50%; border: 2px solid #9aa3ae; } .option.on .rond { border: 6px solid var(--bleu); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid #d6dae0; background: var(--carte); color: inherit; font: inherit; font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .chip ha-icon { --mdc-icon-size: 16px; } .chip.on { border: 2px solid var(--bleu); background: color-mix(in srgb, var(--bleu) 9%, var(--carte)); color: var(--bleu); padding: 0 15px; }
  .chip.petit { min-height: 36px; font-size: 13px; padding: 0 12px; } .chip.petit.on { padding: 0 11px; }
  .carte.bloc { gap: 12px; } .tete-bloc { display: flex; align-items: center; justify-content: space-between; margin: -6px -6px -4px 0; }
  .etiquette { font-size: 12px; font-weight: 700; color: var(--gris); letter-spacing: .04em; text-transform: uppercase; }
  .entite-btn { min-height: 60px; border: 1px solid #c9ced6; border-radius: 12px; background: var(--carte); padding: 8px 12px; display: flex; align-items: center; gap: 12px; color: inherit; font: inherit; cursor: pointer; width: 100%; }
  .entite-btn .ic { width: 36px; height: 36px; border-radius: 10px; } .entite-btn.vide { border-style: dashed; color: var(--bleu); }
  .reglage { background: var(--secondary-background-color, #f4f5f7); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .reglage .ligne { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; font-weight: 500; }
  .reglage output { font-weight: 700; color: var(--bleu); } input[type=range] { width: 100%; height: 32px; accent-color: var(--bleu); margin: 0; }
  .phrase-verif { display: flex; flex-direction: column; gap: 10px; }
  .apercu { background: var(--secondary-background-color, #f4f5f7); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 1.45; }
  .ligne-delai { flex-direction: row; align-items: center; gap: 10px; padding: 6px 12px 6px 16px; } .ligne-delai .nom { flex: 1; font-size: 15px; font-weight: 400; }
  .ligne-delai .valeur { min-width: 52px; text-align: center; font-weight: 500; } .ligne-delai .icone-btn { color: var(--bleu); font-size: 22px; }
  .recap-ligne { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 10px; align-items: baseline; font-size: 15px; line-height: 1.5; padding-top: 12px; border-top: 1px solid var(--trait); }
  .voile { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; justify-content: center; align-items: flex-end; z-index: 10; }
  @media (min-width: 700px) { .voile { align-items: center; } .feuille { border-radius: 18px !important; } }
  .feuille { width: min(620px, 100%); max-height: 92vh; background: var(--primary-background-color, #f4f5f7); border-radius: 18px 18px 0 0; padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
  .recherche { flex: none; display: flex; align-items: center; gap: 8px; border: 1px solid #c9ced6; border-radius: 12px; padding: 0 12px; background: var(--carte); }
  .recherche input { border: 0; padding: 0; min-height: 46px; } .recherche input:focus { outline: none; }
  .defile-h { flex-wrap: nowrap; overflow-x: auto; padding: 2px 0; flex: none; } .defile-h .chip { flex: none; } .feuille > .entete-vue, .recherche { flex: none; } .defile-v { overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  #liste-entites { display: flex; flex-direction: column; background: var(--carte); border-radius: 14px; border: 1px solid var(--trait); }
  .ligne-entite { min-height: 60px; border: 0; border-bottom: 1px solid var(--trait); background: transparent; padding: 8px 14px; display: flex; align-items: center; gap: 12px; color: inherit; font: inherit; cursor: pointer; width: 100%; text-align: left; }
  .ligne-entite .ic { width: 36px; height: 36px; border-radius: 10px; } .ligne-entite.speciale { background: var(--carte); border: 1px solid var(--trait); border-radius: 14px; }
  .ls { border: 2px solid #e0a23a; } .ls.compacte { border: 0; padding: 0; } .ls p { margin: 0; font-size: 14px; line-height: 1.5; }
  .badge { align-self: flex-start; font-size: 12px; font-weight: 700; color: #7a4b00; background: #fff1d6; border-radius: 999px; padding: 3px 10px; }
  .badge.vert { color: #1d6b3a; background: #e3f4ea; align-self: center; }
  .ls .sous { display: flex; gap: 6px; align-items: flex-start; } .ls .sous ha-icon { --mdc-icon-size: 16px; flex: none; }
  .entete-carte { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .defile { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th { text-align: left; font-weight: 500; color: var(--gris); font-size: 13px; padding: 10px 8px; border-bottom: 1px solid var(--trait); }
  td { padding: 10px 8px; border-bottom: 1px solid var(--trait); vertical-align: top; } .nowrap { white-space: nowrap; }
  .ent { display: block; font-size: 12px; color: var(--gris); margin-top: 2px; } ha-icon.petite { --mdc-icon-size: 16px; color: var(--gris); }
  .tag { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .tag.vert { background: #e3f4ea; color: #1d6b3a; } .tag.rouge { background: #fde7e9; color: #9b1c1c; } .tag.gris { background: #eef0f3; color: #3c4043; }
  .journal { list-style: none; margin: 0; padding: 0; } .entree { padding: 10px 0; border-top: 1px solid var(--trait); display: flex; flex-direction: column; gap: 4px; }
  .ligne-j { display: flex; justify-content: space-between; align-items: center; gap: 10px; } .ligne-j .nom { font-size: 15px; } .detail { font-style: italic; } .valeur-etat { font-size: 14px; white-space: nowrap; }
  .sous ha-icon.petite { vertical-align: -3px; }
  pre.code { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; background: var(--secondary-background-color, #f4f5f7); padding: 10px; border-radius: 8px; }
  .ligne-reglage { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 15px; border-top: 1px solid var(--trait); padding-top: 6px; }
  @media (max-width: 420px) { .deux { gap: 8px; } .recap-ligne { grid-template-columns: 76px minmax(0, 1fr); } }
`;

customElements.define("protocole-alarme-panel", ProtocoleAlarmePanel);
