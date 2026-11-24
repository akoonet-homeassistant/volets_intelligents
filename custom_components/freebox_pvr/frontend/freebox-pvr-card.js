/* Freebox PVR — carte du tableau de bord : guide Programme TNT FR + enregistrement sur la Freebox.
   Chargée sur toutes les pages par l'intégration (aucune ressource Lovelace à ajouter). */

const VERSION_CARTE = "2026.11.8";

const TEXTES = {
  fr: {
    titre: "Programme TV",
    onglets: { maintenant: "Maintenant", soir: "Ce soir", enregistrements: "Enregistrements" },
    creneaux: { current: "En cours", next: "Ensuite", prime_time: "Première partie", second_part: "Deuxième partie" },
    enregistrer: "Enregistrer sur la Freebox",
    programme: "Enregistrement programmé — appuyer pour annuler",
    confirmer: "Annuler ?",
    en_cours: "Enregistrement en cours — appuyer pour arrêter",
    introuvable: "Chaîne introuvable sur la Freebox (voir les options de Freebox PVR)",
    aucun_guide: "Aucun capteur Programme TNT FR trouvé.",
    aucune_pvr: "Intégration Freebox PVR non trouvée.",
    aucun_enr: "Aucun enregistrement programmé.",
    pas_de_programme: "Pas de programme",
    conflit: "Conflit",
    reste: "encore {n} min",
    ok_enr: "Enregistrement programmé : {t}",
    deja: "Déjà programmé : {t}",
    ok_ann: "Enregistrement annulé : {t}",
    erreur: "Freebox PVR : {e}",
    repetitions: "Répétitions chaque semaine", arreter: "Arrêter la répétition (les enregistrements déjà programmés sont gardés)", arreter_court: "Arrêter ?",
    ok_arret: "Répétition arrêtée : {t}",
    a_venir: "À venir", termines: "Terminés", aucun_termine: "Aucun enregistrement terminé sur la Freebox.", tout_afficher: "Tout afficher ({n})",
    confirmer_court: "Confirmer ?", en_pause: "En pause",
    act: { pause_record: "Mettre en pause", resume_record: "Reprendre", cancel: "Annuler l'enregistrement", stop_record: "Arrêter l'enregistrement (la partie enregistrée est gardée)",
      delete_finished: "Supprimer (le fichier est effacé du disque)", pause_repeat: "Mettre la répétition en pause", resume_repeat: "Reprendre la répétition", stop_repeat: "Arrêter la répétition" },
    ok: { pause_record: "En pause : {t}", resume_record: "Repris : {t}", cancel: "Enregistrement annulé : {t}", stop_record: "Enregistrement arrêté : {t}",
      delete_finished: "Enregistrement supprimé : {t}", pause_repeat: "Répétition en pause : {t}", resume_repeat: "Répétition reprise : {t}", stop_repeat: "Répétition arrêtée : {t}" },
    duree: "{n} min", go: "{n} Go", mo: "{n} Mo",
    etats: { waiting_start_time: "Prévu", starting: "Démarrage", running: "En cours", finished: "Terminé", failed: "Échec", start_error: "Échec", running_error: "Échec", disabled: "En pause" },
    ed: {
      title: "Titre", chaines: "Chaînes (vide = toutes, dans l'ordre choisi)", onglet: "Onglet affiché à l'ouverture",
      afficher_affiches: "Afficher les affiches dans le détail", pvr_entity: "Capteur « Enregistrements programmés » (facultatif)",
    },
  },
  en: {
    titre: "TV guide",
    onglets: { maintenant: "Now", soir: "Tonight", enregistrements: "Recordings" },
    creneaux: { current: "Now", next: "Next", prime_time: "Prime time", second_part: "Second part" },
    enregistrer: "Record on the Freebox",
    programme: "Recording scheduled — tap to cancel",
    confirmer: "Cancel?",
    en_cours: "Recording in progress — tap to stop",
    introuvable: "Channel not found on the Freebox (see Freebox PVR options)",
    aucun_guide: "No Programme TNT FR sensor found.",
    aucune_pvr: "Freebox PVR integration not found.",
    aucun_enr: "No scheduled recording.",
    pas_de_programme: "No program",
    conflit: "Conflict",
    reste: "{n} min left",
    ok_enr: "Recording scheduled: {t}",
    deja: "Already scheduled: {t}",
    ok_ann: "Recording cancelled: {t}",
    erreur: "Freebox PVR: {e}",
    repetitions: "Weekly repeats", arreter: "Stop repeating (already scheduled recordings are kept)", arreter_court: "Stop?",
    ok_arret: "Repeat stopped: {t}",
    a_venir: "Upcoming", termines: "Finished", aucun_termine: "No finished recording on the Freebox.", tout_afficher: "Show all ({n})",
    confirmer_court: "Confirm?", en_pause: "Paused",
    act: { pause_record: "Pause", resume_record: "Resume", cancel: "Cancel the recording", stop_record: "Stop the recording (what was recorded is kept)",
      delete_finished: "Delete (the file is erased from the disk)", pause_repeat: "Pause the repeat", resume_repeat: "Resume the repeat", stop_repeat: "Stop the repeat" },
    ok: { pause_record: "Paused: {t}", resume_record: "Resumed: {t}", cancel: "Recording cancelled: {t}", stop_record: "Recording stopped: {t}",
      delete_finished: "Recording deleted: {t}", pause_repeat: "Repeat paused: {t}", resume_repeat: "Repeat resumed: {t}", stop_repeat: "Repeat stopped: {t}" },
    duree: "{n} min", go: "{n} GB", mo: "{n} MB",
    etats: { waiting_start_time: "Scheduled", starting: "Starting", running: "Recording", finished: "Finished", failed: "Failed", start_error: "Failed", running_error: "Failed", disabled: "Paused" },
    ed: {
      title: "Title", chaines: "Channels (empty = all, in the chosen order)", onglet: "Tab shown on opening",
      afficher_affiches: "Show posters in the details", pvr_entity: "“Scheduled recordings” sensor (optional)",
    },
  },
};

const ONGLETS = { maintenant: ["current", "next"], soir: ["prime_time", "second_part"] };
const GUIDE = "programme_tnt_fr";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const langue = (hass) => (String(hass?.locale?.language || hass?.language || "fr").startsWith("fr") ? "fr" : "en");
const ts = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? null : Math.floor(t / 1000); };
const urlSure = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");

function capteursGuide(hass) {
  const reg = hass?.entities || {};
  const ids = Object.keys(reg).filter((id) => reg[id]?.platform === GUIDE && id.startsWith("sensor.") && hass.states[id]?.attributes?.channel_name);
  if (ids.length) return ids;
  return Object.keys(hass?.states || {}).filter((id) => id.startsWith("sensor.") && hass.states[id].attributes?.channel_name && hass.states[id].attributes?.prime_time !== undefined);
}

function capteurPvr(hass, config) {
  if (config.pvr_entity && hass.states[config.pvr_entity]) return config.pvr_entity;
  const reg = hass?.entities || {};
  const id = Object.keys(reg).find((e) => reg[e]?.platform === "freebox_pvr" && e.startsWith("sensor.") && hass.states[e]?.attributes?.guide_channels);
  return id || Object.keys(hass?.states || {}).find((e) => e.startsWith("sensor.") && hass.states[e].attributes?.guide_channels);
}

function capteurTermines(hass) {
  const reg = hass?.entities || {};
  const id = Object.keys(reg).find((e) => reg[e]?.platform === "freebox_pvr" && e.startsWith("sensor.") && Array.isArray(hass.states[e]?.attributes?.recordings));
  return id || Object.keys(hass?.states || {}).find((e) => e.startsWith("sensor.") && Array.isArray(hass.states[e].attributes?.recordings) && "total_size" in hass.states[e].attributes);
}

/** Enregistrement qui couvre au moins la moitié du programme sur cette chaîne. */
function enregistrementPour(records, uuid, debut, fin) {
  if (!uuid || debut == null) return null;
  return (records || []).find((r) => {
    if (r.channel_uuid !== uuid) return false;
    const rs = r.start_ts ?? ts(r.start), re = r.end_ts ?? ts(r.end);
    if (fin && fin > debut) return (Math.min(re, fin) - Math.max(rs, debut)) * 2 >= fin - debut;
    return rs <= debut + 60 && re > debut;
  }) || null;
}

class FreeboxPvrCard extends HTMLElement {
  static getConfigElement() { return document.createElement("freebox-pvr-card-editor"); }
  static getStubConfig() { return { onglet: "soir" }; }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._onglet = null;
    this._ouvert = new Set();   // programmes dépliés
    this._attente = new Set();  // programmes en cours d'envoi
    this._confirmer = null;     // clé du programme dont l'annulation attend une confirmation
    this._signature = "";
    this._etats = {};           // état des panneaux d'enregistrement (heure de fin, chaque semaine…)
    this._panneaux = [];
  }

  setConfig(config) {
    this._config = { onglet: "soir", afficher_affiches: true, ...(config || {}) };
    if (!["maintenant", "soir", "enregistrements"].includes(this._config.onglet)) this._config.onglet = "soir";
    this._onglet = this._config.onglet;
    this._signature = "";
    if (this._hass) this._rendu();
  }

  set hass(hass) {
    this._hass = hass;
    const sig = this._calculerSignature();
    if (sig !== this._signature) { this._signature = sig; this._rendu(); }
  }

  getCardSize() { return 2 + this._chaines().length; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }

  _t() { return TEXTES[langue(this._hass)]; }

  _chaines() {
    if (!this._hass) return [];
    const choix = (this._config.chaines || []).filter((e) => this._hass.states[e]);
    return choix.length ? choix : capteursGuide(this._hass);
  }

  _calculerSignature() {
    if (!this._hass) return "";
    const pvr = capteurPvr(this._hass, this._config);
    const parts = this._chaines().map((e) => this._hass.states[e]?.last_updated);
    parts.push(pvr ? this._hass.states[pvr]?.last_updated : "");
    const fini = capteurTermines(this._hass);
    parts.push(fini ? this._hass.states[fini]?.last_updated : "");
    parts.push(langue(this._hass), Math.floor(Date.now() / 60000)); // rafraîchit la barre de progression chaque minute
    return parts.join("|");
  }

  _heure(sec) {
    return new Date(sec * 1000).toLocaleTimeString(langue(this._hass) === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  _jourHeure(sec) {
    const d = new Date(sec * 1000);
    const loc = langue(this._hass) === "fr" ? "fr-FR" : "en-GB";
    return `${d.toLocaleDateString(loc, { weekday: "short", day: "2-digit", month: "2-digit" })} ${this._heure(sec)}`;
  }

  _notifier(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
  }

  async _enregistrer(entite, creneau, titre, cle) {
    const t = this._t();
    this._attente.add(cle); this._signature = ""; this._rendu();
    try {
      const rep = await this._hass.callService("freebox_pvr", "record", { entity_id: entite, slot: creneau }, undefined, false, true);
      const r = rep?.response || {};
      this._notifier((r.already_programmed ? t.deja : t.ok_enr).replace("{t}", titre));
    } catch (err) {
      this._notifier(t.erreur.replace("{e}", err?.message || err));
    } finally {
      this._attente.delete(cle); this._signature = ""; this._rendu();
    }
  }

  async _annuler(id, titre, cle) {
    const t = this._t();
    this._confirmer = null;
    this._attente.add(cle); this._signature = ""; this._rendu();
    try {
      await this._hass.callService("freebox_pvr", "cancel", { record_id: id }, undefined, false, true);
      this._notifier(t.ok_ann.replace("{t}", titre));
    } catch (err) {
      this._notifier(t.erreur.replace("{e}", err?.message || err));
    } finally {
      this._attente.delete(cle); this._signature = ""; this._rendu();
    }
  }

  async _arreter(id, titre, cle) {
    const t = this._t();
    this._confirmer = null;
    this._attente.add(cle); this._signature = ""; this._rendu();
    try {
      await this._hass.callService("freebox_pvr", "stop_repeat", { repeat_id: id }, undefined, false, true);
      this._notifier(t.ok_arret.replace("{t}", titre));
    } catch (err) {
      this._notifier(t.erreur.replace("{e}", err?.message || err));
    } finally {
      this._attente.delete(cle); this._signature = ""; this._rendu();
    }
  }

  /** Bouton d'action d'un enregistrement / d'une répétition (avec confirmation si demandé). */
  _btn(svc, id, titre, icone, confirmer = false, cls = "") {
    const t = this._t();
    const cle = `${svc}|${id}`;
    const champ = svc.endsWith("_repeat") ? "repeat_id" : "record_id";
    const attrs = `data-cle="${esc(cle)}" data-svc="${esc(svc)}" data-champ="${champ}" data-id="${esc(id)}" data-titre="${esc(titre)}"`;
    if (this._attente.has(cle)) return `<span class="rec attente"><ha-circular-progress indeterminate size="small"></ha-circular-progress></span>`;
    if (confirmer && this._confirmer === cle) return `<button class="rec confirmer" data-action="svc" ${attrs}>${esc(t.confirmer_court)}</button>`;
    return `<button class="rec ${cls}" data-action="${confirmer ? "demander" : "svc"}" ${attrs} title="${esc(t.act[svc])}" aria-label="${esc(t.act[svc])}"><ha-icon icon="${icone}"></ha-icon></button>`;
  }

  async _service(svc, champ, id, titre, cle) {
    const t = this._t();
    this._confirmer = null;
    this._attente.add(cle); this._signature = ""; this._rendu();
    try {
      await this._hass.callService("freebox_pvr", svc, { [champ]: champ === "record_id" ? Number(id) : id }, undefined, false, true);
      this._notifier(t.ok[svc].replace("{t}", titre));
    } catch (err) {
      this._notifier(t.erreur.replace("{e}", err?.message || err));
    } finally {
      this._attente.delete(cle); this._signature = ""; this._rendu();
    }
  }

  _taille(octets) {
    const t = this._t();
    if (!octets) return "";
    const loc = langue(this._hass) === "fr" ? "fr-FR" : "en-GB";
    return octets >= 1e9
      ? t.go.replace("{n}", (octets / 1e9).toLocaleString(loc, { maximumFractionDigits: 1 }))
      : t.mo.replace("{n}", Math.round(octets / 1e6).toLocaleString(loc));
  }

  _ongletEnregistrements(pvr) {
    const t = this._t();
    const records = pvr.attributes.records || [];
    const repeats = pvr.attributes.repeats || [];
    const finiId = capteurTermines(this._hass);
    const finis = finiId ? this._hass.states[finiId].attributes.recordings || [] : [];
    const nbFinis = finiId ? Number(this._hass.states[finiId].state) || finis.length : 0;
    const sous = this._sous || "avenir";
    const choix = `<div class="sous-onglets">
      <button class="sous-onglet ${sous === "avenir" ? "sel" : ""}" data-sous="avenir">${esc(t.a_venir)} <small>${records.length}</small></button>
      <button class="sous-onglet ${sous === "termines" ? "sel" : ""}" data-sous="termines">${esc(t.termines)} <small>${nbFinis}</small></button></div>`;
    if (sous === "termines") {
      if (!finis.length) return choix + `<div class="msg">${esc(t.aucun_termine)}</div>`;
      const liste = this._tousFinis ? finis : finis.slice(0, 15);
      return choix + liste.map((r) => {
        const rs = r.start_ts ?? ts(r.start);
        const duree = r.duration ? t.duree.replace("{n}", Math.round(r.duration / 60)) : "";
        const echec = ["failed", "start_error", "running_error"].includes(r.state);
        return `<div class="enr"><div class="info">
            <div class="ligne1"><span class="cren">${esc(r.channel_name)}</span><span class="heure">${rs ? esc(this._jourHeure(rs)) : ""}</span>
            ${duree ? `<span>${esc(duree)}</span>` : ""}${r.byte_size ? `<span>${esc(this._taille(r.byte_size))}</span>` : ""}${echec ? `<span class="badge rouge">${esc(t.etats[r.state] || r.state)}</span>` : ""}</div>
            <div class="titre">${esc(r.name)}</div>${r.subname ? `<div class="sous">${esc(r.subname)}</div>` : ""}
          </div><div class="actions">${this._btn("delete_finished", r.id, r.name, "mdi:delete-outline", true)}</div></div>`;
      }).join("") + (!this._tousFinis && finis.length > 15
        ? `<button class="plus" data-action="tout">${esc(t.tout_afficher.replace("{n}", finis.length))}</button>` : "");
    }
    let html = choix + (records.length ? records.map((r) => {
      const rs = r.start_ts ?? ts(r.start), re = r.end_ts ?? ts(r.end);
      const enCours = ["starting", "running"].includes(r.state);
      const enPause = r.state === "disabled";
      const boutons = enCours
        ? this._btn("stop_record", r.id, r.name, "mdi:stop", true, "actif")
        : (enPause ? this._btn("resume_record", r.id, r.name, "mdi:play") : this._btn("pause_record", r.id, r.name, "mdi:pause"))
          + this._btn("cancel", r.id, r.name, "mdi:close", true);
      return `<div class="enr ${enPause ? "en-pause" : ""}"><div class="info">
          <div class="ligne1"><span class="cren">${esc(r.channel_name)}</span><span class="heure">${rs ? esc(this._jourHeure(rs)) : ""}${re ? ` – ${esc(this._heure(re))}` : ""}</span>
          <span class="badge ${enCours ? "rouge" : ""}">${esc(t.etats[r.state] || r.state)}</span>${r.repeat_id ? `<span class="badge">↻</span>` : ""}${r.conflict ? `<span class="badge rouge">${esc(t.conflit)}</span>` : ""}</div>
          <div class="titre">${esc(r.name)}</div>${r.subname ? `<div class="sous">${esc(r.subname)}</div>` : ""}
        </div><div class="actions">${boutons}</div></div>`;
    }).join("") : `<div class="msg">${esc(t.aucun_enr)}</div>`);
    if (repeats.length) {
      html += `<div class="section">${esc(t.repetitions)}</div>` + repeats.map((rp) => {
        const jour = rp.next_start_ts ? jourSemaine(rp.next_start_ts, this._hass) : "";
        const fin = (() => { const [h, m] = rp.time.split(":").map(Number); const x = (h * 60 + m + rp.duration) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; })();
        const boutons = (rp.paused ? this._btn("resume_repeat", rp.id, rp.title, "mdi:play") : this._btn("pause_repeat", rp.id, rp.title, "mdi:pause"))
          + this._btn("stop_repeat", rp.id, rp.title, "mdi:repeat-off", true);
        return `<div class="enr ${rp.paused ? "en-pause" : ""}"><div class="info">
            <div class="ligne1"><span class="cren">${esc(rp.channel_name)}</span><span class="heure">↻ ${esc(jour)} ${esc(rp.time)} – ${esc(fin)}</span>${rp.paused ? `<span class="badge">${esc(t.en_pause)}</span>` : ""}</div>
            <div class="titre">${esc(rp.title)}</div></div><div class="actions">${boutons}</div></div>`;
      }).join("");
    }
    return html;
  }

  _bouton(cle, rec, uuid, fin) {
    const t = this._t();
    const maintenant = Date.now() / 1000;
    if (fin && fin <= maintenant) return "";
    if (this._attente.has(cle)) return `<span class="rec attente" title="…"><ha-circular-progress indeterminate size="small"></ha-circular-progress></span>`;
    if (!uuid) return `<button class="rec indispo" disabled title="${esc(t.introuvable)}"><ha-icon icon="mdi:record-circle-outline"></ha-icon></button>`;
    if (rec && rec.state === "disabled") {
      return `<button class="rec" data-action="deplier" data-cle="${esc(cle)}" title="${esc(t.en_pause)}"><ha-icon icon="mdi:pause-circle-outline"></ha-icon></button>`;
    }
    if (rec) {
      const enCours = ["starting", "running"].includes(rec.state);
      if (this._confirmer === cle) {
        return `<button class="rec confirmer" data-action="annuler" data-cle="${esc(cle)}" data-id="${esc(rec.id)}">${esc(t.confirmer)}</button>`;
      }
      return `<button class="rec actif ${enCours ? "pulse" : ""}" data-action="demander" data-cle="${esc(cle)}" title="${esc(enCours ? t.en_cours : t.programme)}"><ha-icon icon="mdi:record-circle"></ha-icon></button>`;
    }
    return `<button class="rec" data-action="enregistrer" data-cle="${esc(cle)}" title="${esc(t.enregistrer)}"><ha-icon icon="mdi:record-circle-outline"></ha-icon></button>`;
  }

  _ligneProgramme(entite, creneau, p, uuid, records, principal) {
    const t = this._t();
    const cle = `${entite}|${creneau}`;
    if (!p || !p.title) {
      return `<div class="prog vide"><span class="cren">${esc(t.creneaux[creneau])}</span><span class="titre muted">${esc(t.pas_de_programme)}</span></div>`;
    }
    const debut = ts(p.start), fin = ts(p.stop || p.end);
    const rec = enregistrementPour(records, uuid, debut, fin);
    const maintenant = Date.now() / 1000;
    let progression = "";
    if (debut && fin && debut <= maintenant && maintenant < fin) {
      const pct = Math.round(((maintenant - debut) / (fin - debut)) * 100);
      progression = `<div class="barre"><div style="width:${pct}%"></div></div><span class="reste">${esc(t.reste.replace("{n}", Math.ceil((fin - maintenant) / 60)))}</span>`;
    }
    const ouvert = this._ouvert.has(cle);
    const sous = [p.subtitle, p.category].filter(Boolean).map(esc).join(" · ");
    let detail = "";
    if (ouvert) {
      const affiche = this._config.afficher_affiches ? urlSure(p.poster) : "";
      detail = `<div class="detail">${affiche ? `<img class="affiche" src="${esc(affiche)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
        <div class="texte">${p.description ? `<p>${esc(p.description)}</p>` : ""}${p.rating ? `<span class="badge">${esc(p.rating)}</span>` : ""}${p.tmdb_rating ? `<span class="badge">★ ${esc(Number(p.tmdb_rating).toFixed(1))}</span>` : ""}
        <div class="fbx-pvr-row" data-panneau="${esc(cle)}"></div></div></div>`;
      this._panneaux.push({ cle, chaine: this._hass.states[entite].attributes.channel_name, prog: p });
    }
    return `<div class="prog ${principal ? "principal" : "second"} ${rec ? "programme" : ""}">
      <div class="info" data-action="deplier" data-cle="${esc(cle)}">
        <div class="ligne1"><span class="cren">${esc(t.creneaux[creneau])}</span><span class="heure">${debut ? esc(this._heure(debut)) : ""}${fin ? ` – ${esc(this._heure(fin))}` : ""}</span>${rec?.conflict ? `<span class="badge rouge">${esc(t.conflit)}</span>` : ""}</div>
        <div class="titre">${esc(p.title)}</div>
        ${sous ? `<div class="sous">${sous}</div>` : ""}
        ${progression}
      </div>
      <div class="action" data-entite="${esc(entite)}" data-creneau="${esc(creneau)}" data-titre="${esc(p.title)}">${this._bouton(cle, rec, uuid, fin)}</div>
      ${detail}
    </div>`;
  }

  _logo(attr) {
    const nom = attr.channel_name || "?";
    const url = urlSure(attr.channel_icon || attr.entity_picture);
    const initiales = esc(nom.replace(/[^A-Za-z0-9+]/g, "").slice(0, 3).toUpperCase());
    return `<div class="logo">${url ? `<img src="${esc(url)}" alt="${esc(nom)}" loading="lazy" referrerpolicy="no-referrer" data-initiales="${initiales}">` : `<span>${initiales}</span>`}</div>`;
  }

  _rendu() {
    if (!this._hass || !this._config) return;
    const t = this._t();
    const pvrId = capteurPvr(this._hass, this._config);
    const pvr = pvrId ? this._hass.states[pvrId] : null;
    const records = pvr?.attributes?.records || [];
    const mapping = pvr?.attributes?.guide_channels || {};
    const chaines = this._chaines();
    this._panneaux = [];

    let corps = "";
    if (!pvr) corps = `<div class="msg">${esc(t.aucune_pvr)}</div>`;
    else if (this._onglet === "enregistrements") {
      corps = this._ongletEnregistrements(pvr);
    } else if (!chaines.length) corps = `<div class="msg">${esc(t.aucun_guide)}</div>`;
    else {
      const [c1, c2] = ONGLETS[this._onglet] || ONGLETS.soir;
      corps = chaines.map((e) => {
        const a = this._hass.states[e].attributes;
        const uuid = mapping[a.channel_name] ?? null;
        return `<div class="chaine">${this._logo(a)}<div class="progs">
          ${this._ligneProgramme(e, c1, a[c1], uuid, records, true)}
          ${this._ligneProgramme(e, c2, a[c2], uuid, records, false)}
        </div></div>`;
      }).join("");
    }

    const nb = pvr ? Number(pvr.state) || 0 : 0;
    const onglets = ["maintenant", "soir", "enregistrements"].map((o) =>
      `<button class="onglet ${o === this._onglet ? "sel" : ""}" data-onglet="${o}">${esc(t.onglets[o])}${o === "enregistrements" && nb ? `<span class="nb">${nb}</span>` : ""}</button>`).join("");

    this.shadowRoot.innerHTML = `<style>${STYLE}${STYLE_SURCOUCHE}</style>
      <ha-card>
        <div class="entete"><div class="titre-carte"><ha-icon icon="mdi:television-classic"></ha-icon>${esc(this._config.title || t.titre)}</div></div>
        <div class="onglets">${onglets}</div>
        <div class="liste">${corps}</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll(".logo img").forEach((img) => img.addEventListener("error", () => {
      const s = document.createElement("span"); s.textContent = img.dataset.initiales || "?"; img.replaceWith(s);
    }, { once: true }));
    this.shadowRoot.querySelectorAll("[data-onglet]").forEach((b) => b.addEventListener("click", () => {
      this._onglet = b.dataset.onglet; this._confirmer = null; this._signature = ""; this._rendu();
    }));
    this.shadowRoot.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const action = el.dataset.action, cle = el.dataset.cle;
      const conteneur = el.closest(".action");
      if (action === "deplier") {
        this._ouvert.has(cle) ? this._ouvert.delete(cle) : this._ouvert.add(cle);
        this._signature = ""; this._rendu();
      } else if (action === "enregistrer") {
        this._enregistrer(conteneur.dataset.entite, conteneur.dataset.creneau, conteneur.dataset.titre, cle);
      } else if (action === "demander") {
        this._confirmer = cle; this._signature = ""; this._rendu();
        clearTimeout(this._minuteur);
        this._minuteur = setTimeout(() => { if (this._confirmer === cle) { this._confirmer = null; this._signature = ""; this._rendu(); } }, 4000);
      } else if (action === "annuler") {
        this._annuler(Number(el.dataset.id), conteneur.dataset.titre, cle);
      } else if (action === "arreter") {
        this._arreter(el.dataset.id, conteneur.dataset.titre, cle);
      } else if (action === "svc") {
        this._service(el.dataset.svc, el.dataset.champ, el.dataset.id, el.dataset.titre, cle);
      } else if (action === "tout") {
        this._tousFinis = true; this._signature = ""; this._rendu();
      }
    }));
    this.shadowRoot.querySelectorAll("[data-sous]").forEach((b) => b.addEventListener("click", () => {
      this._sous = b.dataset.sous; this._confirmer = null; this._signature = ""; this._rendu();
    }));

    // Panneaux d'enregistrement des programmes dépliés (heure de fin, chaque semaine)
    for (const { cle, chaine, prog } of this._panneaux) {
      const zone = this.shadowRoot.querySelector(`[data-panneau="${CSS.escape(cle)}"]`);
      if (!zone) continue;
      const st = this._etats[cle] || (this._etats[cle] = {});
      const redessiner = () => { if (zone.isConnected) panneauEnregistrement(zone, this._hass, chaine, prog, st, redessiner); else { this._signature = ""; this._rendu(); } };
      panneauEnregistrement(zone, this._hass, chaine, prog, st, redessiner);
    }
  }
}

const STYLE = `
  ha-card { overflow: hidden; }
  .entete { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 4px; }
  .titre-carte { display: flex; align-items: center; gap: 8px; font-size: 1.15em; font-weight: 500; }
  .titre-carte ha-icon { color: var(--primary-color); }
  .onglets { display: flex; gap: 6px; padding: 6px 16px 10px; flex-wrap: wrap; }
  .onglet { border: 1px solid var(--divider-color); background: none; color: var(--primary-text-color); border-radius: 16px;
    padding: 4px 12px; font: inherit; font-size: .9em; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .onglet.sel { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
  .nb { background: #e53935; color: #fff; border-radius: 10px; font-size: .75em; padding: 0 6px; line-height: 16px; }
  .liste { padding: 0 8px 8px; }
  .chaine { display: flex; gap: 10px; padding: 8px; border-top: 1px solid var(--divider-color); }
  .chaine:first-child { border-top: none; }
  .logo { flex: 0 0 44px; height: 44px; border-radius: 8px; background: var(--secondary-background-color);
    display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .logo img { width: 40px; height: 40px; object-fit: contain; }
  .logo span { font-size: .75em; font-weight: 600; color: var(--secondary-text-color); }
  .progs { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .prog { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 8px; border-radius: 8px; padding: 2px 4px; }
  .prog.programme { background: rgba(229, 57, 53, .08); }
  .prog .info { cursor: pointer; min-width: 0; }
  .prog .detail { grid-column: 1 / -1; display: flex; gap: 10px; font-size: .88em; color: var(--secondary-text-color); padding: 4px 0 6px; }
  .detail p { margin: 0 0 6px; }
  .affiche { width: 64px; border-radius: 6px; align-self: flex-start; }
  .ligne1 { display: flex; align-items: center; gap: 8px; font-size: .8em; color: var(--secondary-text-color); flex-wrap: wrap; }
  .cren { text-transform: uppercase; letter-spacing: .03em; font-weight: 600; }
  .titre { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prog.second .titre { font-weight: 400; font-size: .95em; }
  .muted { color: var(--secondary-text-color); font-style: italic; }
  .sous { font-size: .82em; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .barre { height: 3px; background: var(--divider-color); border-radius: 2px; margin-top: 4px; overflow: hidden; }
  .barre div { height: 100%; background: var(--primary-color); }
  .reste { font-size: .75em; color: var(--secondary-text-color); }
  .badge { font-size: .85em; border: 1px solid var(--divider-color); border-radius: 8px; padding: 0 6px; margin-right: 4px; }
  .badge.rouge { border-color: #e53935; color: #e53935; }
  .rec { width: 40px; height: 40px; border-radius: 50%; border: none; background: none; cursor: pointer; color: var(--secondary-text-color);
    display: inline-flex; align-items: center; justify-content: center; padding: 0; }
  .rec:hover { background: var(--secondary-background-color); }
  .rec.actif { color: #e53935; }
  .rec.indispo { opacity: .3; cursor: not-allowed; }
  .rec.confirmer { width: auto; border-radius: 16px; padding: 0 10px; background: #e53935; color: #fff; font: inherit; font-size: .85em; height: 32px; }
  .rec.pulse ha-icon { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; } }
  .enr { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; padding: 8px; border-top: 1px solid var(--divider-color); }
  .enr:first-child { border-top: none; }
  .msg { padding: 16px; color: var(--secondary-text-color); text-align: center; }
  .sous-onglets { display: flex; gap: 6px; padding: 2px 8px 6px; }
  .sous-onglet { border: none; background: var(--secondary-background-color); color: var(--primary-text-color); border-radius: 12px;
    padding: 3px 10px; font: inherit; font-size: .82em; cursor: pointer; }
  .sous-onglet.sel { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .sous-onglet small { opacity: .75; margin-left: 2px; }
  .enr .actions { display: flex; align-items: center; gap: 2px; }
  .enr.en-pause .info { opacity: .55; }
  .plus { display: block; margin: 8px auto; border: 1px solid var(--divider-color); background: none; color: var(--primary-color);
    border-radius: 16px; padding: 4px 14px; font: inherit; font-size: .85em; cursor: pointer; }
  .enr .ligne1 span:not(.cren):not(.badge) { white-space: nowrap; }
  .section { padding: 12px 8px 4px; font-size: .8em; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; color: var(--secondary-text-color); border-top: 1px solid var(--divider-color); }
  .detail .texte { flex: 1; min-width: 0; }
`;

class FreeboxPvrCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...config }; this._rendu(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; else this._rendu(); }

  _rendu() {
    if (!this._hass || !this._config) return;
    const t = TEXTES[langue(this._hass)];
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => t.ed[s.name] || s.name;
      this._form.addEventListener("value-changed", (ev) => {
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = [
      { name: "title", selector: { text: {} } },
      { name: "chaines", selector: { entity: { multiple: true, filter: { integration: GUIDE, domain: "sensor" } } } },
      { name: "onglet", selector: { select: { mode: "dropdown", options: Object.entries(t.onglets).map(([value, label]) => ({ value, label })) } } },
      { name: "afficher_affiches", selector: { boolean: {} } },
      { name: "pvr_entity", selector: { entity: { filter: { integration: "freebox_pvr", domain: "sensor" } } } },
    ];
    this._form.data = { onglet: "soir", afficher_affiches: true, ...this._config };
  }
}

if (!customElements.get("freebox-pvr-card")) customElements.define("freebox-pvr-card", FreeboxPvrCard);
if (!customElements.get("freebox-pvr-card-editor")) customElements.define("freebox-pvr-card-editor", FreeboxPvrCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "freebox-pvr-card")) {
  window.customCards.push({
    type: "freebox-pvr-card",
    name: "Freebox PVR",
    description: "Programme TV (Programme TNT FR) avec enregistrement sur la Freebox · TV guide with Freebox recording",
    preview: true,
    documentationURL: "https://github.com/akoonet-homeassistant/freebox_pvr",
  });
}
/* ------------------------------------------------------------------------------------------
   Surcouche de la carte « Programme TNT FR » (cyclope205/programme-tnt-fr) :
   ajoute « Enregistrer sur la Freebox » dans la fiche de chaque programme (carrousels,
   Guide TV, Top films). On enveloppe sa méthode _openModal(channelLabel, prog) sans
   modifier son code ; si une future version de la carte change cette méthode, la
   surcouche se désactive d'elle-même et la carte fonctionne comme avant.
   ------------------------------------------------------------------------------------------ */

const SURCOUCHE = {
  fr: { enregistrer: "Enregistrer sur la Freebox", programme: "Enregistrement programmé", en_cours: "Enregistrement en cours",
    annuler: "Annuler l'enregistrement", confirmer: "Confirmer l'annulation", introuvable: "Chaîne introuvable sur la Freebox",
    envoi: "Envoi à la Freebox…", conflit: "Conflit avec un autre enregistrement", ok: "Enregistrement programmé.", deja: "Déjà programmé.", annule: "Enregistrement annulé.",
    fin: "Fin", lendemain: "le lendemain", chaque: "Chaque semaine", le: "le {j} à {h}", repete: "Chaque semaine, le {j} à {h}",
    arreter: "Arrêter la répétition", confirmer_arret: "Confirmer l'arrêt", arretee: "Répétition arrêtée.", ajouter_rep: "Répéter chaque semaine",
    ok_rep: "Enregistrement programmé, répété chaque semaine.", rep_ajoutee: "Répétition ajoutée.", fin_invalide: "Heure de fin invalide.",
    en_pause: "Enregistrement en pause", pause: "Mettre en pause", reprendre: "Reprendre", stop: "Arrêter l'enregistrement", confirmer_stop: "Confirmer l'arrêt",
    pause_ok: "Enregistrement mis en pause.", reprise_ok: "Enregistrement repris.", stop_ok: "Enregistrement arrêté (la partie enregistrée est gardée).",
    marges: "Marges", avant: "avant", apres: "après", min: "min", resume: "Enregistrement de {d} à {f}", marge_invalide: "Marges : 0 à 60 min avant, 0 à 120 min après." },
  en: { enregistrer: "Record on the Freebox", programme: "Recording scheduled", en_cours: "Recording in progress",
    annuler: "Cancel the recording", confirmer: "Confirm cancellation", introuvable: "Channel not found on the Freebox",
    envoi: "Sending to the Freebox…", conflit: "Conflicts with another recording", ok: "Recording scheduled.", deja: "Already scheduled.", annule: "Recording cancelled.",
    fin: "End", lendemain: "next day", chaque: "Every week", le: "on {j} at {h}", repete: "Every week, on {j} at {h}",
    arreter: "Stop repeating", confirmer_arret: "Confirm stop", arretee: "Repeat stopped.", ajouter_rep: "Repeat every week",
    ok_rep: "Recording scheduled, repeated every week.", rep_ajoutee: "Repeat added.", fin_invalide: "Invalid end time.",
    en_pause: "Recording paused", pause: "Pause", reprendre: "Resume", stop: "Stop the recording", confirmer_stop: "Confirm stop",
    pause_ok: "Recording paused.", reprise_ok: "Recording resumed.", stop_ok: "Recording stopped (what was recorded is kept).",
    marges: "Margins", avant: "before", apres: "after", min: "min", resume: "Recording from {d} to {f}", marge_invalide: "Margins: 0 to 60 min before, 0 to 120 min after." },
};

const normaliser = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\+/g, "plus").replace(/[^a-z0-9]/g, "");
const hhmm = (sec) => { const d = new Date(sec * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const jourSemaine = (sec, hass) => new Date(sec * 1000).toLocaleDateString(langue(hass) === "fr" ? "fr-FR" : "en-GB", { weekday: "long" });

/** Fin choisie (HH:MM) → timestamp : le jour du début, ou le lendemain si elle n'est pas après le début. */
function finDepuisHeure(debut, valeur) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valeur || "");
  if (!m) return null;
  const d = new Date(debut * 1000);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() / 1000 <= debut) d.setDate(d.getDate() + 1);
  return Math.floor(d.getTime() / 1000);
}

function etatPourProgramme(hass, chaine, prog) {
  const pvrId = capteurPvr(hass, {});
  if (!pvrId) return null;
  const attr = hass.states[pvrId].attributes;
  const records = attr.records || [];
  const mapping = attr.guide_channels || {};
  const debut = ts(prog.start), fin = ts(prog.stop || prog.end);
  let uuid = mapping[chaine];
  let rec = null;
  if (uuid) rec = enregistrementPour(records, uuid, debut, fin);
  else {
    // Chaîne absente de la correspondance : on compare les noms (la recherche réelle se fait côté serveur)
    const n = normaliser(chaine);
    const r = records.find((x) => normaliser(x.channel_name) === n);
    if (r) { uuid = r.channel_uuid; rec = enregistrementPour(records, uuid, debut, fin); }
  }
  const repet = rec?.repeat_id ? (attr.repeats || []).find((x) => x.id === rec.repeat_id) : null;
  const marges = attr.margins || { before: 5, after: 10 };
  return { uuid, rec, repet, marges, introuvable: uuid === null && chaine in mapping, debut, fin };
}

/** Panneau d'enregistrement (fiche Programme TNT FR et détail de la carte Freebox PVR).
    st : état local conservé entre deux rendus ; redessiner : callback de rendu. */
function panneauEnregistrement(conteneur, hass, chaine, prog, st, redessiner) {
  const t = SURCOUCHE[langue(hass)];
  const e = etatPourProgramme(hass, chaine, prog);
  if (!e || !prog.title || !e.debut || (e.fin && e.fin <= Date.now() / 1000)) { conteneur.hidden = true; return; }
  conteneur.hidden = false;
  const bouton = (cls, txt, action) => `<button type="button" class="fbx-pvr-btn ${cls}" data-fbx="${action}">${txt}</button>`;
  const quand = (sec) => t.le.replace("{j}", jourSemaine(sec, hass)).replace("{h}", hhmm(sec));
  let html;
  if (st.envoi) html = `<span class="fbx-pvr-info">${esc(t.envoi)}</span>`;
  else if (e.introuvable) html = `<span class="fbx-pvr-info">${esc(t.introuvable)}</span>`;
  else if (e.rec) {
    const enCours = ["starting", "running"].includes(e.rec.state);
    const enPause = e.rec.state === "disabled";
    const finRec = e.rec.end_ts ?? ts(e.rec.end);
    html = `<div class="fbx-pvr-ligne"><span class="fbx-pvr-etat ${enPause ? "pause" : ""}"><span class="fbx-pvr-point ${enPause ? "" : "rouge"}"></span>${esc(enCours ? t.en_cours : enPause ? t.en_pause : t.programme)}</span>` +
      `<span class="fbx-pvr-info">${esc(hhmm(e.rec.start_ts ?? ts(e.rec.start)))} → ${esc(hhmm(finRec))}</span>` +
      (e.rec.conflict ? `<span class="fbx-pvr-info alerte">${esc(t.conflit)}</span>` : "") + `</div>`;
    if (e.repet) {
      const debutRep = e.repet.next_start_ts || e.debut;
      html += `<div class="fbx-pvr-ligne"><span class="fbx-pvr-info">↻ ${esc(t.repete.replace("{j}", jourSemaine(debutRep, hass)).replace("{h}", e.repet.time))}</span></div>`;
    }
    html += `<div class="fbx-pvr-ligne">` +
      (enCours
        ? (st.confirmer === "stop" ? bouton("fbx-danger", esc(t.confirmer_stop), "stop") : bouton("fbx-secondaire", `■ ${esc(t.stop)}`, "demander-stop"))
        : bouton("fbx-secondaire", enPause ? `► ${esc(t.reprendre)}` : `❙❙ ${esc(t.pause)}`, enPause ? "reprendre" : "pause") +
          (st.confirmer === "annuler" ? bouton("fbx-danger", esc(t.confirmer), "annuler") : bouton("fbx-secondaire", esc(t.annuler), "demander-annuler"))) +
      (e.repet
        ? (st.confirmer === "arreter" ? bouton("fbx-danger", esc(t.confirmer_arret), "arreter") : bouton("fbx-secondaire", `↻ ${esc(t.arreter)}`, "demander-arreter"))
        : bouton("fbx-secondaire", `↻ ${esc(t.ajouter_rep)}`, "repeter")) + `</div>`;
  } else {
    const finProg = e.fin || e.debut + 3600;
    if (st.fin === undefined) st.fin = hhmm(finProg);
    const finChoisie = finDepuisHeure(e.debut, st.fin);
    const lendemain = finChoisie && new Date(finChoisie * 1000).toDateString() !== new Date(e.debut * 1000).toDateString();
    if (st.margesActives === undefined) st.margesActives = (e.marges.before > 0 || e.marges.after > 0);
    // Marges des options ; si elles sont désactivées (0 et 0), on propose 5 et 10 min quand on coche « Marges »
    const sansMarge = !(e.marges.before > 0 || e.marges.after > 0);
    if (st.avant === undefined) st.avant = sansMarge ? 5 : e.marges.before;
    if (st.apres === undefined) st.apres = sansMarge ? 10 : e.marges.after;
    const mAvant = st.margesActives ? Number(st.avant) : 0, mApres = st.margesActives ? Number(st.apres) : 0;
    const resume = finChoisie
      ? t.resume.replace("{d}", hhmm(Math.max(e.debut - mAvant * 60, Math.floor(Date.now() / 1000)))).replace("{f}", hhmm(finChoisie + mApres * 60))
      : "";
    const dis = st.margesActives ? "" : "disabled";
    html = `<div class="fbx-pvr-ligne">` +
      `<label class="fbx-pvr-champ">${esc(t.fin)} <input type="time" class="fbx-pvr-fin" value="${esc(st.fin)}" step="60"></label>` +
      (lendemain ? `<span class="fbx-pvr-info">(${esc(t.lendemain)})</span>` : "") +
      `<label class="fbx-pvr-champ"><input type="checkbox" class="fbx-pvr-hebdo" ${st.hebdo ? "checked" : ""}> ${esc(t.chaque)} <span class="fbx-pvr-info">(${esc(quand(e.debut))})</span></label>` +
      `</div><div class="fbx-pvr-ligne">` +
      `<label class="fbx-pvr-champ"><input type="checkbox" class="fbx-pvr-marges" ${st.margesActives ? "checked" : ""}> ${esc(t.marges)}</label>` +
      `<label class="fbx-pvr-champ ${dis}">${esc(t.avant)} <input type="number" class="fbx-pvr-avant" min="0" max="60" step="1" value="${esc(st.avant)}" ${dis}> ${esc(t.min)}</label>` +
      `<label class="fbx-pvr-champ ${dis}">${esc(t.apres)} <input type="number" class="fbx-pvr-apres" min="0" max="120" step="1" value="${esc(st.apres)}" ${dis}> ${esc(t.min)}</label>` +
      `</div>` +
      (resume ? `<div class="fbx-pvr-ligne"><span class="fbx-pvr-info">${esc(resume)}${lendemain ? ` (${esc(t.lendemain)})` : ""}</span></div>` : "") +
      `<div class="fbx-pvr-ligne">${bouton("fbx-rouge", `<span class="fbx-pvr-point"></span>${esc(t.enregistrer)}`, "enregistrer")}</div>`;
  }
  if (st.message) html += `<div class="fbx-pvr-ligne"><span class="fbx-pvr-info">${esc(st.message)}</span></div>`;
  conteneur.innerHTML = html;

  const champFin = conteneur.querySelector(".fbx-pvr-fin");
  if (champFin) champFin.addEventListener("change", (ev) => { ev.stopPropagation(); st.fin = champFin.value; st.message = ""; redessiner(); });
  conteneur.querySelectorAll("input, label").forEach((el) => el.addEventListener("click", (ev) => ev.stopPropagation()));
  const hebdo = conteneur.querySelector(".fbx-pvr-hebdo");
  if (hebdo) hebdo.addEventListener("change", () => { st.hebdo = hebdo.checked; });
  const marges = conteneur.querySelector(".fbx-pvr-marges");
  if (marges) marges.addEventListener("change", () => { st.margesActives = marges.checked; st.message = ""; redessiner(); });
  for (const [cls, cle] of [[".fbx-pvr-avant", "avant"], [".fbx-pvr-apres", "apres"]]) {
    const champ = conteneur.querySelector(cls);
    if (champ) champ.addEventListener("change", () => { st[cle] = champ.value; st.message = ""; redessiner(); });
  }

  conteneur.querySelectorAll("[data-fbx]").forEach((b) => b.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const action = b.dataset.fbx;
    if (action.startsWith("demander-")) {
      st.confirmer = action.slice(9); st.message = ""; redessiner();
      clearTimeout(st.minuteur);
      st.minuteur = setTimeout(() => { st.confirmer = null; redessiner(); }, 4000);
      return;
    }
    if (action === "enregistrer" && !finDepuisHeure(e.debut, st.fin)) { st.message = t.fin_invalide; redessiner(); return; }
    const entier = (v, max) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= max ? n : null; };
    if (action === "enregistrer" && st.margesActives && (entier(st.avant, 60) === null || entier(st.apres, 120) === null)) {
      st.message = t.marge_invalide; redessiner(); return;
    }
    st.envoi = true; st.confirmer = null; st.message = ""; redessiner();
    try {
      if (action === "enregistrer" || action === "repeter") {
        const donnees = { channel_name: chaine, title: prog.title, start: prog.start, end: prog.stop || prog.end };
        if (prog.subtitle) donnees.subtitle = prog.subtitle;
        if (action === "enregistrer") {
          if (st.fin && st.fin !== hhmm(e.fin || 0)) donnees.end_time = st.fin;
          if (st.hebdo) donnees.repeat_weekly = true;
          donnees.margin_before = st.margesActives ? Number(st.avant) : 0;
          donnees.margin_after = st.margesActives ? Number(st.apres) : 0;
        } else donnees.repeat_weekly = true;
        const rep = await hass.callService("freebox_pvr", "record", donnees, undefined, false, true);
        const r = rep?.response || {};
        st.message = action === "repeter" ? t.rep_ajoutee : r.already_programmed ? t.deja : (st.hebdo ? t.ok_rep : t.ok);
        st.fin = undefined; st.hebdo = false; st.margesActives = undefined; st.avant = undefined; st.apres = undefined;
      } else if ((action === "pause" || action === "reprendre" || action === "stop") && e.rec) {
        const svc = { pause: "pause_record", reprendre: "resume_record", stop: "stop_record" }[action];
        await hass.callService("freebox_pvr", svc, { record_id: e.rec.id }, undefined, false, true);
        st.message = { pause: t.pause_ok, reprendre: t.reprise_ok, stop: t.stop_ok }[action];
      } else if (action === "annuler" && e.rec) {
        await hass.callService("freebox_pvr", "cancel", { record_id: e.rec.id }, undefined, false, true);
        st.message = t.annule;
      } else if (action === "arreter" && e.repet) {
        await hass.callService("freebox_pvr", "stop_repeat",
          { repeat_id: e.repet.id, cancel_scheduled: true, keep_record_id: e.rec.id }, undefined, false, true);
        st.message = t.arretee;
      }
    } catch (err) {
      st.message = `Freebox PVR : ${err?.message || err}`;
    } finally {
      st.envoi = false; redessiner();
      // le capteur se met à jour juste après l'appel : on relit son état
      setTimeout(redessiner, 1500); setTimeout(redessiner, 4000);
    }
  }));
}

function dessinerLigne(carte, ligne, chaine, prog) {
  const hass = carte._hass || carte.hass;
  if (!hass) { ligne.hidden = true; return; }
  const st = ligne.__fbx || (ligne.__fbx = {});
  const redessiner = () => { if (ligne.isConnected && carte.__fbxProg === prog) dessinerLigne(carte, ligne, chaine, prog); };
  panneauEnregistrement(ligne, carte._hass || carte.hass, chaine, prog, st, redessiner);
}

const STYLE_SURCOUCHE = `
  .fbx-pvr-row { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--divider-color, #444); }
  .fbx-pvr-row[hidden] { display: none; }
  .fbx-pvr-ligne { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
  .fbx-pvr-champ { display: inline-flex; align-items: center; gap: 6px; font-size: .85em; cursor: pointer; }
  .fbx-pvr-champ input[type=time] { font: inherit; padding: 3px 6px; border-radius: 8px; border: 1px solid var(--divider-color, #555);
    background: var(--card-background-color, #fff); color: var(--primary-text-color); color-scheme: light dark; }
  .fbx-pvr-champ input[type=number] { font: inherit; width: 3.6em; padding: 3px 6px; border-radius: 8px; border: 1px solid var(--divider-color, #555);
    background: var(--card-background-color, #fff); color: var(--primary-text-color); }
  .fbx-pvr-champ.disabled { opacity: .45; cursor: default; }
  .fbx-pvr-champ input[type=checkbox] { accent-color: #e53935; width: 16px; height: 16px; margin: 0; }
  .fbx-pvr-btn { border: none; font: inherit; font-size: .8em; font-weight: 600; padding: 6px 12px; border-radius: 999px; cursor: pointer; }
  .fbx-pvr-btn:active { transform: scale(.95); }
  .fbx-pvr-btn.fbx-rouge { background: #e53935; color: #fff; }
  .fbx-pvr-btn.fbx-secondaire { background: transparent; color: var(--primary-text-color); border: 1px solid var(--divider-color, #555); }
  .fbx-pvr-btn.fbx-danger { background: #b71c1c; color: #fff; }
  .fbx-pvr-etat { color: #e53935; font-weight: 600; font-size: .85em; display: inline-flex; align-items: center; gap: 6px; }
  .fbx-pvr-btn { display: inline-flex; align-items: center; gap: 6px; }
  .fbx-pvr-point { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #fff; flex: none; }
  .fbx-pvr-point.rouge { background: #e53935; }
  .fbx-pvr-etat.pause { color: var(--secondary-text-color); }
  .fbx-pvr-etat.pause .fbx-pvr-point { background: var(--secondary-text-color); }
  .fbx-pvr-info { font-size: .8em; opacity: .85; }
  .fbx-pvr-info.alerte { color: #e53935; opacity: 1; }
`;

function installerSurcouche() {
  customElements.whenDefined("programme-tnt-fr-card").then(() => {
    const Carte = customElements.get("programme-tnt-fr-card");
    const proto = Carte && Carte.prototype;
    if (!proto || proto.__freeboxPvr) return;
    if (typeof proto._openModal !== "function") {
      console.warn("Freebox PVR : la carte Programme TNT FR a changé, surcouche d'enregistrement désactivée.");
      return;
    }
    const original = proto._openModal;
    proto._openModal = function (channelLabel, prog) {
      const resultat = original.apply(this, arguments);
      try {
        const modal = this._els?.overlay?.querySelector(".modal") || this.querySelector?.(".overlay .modal");
        if (!modal) return resultat;
        if (!this.querySelector("style[data-fbx-pvr]")) {
          const s = document.createElement("style"); s.dataset.fbxPvr = ""; s.textContent = STYLE_SURCOUCHE; this.appendChild(s);
        }
        let ligne = modal.querySelector(".fbx-pvr-row");
        if (!ligne) { ligne = document.createElement("div"); ligne.className = "fbx-pvr-row"; modal.appendChild(ligne); }
        ligne.__fbx = {};
        this.__fbxProg = prog || {};
        dessinerLigne(this, ligne, channelLabel, prog || {});
      } catch (err) {
        console.warn("Freebox PVR : surcouche", err);
      }
      return resultat;
    };
    proto.__freeboxPvr = true;
  });
}
installerSurcouche();

console.info(`%c FREEBOX-PVR-CARD %c ${VERSION_CARTE} `, "background:#2B3A5C;color:#fff;border-radius:3px 0 0 3px", "background:#E53935;color:#fff;border-radius:0 3px 3px 0");
