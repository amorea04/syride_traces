# Brief : priorité des fiches en phase 2 (branche `scraping/priorite-phase2`)

## Constat (R1 du 24/11/2026)

Plafond de 40 fiches. File globale (`flights_db.get_global_queue`) triée par groupes :
0 = informations manquantes, 1 = GPX manquant, 2 = IGC seul, 3 = fiche brute seule (rattrapage).
Ce soir-là : 631 vols du groupe 0 (yanis, Au_Phil_du_vent, jeanlouisksu : pilotes sans fichiers,
donc fenêtre sans connexion) aux rangs 1 à 631, puis des vols d'AdrienM du groupe 3 (fiche brute
manquante, IGC manquant en plus) aux rangs 653+.

`is_file_flight` envoie ces vols d'AdrienM vers la fenêtre connectée (IGC manquant), qui passe
**en premier**. Résultat :
1. les 40 fiches sont parties sur du rattrapage d'AdrienM, les 631 vols du groupe 0 n'ont rien eu ;
2. après « DOWNLOAD LIMIT REACHED » (17 IGC), la fenêtre connectée a continué 23 fiches en
   « infos seules », donc ces vols devront être revisités pour leurs fichiers (quota consommé deux fois).

## Correctif attendu (`src/browser_session.py`, `process_pilots` / `run_pass`)

Contraintes inchangées : au plus deux fenêtres par exécution, une à la fois, connectée d'abord puis
sans connexion ; aucun téléchargement sans connexion ; budget commun.

A. **Réserve de budget pour les vols mieux classés.** Dans la passe connectée, avant de lire la fiche
   du vol de rang `k`, compter `n_avant` = nombre de vols de `plain_items` (ceux qui seront lus en
   passe 2) de rang < `k`. Si `budget.max` n'est pas None et `budget.used + n_avant >= budget.max`,
   **arrêter la passe connectée** (pas d'arrêt global : la passe 2 doit tourner). Les vols connectés
   restants ne sont PAS lus sans connexion : ils restent à compléter (comptés dans le reste à faire).
   Message clair, par ex. « Fenêtre connectée arrêtée : les N fiche(s) restantes du plafond vont à des
   vols prioritaires (informations manquantes). » Avec `budget.max` None (pas de plafond) : aucun effet.

B. **Fin de la passe connectée dès la limite de téléchargement.** Au premier statut
   `download_blocked`, terminer la passe connectée après ce vol. Les vols connectés non encore traités
   rejoignent la passe 2 (fusion avec `plain_items`, triés par rang) ; la règle existante de
   `run_pass` s'y applique (vol à qui il ne manque que des fichiers : sauté et compté en attente de
   fichiers ; sinon fiche lue en informations seules, mode « [infos seules : téléchargements
   bloqués] »). La réserve A ne s'applique qu'à la passe connectée.

C. Bilans et compteurs cohérents : `pending` (« vol(s) restent à compléter ») doit compter les vols
   connectés non traités ; le bilan final et la valeur retournée restent corrects. Corriger au passage
   le calcul de `pending` s'il ne compte que `len(queue) - loop["processed"]` alors que des vols
   connectés ont été laissés de côté.

D. Mettre à jour la docstring de `process_pilots` et l'en-tête du module (règle de priorité).

## Tests (`src/scraping_tests/test_session.py` ou `test_limits.py`, suivre les doubles existants)

1. Plafond 3, file : 5 vols sans fichiers groupe 0 (rangs 0–4) + 2 vols à fichiers groupe 3 :
   aucune fiche connectée lue, la fenêtre connectée n'est pas ouverte si rien n'y est lu (ou est
   ouverte puis fermée sans fiche : choisir le plus simple, mais ne PAS se connecter pour rien de
   préférence), 3 fiches lues sans connexion, rangs 0, 1, 2.
2. Plafond 10, 2 vols groupe 0 sans fichiers + 5 vols à fichiers : la passe connectée lit au plus
   8 fiches puis la passe 2 lit les 2 vols groupe 0.
3. `download_blocked` au 2e vol connecté : la fenêtre connectée s'arrête ; les vols connectés restants
   avec fiche brute/infos manquantes sont lus dans la fenêtre sans connexion, dans l'ordre des rangs
   mêlés aux vols sans fichiers ; ceux à qui il ne manque que des fichiers sont sautés.
4. Sans plafond (`max_sheets=0`/None) : comportement inchangé (tests existants verts).

## Vérification

`make test-py` vert (285+ tests). Ne pas lancer de scraping réel. Ne pas committer : l'Architecte
relit et committe. Python : `uv run python` uniquement.
