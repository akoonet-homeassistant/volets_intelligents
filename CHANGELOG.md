# Changelog

## 2026.10.17

- L'intégration est maintenant dans le catalogue par défaut de HACS : elle s'installe en la recherchant simplement dans HACS (« Volets Intelligents »), sans ajouter de dépôt personnalisé.
- README (FR et EN) : la section Installation commence par la recherche dans HACS ; l'ajout comme dépôt personnalisé reste indiqué en solution de secours.
- README (FR et EN) : bouton « Open your Home Assistant instance » qui ouvre directement l'intégration dans HACS (My Home Assistant).
- README (FR et EN) : badges release, licence et HACS Default sous le titre.
- Aucun changement de fonctionnement.

## 2026.10.16

- Carte Lovelace : chaque volet a trois boutons **S / O / F** (S = protection solaire, O = ouverture du matin horaire, F = fermeture du soir horaire) qui activent ou coupent ces fonctions indépendamment, à côté du bouton Pause.
- Carte : le mode (Auto / Manuel / Arrêt) et le scénario (Hiver / Été) sont maintenant deux listes déroulantes côte à côte.
- Carte, nouvelles options : `show_solar`, `show_open`, `show_close` (afficher ou masquer S, O, F), `order` (ordre des volets) et `scenarios`.
- Carte : éditeur visuel (légendes S/O/F explicites, ordre des volets avec boutons ▲▼, cases des scénarios).
- Panneau, onglet « Tableau de bord » : le bouton « Auto » de chaque volet est remplacé par les trois boutons S / O / F (avec légende), et le mode global et le scénario deviennent deux listes déroulantes.
- API WebSocket : la commande `set_enabled` accepte un paramètre optionnel `field` (`enabled`, `schedule_open_enabled`, `schedule_close_enabled`).
- README : section carte mise à jour, captures régénérées.

## 2026.10.15

- Protection solaire, ouverture horaire et fermeture horaire sont maintenant trois réglages autonomes par volet. L'interrupteur `switch.volets_<nom>_auto` ne commande plus que la protection solaire : un volet dont la protection solaire est coupée s'ouvre et se ferme quand même aux horaires si ses cases « Ouverture du matin horaire » et « Fermeture du soir horaire » sont cochées (avant, il ignorait aussi les horaires).
- Le statut `disabled` (« Désactivé ») signifie désormais « protection solaire coupée pour ce volet ».
- Panneau : la case « Volet géré (activé) » devient « Protection solaire (gestion automatique du volet) ».
- Le scénario « Désactivé » et le mode global manuel ou arrêté coupent toujours les horaires de tous les volets.

## 2026.10.14

- Fiche d'un volet, section « Horaires d'ouverture et de fermeture » : le choix « Fermeture du soir si une fenêtre est ouverte » et le bouton à presser (ou la position en %) sont maintenant sur la même ligne. Le texte d'aide sur l'indépendance de l'ouverture et de la fermeture est placé en haut de la section.

## 2026.10.13

- Ouverture du matin et fermeture du soir horaires désactivables **séparément, volet par volet** : la case unique « Ouverture / fermeture horaires » de la fiche du volet devient « Ouverture du matin horaire » et « Fermeture du soir horaire ». Le choix « Fermeture du soir si une fenêtre est ouverte » n'apparaît que si la fermeture est cochée. Le réglage global (interrupteur `switch.volets_horaires`) reste unique.
- Entités : `switch.volets_<nom>_horaires` est remplacé par `switch.volets_<nom>_horaire_ouverture` et `switch.volets_<nom>_horaire_fermeture` (l'ancien est supprimé au démarrage : mettez à jour vos tableaux de bord et automatisations). Ajoutées à l'onglet Entités et au README.
- Migration : un volet qui avait ses horaires activés (ou désactivés) a les deux nouveaux interrupteurs activés (ou désactivés).
- Fermeture désactivée pour un volet : le gain solaire (hiver) ne reste plus bloqué après le soir pour ce volet.
- Menus du panneau réorganisés (voir 2026.10.12 ci-dessous, la 10.12 est remplacée par cette version si vous l'aviez installée).

## 2026.10.12

- Le scénario « Désactivé » coupe aussi les ouvertures et fermetures horaires.
- Le choix « Ne pas fermer » de la fermeture du soir bloque toujours quand une fenêtre est ouverte. La case « Ne pas fermer si une fenêtre est ouverte » de la section « Fenêtres et portes » ne règle plus que la protection solaire (son libellé le précise).
- Après la fermeture horaire du soir, un scénario de gain solaire (hiver) n'ouvre plus le volet jusqu'à l'ouverture du matin.
- Horaires : les blocages de l'ouverture par l'alarme, et par l'alarme avec une fenêtre ouverte, sont activables ou non (section « Blocages » de l'onglet Horaires). Ils ne dépendent plus des réglages du scénario actif.
- Nouveau choix par volet, section « Horaires d'ouverture et de fermeture » de l'onglet Volets : « Fermeture du soir si une fenêtre est ouverte ». Ne pas fermer (par défaut), fermer complètement, presser un bouton (position programmée) ou aller à une position en %. Avec le bouton ou la position, le volet se ferme complètement quand la fenêtre se referme (au plus tard jusqu'à l'ouverture du lendemain). Ne concerne que la fermeture automatique du soir.
- Cela remplace l'action « quand une fenêtre s'ouvre » de la 2026.10.11 : une fenêtre qui s'ouvre à un autre moment ne déclenche plus rien. L'ancienne valeur `none` devient `block`.
- Entités : `select.volets_<nom>_fenetre_ouverte` devient `select.volets_<nom>_horaire_fenetre` (valeurs `block`, `close`, `button`, `position`) ; nouveau `number.volets_<nom>_horaire_fenetre_position` ; suppression de `switch.volets_horaire_fenetre_bloque_fermeture`. Ajoutées à l'onglet Entités et au README.
- Panneau : menus réorganisés. Nouvel ordre des onglets : Tableau de bord, Volets, Façades, Protection solaire (ex-Scénarios, avec le scénario automatique et la plage active, qui quittent Réglages), Horaires (nouvel onglet : réglages communs d'ouverture et de fermeture et blocages alarme, auparavant dans Réglages), Réglages (maison, capteurs et alarme, évaluation, sauvegarde), Entités. Tout ce qui est propre à un volet reste dans sa fiche (onglet Volets).
- Panneau : le formulaire d'un volet est découpé en blocs bien visibles (Volet, Protection solaire et fermeture, Fenêtres et portes, Horaires d'ouverture et de fermeture, Vent). Un avertissement apparaît si l'heure d'ouverture n'est pas avant l'heure de fermeture. L'aide de « Autoriser à remonter un volet fermé à 100 % » précise que l'ouverture horaire du matin n'est pas concernée.

## 2026.10.10

- Nouvelle fonction : ouverture du matin et fermeture du soir de tous les volets, à heure fixe ou selon le lever et le coucher du soleil, avec un décalage de -60 à +60 minutes par pas de 5 (réglages dans l'onglet Réglages, section « Ouverture et fermeture horaires »). Désactivée par défaut ; désactivable globalement et volet par volet (case dans l'onglet Volets).
- L'ouverture amène le volet à sa position d'ouverture, la fermeture est complète. La fermeture reste bloquée par une fenêtre ouverte (option du volet) et l'ouverture par l'alarme (réglages du scénario actif). Un ordre bloqué est retenté pendant 3 heures. Chaque ordre n'est exécuté qu'une fois par jour, même après un redémarrage.
- Nouveau statut de volet `schedule` (« Horaire »).
- Nouvelles entités, ajoutées à l'onglet Entités et au README : `switch.volets_horaires`, `select.volets_horaire_ouverture_mode`, `select.volets_horaire_fermeture_mode`, `time.volets_horaire_ouverture_heure`, `time.volets_horaire_fermeture_heure`, `number.volets_horaire_ouverture_decalage_lever`, `number.volets_horaire_fermeture_decalage_coucher`, `sensor.volets_ouverture_prevue`, `sensor.volets_fermeture_prevue`, et `switch.volets_<nom>_horaires` pour chaque volet.

## 2026.10.9

- Entité « Volets scénario » : le sélecteur affiche maintenant le nom que vous avez saisi pour chaque scénario (« Absents » au lieu de « Vacances » après renommage), dans toutes les cartes Home Assistant (vue Volets, tuile, entités). Les options et l'état de l'entité sont ces noms. `select.select_option` accepte aussi les anciennes clés (`summer`, `winter`, `vacation`, `off`), mais une automatisation ou un template qui teste l'état `vacation` doit être mise à jour avec le nouveau nom. Deux scénarios de même nom sont distingués par leur clé entre parenthèses.

## 2026.10.8

- Panneau : un scénario renommé (champ « Libellé » de l'onglet Scénarios) garde son nouveau nom partout. Le titre de sa fiche dans l'onglet Scénarios, l'état des scénarios dans l'onglet Entités et la liste des valeurs possibles affichaient encore le nom d'origine (par exemple « Vacances » après renommage en « Absents »).

## 2026.10.7

- Carte Lovelace : l'intégration déclare maintenant la carte comme ressource Lovelace (mode stockage), en plus du chargement qu'elle faisait déjà. Corrige « Custom element doesn't exist: volets-intelligents-card » sur les installations où le script ajouté par l'intégration n'est pas chargé. La ressource est mise à jour à chaque nouvelle version, reprise si vous l'aviez ajoutée à la main (pas de doublon) et retirée quand l'intégration est supprimée. En mode YAML, rien n'est écrit : ajoutez la ressource vous-même (`/volets_intelligents_static/volets-card.js`, type module).

## 2026.10.6

- Carte Lovelace : les volets sont regroupés par façade. Chaque façade a un bandeau (nom, plage d'exposition du jour, mention « au soleil » et bordure orange quand elle est exposée), et ses volets sont en retrait sous un trait vertical. Les volets dont la façade est inconnue sont réunis sous « Autres volets ». Ce regroupement remplace la section « Soleil sur les façades » de la 2026.10.5.
- Carte Lovelace : case à cocher « Façades repliables » en bas de la carte. Cochée, un clic sur le bandeau d'une façade replie ou déplie ses volets (le bandeau replié indique le nombre de volets et « protégé » si l'un l'est) ; décochée, tout reste déplié. Le choix et l'état de chaque façade sont mémorisés dans le navigateur.
- Carte Lovelace : un clic (ou Entrée / Espace au clavier) sur le nom d'un volet ouvre la fenêtre de contrôle de son entité cover.
- Documentation : le README (FR et EN) décrit la carte et montre ses captures d'écran.
- Documentation : toutes les captures d'écran sont dans `docs/screenshots` (plus de sous-dossier `en`) ; les captures anglaises ont le suffixe `-en`.

## 2026.10.5

- Carte Lovelace : nouvelle section « Soleil sur les façades » avec la plage d'exposition du jour de chaque façade (par exemple « Ouest 14:35 – 20:25 »). La façade actuellement au soleil est signalée.
- Carte Lovelace, scénario Été : sous chaque volet protégé du soleil, l'heure de remontée au plus tard (fin de l'exposition de sa façade). Il peut remonter plus tôt si les températures redescendent sous les seuils de réouverture. Les heures sont celles de la maison.

## 2026.10.4

- Carte Lovelace : elle ne s'inscrit plus qu'une seule fois dans la liste des cartes quand son script est chargé deux fois (par l'intégration et par une ressource ajoutée à la main).
- Carte Lovelace : correction de deux mots « null » qui s'affichaient dans la carte (au-dessus et en dessous de la liste des volets).
- Manifest : `codeowners`, `documentation` et `issue_tracker` pointent vers le dépôt akoonet-homeassistant/volets_intelligents (`@akoonet-homeassistant`), utile pour la soumission au magasin HACS par défaut.

## 2026.10.3

- Panneau : nouvel ordre des onglets : Tableau de bord, Scénarios, Volets, Façades, Réglages, Entités (README FR et EN alignés).
- Panneau, fiche d'un volet : avec la méthode de fermeture « bouton », un message sous « Position de fermeture (protégé) » rappelle de régler la même position que celle atteinte par le bouton favori (le champ reste modifiable).
- Correction : avec la méthode de fermeture « bouton », la protection ne fonctionnait pas correctement. Le volet est maintenant reconnu comme protégé dès qu'il est nettement abaissé (sans comparer à la « position de fermeture »), ou, s'il ne rapporte aucune position, d'après l'ordre envoyé par l'intégration. Un mouvement tardif du volet dans les 10 minutes suivant l'appui n'est plus pris pour une action manuelle.

## 2026.10.2

- Nouvelle option d'intégration « Personnes désignées » : des comptes non administrateurs choisis ont accès à tous les onglets du panneau et peuvent tout modifier (contrôlé côté serveur) ; les autres comptes non admin ne voient que le Tableau de bord. Nouvelle commande WebSocket `get_access`.
- Scénario Hiver : nouvelle condition d'ouverture « pièce OU extérieur » (en plus de pièce ET extérieur, pièce seulement, extérieur seulement).
- Scénario Hiver : limite extérieure basse optionnelle (peut être négative) : quand l'extérieur est à cette température ou en dessous, le volet n'est plus ouvert.
- Correction : les textes de la fenêtre « Configurer » (traductions des options) étaient mal placés dans `strings.json` et les traductions.

## 2026.10.1

Les versions suivent désormais le schéma `année.mois.numéro dans le mois` (2026.10.1 = première version d'octobre 2026).

- Panneau : chaque mode global (Automatique, Manuel, Arrêt) et chaque scénario (Été, Hiver, Vacances, Désactivé) est décrit sous son sélecteur du tableau de bord et dans l'onglet « Entités » (liste des valeurs).
- Scénario Hiver : condition d'ouverture au choix (onglet Scénarios) : pièce ET extérieur (par défaut), pièce seulement ou extérieur seulement. En mode « pièce seulement », une température extérieure indisponible ne bloque plus l'ouverture.
- Scénario Été : la condition de réouverture accepte aussi « pièce seulement » et « extérieur seulement » (en plus de « pièce ET extérieur » et « pièce OU extérieur »).
- Alarme : nouvelle entité `alarm_control_panel` dans Réglages. Chaque scénario (Été, Hiver, Vacances) a deux options : « Ne pas ouvrir quand l'alarme est activée » et « Ne pas ouvrir quand l'alarme est activée ET qu'une fenêtre est ouverte ». Alarme activée = états `armed_*` ou `triggered` ; entité absente ou indisponible : rien n'est bloqué. La mise en sécurité contre le vent n'est jamais bloquée.
- README : une capture d'écran par onglet du panneau (données de démonstration) ; README en anglais (`README.en.md`).
- Cumul des évolutions 0.3.x : bouton « Auto » par volet, seuils des scénarios (été et hiver) en entités `number`, capteurs de façade persistants sur la journée.

## 0.3.10

- Nouvelles entités `number.volets_seuil_hiver_gain_exterieur` et `number.volets_seuil_hiver_gain_piece` (seuils du scénario « winter », gain solaire), modifiables depuis les dashboards, comme les seuils d'été.
- Onglet « Entités » du panneau et README : liste des seuils des scénarios (identifiants réels, avec copie).

## 0.3.9

- Capteurs `sensor.volets_facade_*_debut/fin` : les heures d'ensoleillement restent affichées toute la journée (plage en cours, sinon prochaine, sinon la dernière du jour), façade exposée ou non.

## 0.3.8

- Tableau de bord du panneau : bouton « Auto » par volet pour activer/désactiver la gestion (commande WebSocket `set_enabled`).
- 4 entités `number.volets_seuil_ete_*` (fermeture/réouverture extérieur et pièce du scénario « summer »), modifiables depuis les dashboards.
- Le lien de la fenêtre Configurer s'appelle désormais « Interface de gestion » (le bouton « Visiter » de la page de l'appareil
  a un libellé fixe de Home Assistant, non modifiable par l'intégration ; l'entrée du menu latéral reste « Volets »).

## 0.3.7

- `icon.png` servi à `/volets_intelligents_static/icon.png` : permet de forcer l'icône dans la liste des mises à jour de HACS
  (voir le README), en attendant que HACS lise les icônes embarquées.

- menu de configuration de l'intégration (Configurer) : case pour afficher ou masquer « Volets » dans le menu latéral,
  avec un lien direct vers le panneau ;
- bouton « Visiter » sur la page de l'appareil « Volets Intelligents » : ouvre le panneau, même masqué du menu latéral.

## 0.3.6

- icône et logo de l'intégration (dossier `brand/`, clair et sombre, normal et @2x) : Home Assistant 2026.3 et plus les
  affiche à la place de « icon not available » ; la liste des mises à jour de HACS ne les utilise pas encore
  (voir hacs/integration#5171).

## 0.3.5

- un volet fermé à 100 % (position 0 %, ou état « fermé » sans position) n'est plus jamais remonté par
  l'intégration, quelle que soit la façon dont il a été fermé (fin de plage, soleil parti, scénario Hiver,
  protection contre le vent) ;
- option par volet `allow_open_closed_in` (boutons Été, Hiver, Vacances dans l'onglet Volets) pour lever cette règle
  dans les scénarios choisis ;
- exception : un volet dont la protection est la fermeture totale et que l'intégration a fermé reste remontable ;
- un volet fermé à 100 % que l'intégration avait abaissé est « oublié » : elle ne s'en occupe plus.

## 0.3.4

Nouvelles entités :

- plage active : `binary_sensor.volets_plage_active`, `sensor.volets_plage_debut` et `sensor.volets_plage_fin` ;
- réglages de la plage active modifiables depuis un tableau de bord : `time.volets_reglage_plage_debut`,
  `time.volets_reglage_plage_fin`, `select.volets_reglage_plage_mode_fin` et
  `number.volets_reglage_plage_decalage_coucher` ;
- par façade : `binary_sensor.volets_facade_<nom>_exposee`, `sensor.volets_facade_<nom>_debut` et
  `sensor.volets_facade_<nom>_fin` (créées et supprimées avec les façades) ;
- l'onglet « Entités » du panneau les liste, avec leurs états et des exemples YAML à jour.

## 0.3.3

- nouvel onglet « Entités » dans le panneau : identifiants réels des entités (boutons « Copier »),
  valeurs possibles, attributs et exemples de cartes YAML remplis avec vos identifiants ;
- le capteur de statut de chaque volet expose l'attribut `window_state` (`open`, `closed`, `unknown`) ;
- nouvelle commande WebSocket `volets_intelligents/get_entities` (administrateur).

## 0.3.2

Publication de la 0.3.1 sous un nouveau numéro : le navigateur recharge le panneau et la carte
(l'adresse des fichiers contient le numéro de version), ce qui rend visibles le regroupement par
façade, les flèches pour déplacer les volets et l'état des fenêtres. Aucun changement de code.

## 0.3.1

Tableau de bord :

- les volets sont groupés par façade (sous-titre par façade), avec un choix « Liste unique » ;
- l'ordre des volets se change avec les flèches (ou par glisser-déposer sur ordinateur) et s'enregistre tout de suite ;
- chaque volet affiche l'état de ses fenêtres et portes (ouverte, fermée, capteur indisponible) ;
- onglet Volets : les capteurs d'ouverture à nom long ne sortent plus du cadre ;
- un workflow crée automatiquement une version GitHub à chaque tag `vX.Y.Z` : HACS affiche alors un vrai numéro de version au lieu d'un hash.

## 0.3.0

Corrections issues d'une relecture indépendante (chaque point a un test de non-régression) :

- un capteur de fenêtre ou de porte indisponible bloque désormais la fermeture ;
- un volet qui s'arrête à une position différente de celle demandée (position favorite) n'est plus
  refermé en boucle et est bien remonté ensuite ;
- les volets lents ne sont plus pris pour une action manuelle ;
- la protection vent passe avant le mode, le scénario, la pause et le délai de démarrage, avec un ordre
  de mise en sécurité par volet (`wind_action`) et des ordres simples ouvrir/fermer ;
- une plage active qui passe minuit fonctionne ; formats d'heure de fin élargis ;
- un capteur d'exposition indisponible ne fait plus remonter les volets (aucune action) ;
- sans mesure de température extérieure, aucune action (même avec la température ressentie) ;
- le scénario Hiver respecte l'anti-usure ;
- droits WebSocket alignés sur ceux de Home Assistant (contrôle des entités concernées) ;
- validation renforcée (saut de ligne final, limites de taille, cohérences entre champs) ;
- traductions des champs de services ; carte Lovelace qui ne se redessine plus inutilement.

## 0.2.1

Optimisations sans changement de comportement :

- exposition de chaque façade calculée une seule fois par évaluation (au lieu de deux) ;
- volets indexés par identifiant (plus de recherche linéaire ni de reconstruction d'ensembles à chaque événement) ;
- pas de réabonnement aux capteurs quand rien n'a changé (ex. simple bascule d'un volet) ;
- planification synchrone du regroupement d'événements (plus de tâche créée par événement) ;
- état mémorisé écrit sur le disque seulement s'il a changé.

## 0.2.0

- Quatre façades par défaut (nord, est, sud, ouest), modifiables : renommer, ajouter, supprimer ;
  n'importe quel volet peut être affecté à n'importe quelle façade.
- Orientation de la maison : toutes les façades tournent avec elle (azimut de la façade « Sud »).
- Exposition calculée selon la date, l'heure et la position GPS de Home Assistant (plus besoin
  de capteur), avec angle d'éclairage et masque d'horizon réglables par façade.
  Les capteurs d'exposition existants restent utilisables.
- Plages d'ensoleillement théoriques du jour pour chaque façade, affichées dans le panneau.
- Interface du panneau et de la carte en français et en anglais.
- Assistant « Premiers pas » et ajout groupé de volets.

## 0.1.0

Première version : moteur de règles (protection thermique, gain solaire hiver, mode vacances),
panneau de gestion, carte Lovelace, détection d'action manuelle, blocage fenêtre ouverte,
protection vent, délai de sécurité au démarrage.
