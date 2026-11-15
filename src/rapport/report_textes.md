<!--
  TEXTES DU RAPPORT HTML : modifiables sans toucher au code.

  Format : chaque texte commence par une ligne « ## nom_du_texte ».
  Syntaxe  : **gras**, *italique*, [lien](https://...), listes « - », paragraphes séparés par une ligne vide.
  Repères  : {{nom}} est remplacé par une valeur calculée (pilote, année, chiffres...).
             {{?nom}}...{{/nom}} n'est affiché que si la valeur existe (conditionnel).
             {{^nom}}...{{/nom}} est la forme « sinon » : affiché seulement si la valeur est vide ou fausse.
  Variantes : un texte peut exister en plusieurs versions « nom_1 », « nom_2 »… ; le code en choisit une de façon
             stable (selon le pilote et l'année), donc deux rapports ne se ressemblent pas mot pour mot.
  Ne pas renommer les « ## nom » : le code les utilise. Un texte supprimé est simplement ignoré.
-->

## titre
Ton année de vol {{year}}

## hero_baseline
Tes vols en chiffres, en graphiques et en records.

## hero_periode
Du {{premier_vol}} au {{dernier_vol}}

## apercu_intro
Les chiffres essentiels de l'année. Les **petites pastilles** comparent avec les années que tu
sélectionnes en haut de page{{?date_equivalente}}. {{year}} n'est pas terminée : elle est comparée aux années précédentes entières{{/date_equivalente}}.

Les pastilles **vertes ou rouges** indiquent plus ou moins de volume (vols, heures, jours de vol). Les pastilles
**bleues ou ambrées** indiquent simplement plus ou moins, sans jugement : un plafond plus haut ou un facteur g
plus faible n'est pas « mieux » en soi.

## phrase_avance_1
{{?en_cours}}Tu as déjà dépassé ton total de {{annee_ref}} : **{{ecart}} de plus**{{?vols_ecart}}, avec {{vols_ecart}}{{/vols_ecart}}.{{/en_cours}}{{^en_cours}}En {{year}}, tu as volé **{{ecart}} de plus** qu'en {{annee_ref}}{{?vols_ecart}}, avec {{vols_ecart}}{{/vols_ecart}}.{{/en_cours}}

## phrase_avance_2
{{?en_cours}}Belle forme : au {{date}}, tu as déjà volé **{{ecart}} de plus** que sur toute l'année {{annee_ref}}{{?vols_ecart}} ({{vols_ecart}}){{/vols_ecart}}.{{/en_cours}}{{^en_cours}}Belle année : **{{ecart}} de vol en plus** par rapport à {{annee_ref}}{{?vols_ecart}} ({{vols_ecart}}){{/vols_ecart}}.{{/en_cours}}

## phrase_avance_3
{{?en_cours}}Objectif atteint : tu as passé le total de {{annee_ref}} avec **{{ecart}} d'avance**{{?vols_ecart}}, et {{vols_ecart}}{{/vols_ecart}}.{{/en_cours}}{{^en_cours}}Tu as fait mieux que {{annee_ref}} : **{{ecart}} de plus** en {{year}}{{?vols_ecart}}, avec {{vols_ecart}}{{/vols_ecart}}.{{/en_cours}}

## phrase_retard_1
{{?en_cours}}Il te manque **{{ecart}}** pour atteindre ton total de {{annee_ref}}{{?reste}} ; {{reste}}{{/reste}} : le ciel t'attend.{{/en_cours}}{{^en_cours}}En {{year}}, tu as volé **{{ecart}} de moins** qu'en {{annee_ref}}. Une année plus calme, ça arrive : la prochaine saison est à écrire.{{/en_cours}}

## phrase_retard_2
{{?en_cours}}Pour égaler ton total de {{annee_ref}}, il te manque **{{ecart}}**{{?reste}} et {{reste}} : sans pression, chaque vol compte{{/reste}}.{{/en_cours}}{{^en_cours}}**{{ecart}} de vol en moins** qu'en {{annee_ref}} : l'année a été plus tranquille, et les belles journées restent à venir.{{/en_cours}}

## phrase_retard_3
{{?en_cours}}Au {{date}}, **{{ecart}}** te séparent encore du total de {{annee_ref}}{{?reste}} ; {{reste}} pour les rattraper{{/reste}}.{{/en_cours}}{{^en_cours}}En {{year}}, **{{ecart}} de moins** qu'en {{annee_ref}} : ce n'est pas une course, et chaque vol compte.{{/en_cours}}

## phrase_egal_1
{{?en_cours}}Au {{date}}, tu as déjà volé **autant que sur toute l'année {{annee_ref}}**, à une demi-heure près.{{/en_cours}}{{^en_cours}}En {{year}}, tu as volé **autant qu'en {{annee_ref}}**, à une demi-heure près.{{/en_cours}}

## phrase_egal_2
{{?en_cours}}Match nul avec le total de {{annee_ref}} : au {{date}}, c'est **l'égalité** (écart de moins de 30 min).{{/en_cours}}{{^en_cours}}**{{year}} égale {{annee_ref}}** : même temps de vol, à moins de 30 min près.{{/en_cours}}

## equiv_jours
Soit **{{valeur}} {{jours}}** dans les airs.

## equiv_distance
Soit **{{valeur}} fois** Paris–Marseille (660 km) en distance de vol.

## equiv_tour_eiffel
Ton plafond : **{{valeur}} fois** la tour Eiffel (330 m).

## equiv_mont_blanc
Ton plafond : à **{{ecart}}** du sommet du Mont-Blanc (4 806 m).

## equiv_mont_blanc_depasse
Ton plafond a dépassé le sommet du Mont-Blanc (4 806 m).

## equiv_rythme
Un vol **tous les {{jours}} jours** en moyenne.

## equiv_rythme_dense
En moyenne, **{{valeur}} vols par jour**.

## equiv_everest
Tu as gagné **{{valeur}} fois** l'Everest en altitude cumulée (gain mesuré par Syride).

## phrase_ecart_note
{{?en_cours}}Écart calculé avec le total de {{annee_ref}} entière, ta dernière année de vol avant celle-ci ; {{year}} n'est pas terminée.{{/en_cours}}{{^en_cours}}Écart calculé avec {{annee_ref}}, ta dernière année de vol avant celle-ci.{{/en_cours}}

## phrase_synthese
{{libelle_periode}}, tu as volé **{{duree}}** réparties sur **{{vols}}** et **{{sites}}**.

## phrase_mois_actif
Ton mois le plus actif est **{{mois}}** ({{vols_mois}}).

## phrase_record_plafond
Ton plus haut vol a atteint **{{plafond}}** le {{date_plafond}}, à {{site_plafond}}.

## portrait_titre
Ton portrait de pilote

<!-- Portraits (F1) : 1re ligne = étiquette, suite = justification courte. Repères selon le portrait :
     {{valeur}} (pourcentage, heure, durée ou altitude), {{site}}, {{sites}}, {{nouveaux}}, {{vols}},
     {{parapente}} / {{paramoteur}} (part du temps de vol). -->
## portrait_polyvalent
Polyvalent
Parapente {{parapente}}, paramoteur {{paramoteur}} de ton temps de vol.

## portrait_treuilleur
Treuilleur
{{valeur}} de tes vols au treuil.

## portrait_marcheur
Marcheur
{{valeur}} de tes vols en rando.

## portrait_plafond
Chasseur de plafond
Plafond max à {{valeur}}.

## portrait_explorateur
Explorateur
{{sites}} différents{{?nouveaux}}, dont {{nouveaux}} nouveaux{{/nouveaux}}.

## portrait_nomade
Nomade
{{sites}} différents pour {{vols}}.

## portrait_marathonien
Marathonien
La moitié de tes vols durent plus de {{valeur}}.

## portrait_regulier
Régulier
Au moins un vol dans {{valeur}} des semaines.

## portrait_leve_tot
Lève-tôt
Décollage médian à {{valeur}}.

## portrait_soir
Pilote du soir
Décollage médian à {{valeur}}.

## portrait_fidele
Fidèle
{{valeur}} de tes vols à {{site}}.

## portrait_week_end
Pilote du week-end
{{valeur}} de tes vols le samedi ou le dimanche.

## portrait_libre
Pilote libre
Ni horaire fixe ni site attitré : tu voles quand le ciel le permet.

## portrait_debut
Saison en douceur
{{vols}} cette année : chacun compte.

## histoire_intro
Les moments qui ont marqué ton année, dans l'ordre où ils sont arrivés. Les jalons **dorés** sont des records
ou des nouveautés.

## frise_intro
Premier vol, paliers, records, nouveaux sites : ton année en une douzaine de dates.

<!-- Jalons (F3) : titres. {{n}} = palier, {{records}} = « long », « long et le plus haut »…, {{site}}, {{voile}} -->
## jalon_first
Premier vol de l'année

## jalon_first_record
(et ton plus {{records}} !)

## jalon_first_new_site
sur un site tout nouveau pour toi

## jalon_nth_flight
{{n}}ᵉ vol de l'année

## jalon_nth_hour
{{n}}ᵉ heure de vol

## jalon_record
Ton vol le plus {{records}}

## jalon_record_perso
record personnel battu

## jalon_best_day
Ta meilleure journée

## jalon_new_site
Nouveau site : {{site}}

## jalon_new_wing
Première avec {{voile}}

## jalon_comeback
Le retour en l'air

## rythme_intro
Comment ton année se répartit dans le temps : la courbe montre l'accumulation de tes heures de vol,
le calendrier montre chaque journée.

## rythme_aide_cumul
**Lire la courbe.** Chaque marche correspond à un jour de vol : plus elle est haute, plus la journée
a été longue. Une courbe qui monte vite, c'est une période très active ; un palier, une pause.
Survole ou touche la courbe pour lire les valeurs de chaque année ; les losanges sont tes jalons : clique sur l'un d'eux pour ouvrir la journée.

## rythme_aide_calendrier
**Lire le calendrier.** Une case = un jour (une colonne = une semaine, du lundi en haut au dimanche en bas).
La couleur indique la discipline, l'intensité la durée de la journée de vol. Survole une journée de vol
pour voir sa durée, ses sites et ses voiles ; clique dessus (ou touche-la, ou appuie sur Entrée) pour ouvrir
la fiche du jour : chaque vol avec son heure, son site, sa voile, ses mesures et le lien vers Syride, et des
boutons pour passer au jour de vol précédent ou suivant. Au clavier, les flèches se déplacent d'un jour à
l'autre. Une case grise est un jour sans vol ; une case en pointillés n'est pas encore arrivée.

**Lire les tuiles.** « Plus longue série » : le plus grand nombre de jours de suite où tu as volé. « Plus longue
pause » : le plus grand nombre de jours sans voler entre deux vols de l'année (le temps écoulé depuis ton dernier
vol n'est pas compté). « Meilleure semaine » : la semaine, du lundi au dimanche, où tu as le plus volé. « Régularité » :
les semaines où tu as volé au moins une fois, sur les semaines écoulées de l'année. Avec JavaScript, clique sur une
tuile pour entourer ces jours dans le calendrier ; clique de nouveau ou appuie sur Échap pour les éteindre.

## rythme_calendrier_sous_titre
Clique sur une journée pour voir ses vols.

## duree_mediane_aide
La médiane est le vol du milieu : la moitié de tes vols dure moins de {{mediane}}, l'autre moitié plus. Un vol exceptionnel ne la fausse pas.

## rythme_regularite_note
Série de {{serie}} de suite · {{weekend}} de tes vols le week-end.

## phrase_saison
Ta saison : **{{saison}}**, avec {{duree_saison}}.

## phrase_pause
Ta plus longue pause entre deux jours de vol dure **{{jours_pause}}**.

## saisons_intro
Tes heures de vol et tes vols selon la saison (hiver : décembre à février ; printemps : mars à mai ; été : juin à août ; automne : septembre à novembre).

## quand_intro
À quels moments de la semaine et de la journée tu voles le plus.

## phrase_jour
Tu voles surtout le **{{jour}}** ({{vols_jour}}).

## phrase_heures
La moitié de tes décollages ont lieu entre **{{heure_debut}}** et **{{heure_fin}}**.

## phrase_journee_type
Un **{{jour}}**{{?heure}}, décollage vers **{{heure}}**{{/heure}}, à **{{site}}** avec **{{voile}}**.

## phrase_meilleure_journee
**{{vols}}** pour **{{duree}}** de vol{{?sites}}, à {{sites}}{{/sites}}.

## phrase_facons
**Un vol sur {{fraction}}** {{facon}} ({{pourcent}}).

## quand_aide
Chaque barre compte les **vols** ; la durée totale s'affiche au survol. Les heures sont celles du **décollage**.

## matrice_sous_titre
Une ligne par jour de la semaine, une colonne par heure de décollage : plus la case est foncée, plus tu as volé à ce moment-là. Les totaux sont en marge.

## quand_aide_matrice
Chaque case compte les **vols** décollés ce jour de la semaine, à cette heure, sur toute l'année ; le nombre est écrit dans la case, la teinte est seulement un repère. Les totaux par jour (à droite) et par heure (en bas) remplacent les deux histogrammes. Choisis une année de comparaison en haut de page pour les retrouver. Survole une case, ou rejoins-la au clavier, pour voir la durée et les sites.

## matrice_favori
Ton créneau favori : le **{{jour}}** entre **{{heure_debut}}** et **{{heure_fin}}** ({{vols}}).

## matrice_manquants
{{vols}} sans heure de décollage {{?pluriel}}ne sont pas placés{{/pluriel}}{{^pluriel}}n'est pas placé{{/pluriel}} dans la grille.

## matrice_vide
Aucune heure de décollage n'est connue pour ces vols : la grille ne peut pas être dessinée.

## ou_intro
Les lieux où tu as volé cette année. La taille des cercles suit le nombre de vols ou, au choix, les heures de vol.

## phrase_site
Ton site le plus fréquenté est **{{site}}** ({{vols_site}}, {{duree_site}}).

## phrase_nouveaux_sites
Tu as découvert {{nouveaux}} cette année.

## phrase_rayon
Ton site le plus éloigné de {{site_principal}} est **{{site_loin}}**, à **{{distance_loin}}** à vol d'oiseau.

## phrase_fidelite
**{{part_site}}** de tes vols ont eu lieu à {{site_principal}}.

## ou_aide_carte
**Lire la carte.** Quand tes sites forment plusieurs groupes éloignés, la carte s'ouvre sur une **vue d'ensemble** :
une bulle par zone (sites à moins de 80 km environ les uns des autres), nommée d'après son site le plus volé.
Choisis une zone (bouton ou bulle) pour la voir zoomée, un cercle par site. La surface d'un cercle suit le nombre
de vols ou les heures de vol (bouton « Vols / Heures ») ; un anneau or en tirets signale un site découvert cette année.
Les cercles sont placés à la position moyenne de tes traces GPX ou, à défaut, aux coordonnées du site, et
légèrement écartés s'ils se chevauchent ; l'échelle (en bas à gauche) donne les distances. Le fond géographique,
très simplifié, est intégré au rapport et fonctionne hors ligne. Un cercle ouvre la **fiche du site**.

## matos_intro
Ton matériel : les voiles que tu as utilisées et les instruments qui ont enregistré tes vols.

## ruban_sous_titre
Une ligne par voile, une colonne par mois : plus la case est foncée, plus tu as volé avec cette voile ce mois-là (le nombre est en heures). Survole une case pour le détail, clique pour ouvrir la journée.

<!-- Voile du moment (F14) : {{voile}}, {{vols}} (« 4 vols »), {{duree}} (« 3 h 05 min »), {{jours}} sont remplacés par report.js -->
## voile_du_moment
Ta voile du moment : **{{voile}}** — {{vols}}, {{duree}} sur les {{jours}} derniers jours.

<!-- Une seule voile dans la discipline affichée : pas de ruban. {{voile}} est remplacé par report.js -->
## ruban_une_voile
Tu n'as volé qu'avec une seule voile ici ({{voile}}) : il n'y a pas de ruban à dessiner.

## phrase_voile
Ta voile la plus utilisée est **{{voile}}** ({{vols_voile}}, {{duree_voile}}).

## records_intro
Tes meilleurs vols de l'année pour chaque critère. Chaque ligne renvoie vers la fiche du vol sur Syride.

<!-- Records battus (F10) : {{n}} = nombre, {{liste}} = « plafond et distance » -->
## records_battus
{{?pluriel}}Tu as battu **{{n}} records personnels** cette année : {{liste}}.{{/pluriel}}{{^pluriel}}Tu as battu **un record personnel** cette année : {{liste}}.{{/pluriel}}

## record_nouveau
Nouveau record !

## record_ecart
{{ecart}} par rapport à {{annee}}

## record_ton
Ton record : {{valeur}} en {{annee}}

## record_mesures
mesuré sur {{n}} de tes {{total}} vols

## scatter_sous_titre
Un point par vol : plus il est à droite, plus le vol a duré ; plus il est haut, plus le plafond est élevé (ou la distance parcourue, avec l'autre choix). Les vols les plus longs, hauts ou lointains sont entourés d'or. Survole un point pour le détail, clique pour ouvrir la journée.

## records_aide
Les valeurs viennent des fiches Syride. Un record n'est classé que si Syride a fourni la mesure pour ce vol.

## comparaison_intro
Tes chiffres de {{year}} face à ceux des années que tu as choisies en haut de page.

## comparaison_aucune
Choisis une ou deux années à comparer avec les boutons en haut de page.

## comparaison_date
{{year}} n'est pas terminée : elle est comparée aux années précédentes **entières**.

## carriere_intro
Depuis ton premier vol enregistré, le **{{premier_vol_carriere}}**, jusqu'à aujourd'hui : ce que tu as accumulé au fil des années.

## carriere_graphique
Heures de vol (ou nombre de vols) de chaque année, parapente et paramoteur empilés. L'étoile marque ta meilleure année.

## carriere_meilleure
Ta meilleure année reste **{{annee}}** avec {{valeur}}.

## carriere_record
**{{annee}}** est déjà ta meilleure année !

## carriere_record_fini
**{{annee}}** est ta meilleure année !

## vols_intro
La liste complète de tes vols de l'année. Clique sur un titre de colonne pour trier, ou tape un site, une voile ou une façon de voler pour filtrer.

<!-- Filtres croisés (T56). Repères remplacés par report.js : {filtre} (« voile »), {valeur}, {vols} (« 12 vols »), {total} -->
## xf_sr
Filtrer les vols

## xf_puce
Retirer le filtre {{filtre}} : {{valeur}}

## xf_voir
Voir les {{vols}} ↓

## xf_annonce
{{vols}} sur {{total}} avec tes filtres.

## xf_retires
Filtres retirés.

## xf_site
Filtrer les vols de ce site

## glossaire
- **Plafond** : altitude maximale atteinte pendant le vol, en mètres.
- **Gain** : gain d'altitude du vol, tel qu'indiqué par Syride.
- **Vario max** : vitesse ascensionnelle maximale, en mètres par seconde (m/s).
- **Facteur g** : accélération ressentie, en multiples du poids du corps ; 1 g correspond à l'immobilité.
- **Distance** : distance du vol telle qu'indiquée par Syride.
- **Vitesse moyenne / maximale** : vitesses sol du vol, en km/h.
- **Parapente / paramoteur** : un vol est classé « paramoteur » lorsque Syride l'indique comme vol moteur, « parapente » sinon.
- **Façon de voler** : site, treuil, rando (décollage à pied après une montée), bord de mer ou moteur, selon le type de vol indiqué par Syride.
- **Jour de vol** : journée où tu as réalisé au moins un vol.

## limites
- Les chiffres viennent des **fiches de vol Syride** : un vol dont la fiche n'a pas encore été récupérée n'apparaît pas dans ce rapport.
- Tous les vols récupérés sont comptés dans les vols et les heures. Certains n'ont pas de statistiques détaillées (plafond, vitesse, vario…) : ils n'apparaissent alors ni dans les records ni dans les maxima de ces mesures. Le tableau ci-dessus donne leur nombre ; quand une mesure manque à plus d'un vol sur cinq, une pastille « Données partielles » le signale à côté du chiffre.
- Les vols sans heure de décollage connue ne sont pas placés dans la grille jour × heure ni dans le graphique des heures ; la grille en indique le nombre.
- Les positions des sites sur la carte sont la position moyenne des traces GPX ou, à défaut, les coordonnées du site ; un site sans aucune coordonnée n'est pas placé (le tableau compte les vols concernés).
- Les années de comparaison utilisent les mêmes règles ; l'année en cours, non terminée, est comparée aux années précédentes entières.

## couverture_intro
Ce que Syride a pu mesurer sur tes vols.{{?debut}} La colonne « Toutes années » compte tous tes vols, toutes années confondues.{{/debut}}{{?date_donnees}} Données mises à jour le {{date_donnees}}.{{/date_donnees}}

## couverture_mesures
Mesures disponibles

## couverture_cellule
{{n}} sur {{total}}

## mesure_note
sur {{n}} {{?pluriel}}vols mesurés{{/pluriel}}{{^pluriel}}vol mesuré{{/pluriel}}

## non_mesure
non mesuré

## donnees_partielles
Données partielles

## donnees_partielles_titre
{{mesure}} : connu pour {{n}} vols sur {{total}}

## aide_raccourcis
Raccourcis clavier : appuie sur ? pour les afficher.

## pied_de_page
Rapport généré le {{date_generation}} pour **{{pilot}}** à partir des données Syride{{?date_donnees}} (mises à jour le {{date_donnees}}){{/date_donnees}}.

## barres_max_month
Mois le plus actif

## barres_max_month_hours
Mois le plus long en heures

## barres_total_month
Total du mois

<!-- Rejouer l'année (T30). Repères remplacés par report.js : {date} (« samedi 5 avril »), {resume} (« 12 vols, 8 h 05 min de vol, 4 sites ») -->
## rejeu_bouton
▶ Rejouer ton année

## rejeu_titre
Ton année, jour après jour

## rejeu_lecture
▶ Lecture

## rejeu_pause
❚❚ Pause

## rejeu_fermer
Fermer le rejeu

## rejeu_curseur
Jour de l'année

## rejeu_prec
← Vol précédent

## rejeu_suiv
Vol suivant →

## rejeu_vitesse
Vitesse

## rejeu_vol
vol

## rejeu_site
site

## rejeu_heures
de vol

## rejeu_jalons
Jalons atteints

## rejeu_annonce_pause
{{date}} : {{resume}}.

## rejeu_annonce_fin
Fin de l'année. {{resume}}.

## rejeu_aide
Espace : lecture ou pause · ← → : vol précédent ou suivant

<!-- Mode récap (T36) : pages plein écran et image de partage. Libellés fixes lus par report.js dans le bouton du hero,
     phrases des pages dans le JSON #recap-data. Repères : {{vols}}, {{duree}}, {{date}}, {{site}}, {{sites}}, {{part}}, {{nouveaux}}, {{plafond}}. -->
## recap_bouton
Ton récap

## recap_dialogue
Ton récap de l'année, en pages

## recap_fermer
Fermer le récap

## recap_prec
← Précédent

## recap_suiv
Suivant →

## recap_heures
de vol

## recap_au
au {{date}}

## recap_disc_all
Toutes disciplines

## recap_disc_parapente
Parapente

## recap_disc_paramoteur
Paramoteur

## recap_k_couv
Ton récap

## recap_k_phare
Le chiffre phare

## recap_k_mois
Mois star

## recap_k_jour
Meilleure journée

## recap_k_site
Site préféré

## recap_k_voile
Voile

## recap_k_record
Record

## recap_k_portrait
Portrait

## recap_k_partage
À partager

## recap_mois
{{vols}} et {{duree}} de vol : c'est ton mois le plus actif.

## recap_site_part
{{vols}}, soit {{part}} de tes vols.

## recap_site_total
Tu as volé sur {{sites}} cette année.

## recap_site_nouveaux
{{?pluriel}}Dont {{nouveaux}} découverts cette année.{{/pluriel}}{{^pluriel}}Dont un découvert cette année.{{/pluriel}}

## recap_voile
{{vols}} et {{duree}} de vol : c'est ta voile la plus utilisée.

## recap_record
Ton vol le plus long : le {{date}}, à {{site}}.

## recap_plafond
Plafond maximum : **{{plafond}}**.

## recap_telecharger
Télécharger l'image

## recap_partager
Partager

## recap_apercu
Aperçu de l'image de partage : tes chiffres de l'année.

## recap_img_titre
Mon année de vol {{year}}

## recap_img_pied
Rapport Syride · généré le {{date_generation}}

## recap_img_record
Vol le plus long
