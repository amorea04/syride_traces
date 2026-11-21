# Validation des statistiques : trace `fv-config` contre GPX (scène 3)

Date : 21/11/2026. Données : `porte4_copie` (lecture seule). Commandes (venv py39, depuis `src/`) :

```bash
python migration/compare_track_vs_gpx.py --pilot AdrienM --path /Users/Adrien/Documents/paramoteur/syride/analyze_traces/porte4_copie/
python migration/compare_track_vs_gpx.py --pilot j2f --path /Users/Adrien/Documents/paramoteur/syride/analyze_traces/porte4_copie/
```

Tolérances (scène 3) : durée ±2 s, plafond ±2 m, gain ±3 m, vitesse max ±10 %.

## Portée : échantillon partiel

**20 vols seulement** ont à la fois une fiche brute et un GPX (14 AdrienM, 6 j2f), et non ~50 : Syride a atteint sa
limite quotidienne de fiches pendant la collecte. L'échantillon est donc **partiel**. Ce n'est pas un échec : il est à
compléter vers 50 vols lors des prochains lancements (rattrapage des fiches brutes, lot G), en relançant les mêmes
commandes. Les conclusions ci-dessous valent pour ces 20 vols et sont à confirmer sur l'échantillon élargi.

## Bilan

| Pilote | Vols comparés | Dans les tolérances | Hors tolérance | Ignorés |
|---|---|---|---|---|
| AdrienM | 14 | 14 | 0 | 0 |
| j2f | 6 | 6 | 0 | 0 |
| **Total** | **20** | **20** | **0** | **0** |

Écarts absolus (fv-config moins GPX), les deux pilotes : durée 0 s, plafond 0 m, gain 0 m (médiane et maximum) ;
vitesse max : médiane 0 %, maximum 2,6 % (j2f, 3741335). Aucun vol hors tolérance : **aucune analyse de cause à faire**.

### AdrienM

```
      vol   durée fv durée gpx  plaf.f plaf.g  gain f gain g  vit f vit g  verdict
  3766574   01:06:10  01:06:10     629    629    570   570     68    68  ok
  3761544   00:23:09  00:23:09    1836   1836      0     0     53    53  ok
  3761463   00:17:51  00:17:51    1725   1725      0     0     45    45  ok
  3761259   00:09:41  00:09:41    1639   1639      0     0     47    47  ok
  3760141   00:17:10  00:17:10    1872   1872      0     0     44    45  ok
  3759986   00:18:53  00:18:53    1728   1728      0     0     45    45  ok
  3738013   00:16:57  00:16:57     700    700    590   590     54    54  ok
  3737968   00:19:05  00:19:05     680    680    574   574     50    50  ok
  3731284   00:14:37  00:14:37     440    440    329   329     55    55  ok
  3731282   00:06:15  00:06:15     370    370    259   259     46    46  ok
  3731281   00:12:43  00:12:43     430    430    321   321     51    51  ok
  3731278   00:07:31  00:07:31     414    414    300   300     51    51  ok
  3731277   00:07:13  00:07:13     457    457    346   346     55    55  ok
  3731275   00:20:23  00:20:23     710    710    595   595     50    50  ok
```

### j2f

```
      vol   durée fv durée gpx  plaf.f plaf.g  gain f gain g  vit f vit g  verdict
  3741336   00:40:16  00:40:16     888    888    747   747     57    57  ok
  3741335   00:04:06  00:04:06     334    334    193   193     38    39  ok
  3741333   00:04:06  00:04:06     326    326    188   188     41    41  ok
  3741332   00:04:06  00:04:06     278    278    133   133     41    41  ok
  3741331   00:40:50  00:40:50    1404   1404   1294  1294     61    61  ok
  3741330   00:14:50  00:14:50     819    819    705   705     42    42  ok
```

(Colonnes : `f` = fv-config, `g` = GPX ; durée `hh:mm:ss`, plafond et gain en m, vitesse max en km/h.)

Remarques :

- Les écarts de vitesse max restent sous 3 % : 3760141 (44 contre 45), 3741335 (38 contre 39) ; les 18 autres sont
  identiques. Avant la porte IV, les positions répétées par `fv-config` (42 % des points sur 3766574) faussaient la vitesse :
  corrigé à la porte IV (vitesse calculée sur les seules positions nouvelles, `STATS_VERSION = 4`). 3766574
  donne maintenant 68 km/h des deux côtés (122 avant correction).
- Un gain de 0 (3761544, 3761463, 3761259, 3760141, 3759986) est identique des deux côtés : probablement des vols dont
  le point de départ est le plus haut de la trace (gain = plafond moins altitude au premier point), non vérifié
  vol par vol. Ce n'est pas un écart entre les deux sources.

## `vitesse_max` calculée contre `vitesse_max_fiche` (règle P20)

`vitesse_max` est calculée depuis la trace (médiane glissante sur 5 points des vitesses point à point) ;
`vitesse_max_fiche` est la valeur affichée par Syride (extremum « vitesse » de la fiche). Sur les 20 vols :

- écart relatif (calculée contre fiche) : médiane **7,9 %**, maximum 17,8 % (AdrienM 3761544 : 53 contre 45) ;
- **6 vols sur 20 dépassent 10 %** ; chez AdrienM la valeur calculée est toujours supérieure à celle de la fiche
  (+3,8 % à +17,8 %), chez j2f elle est tantôt au-dessus, tantôt en dessous (de −10,6 % à +17,1 %) ;
- la valeur du JSON (`vitesse_max`, lue sur la fiche à l'époque) est égale à `vitesse_max_fiche` pour les 20 vols.

**Quelle valeur le pkl utilise-t-il ?** Celle de la fiche Syride, quand elle existe et est positive : la règle P20
(`flights_db.GPX_FILL_ONLY = {"vitesse_max"}`, `apply_track_stats`) laisse la valeur du JSON et ne calcule la vitesse
depuis la trace que pour combler une valeur absente. Les statistiques de trace (durée, plafond, gain) prennent le dessus ;
la vitesse max reste celle de Syride. La vitesse max calculée n'a donc d'incidence sur le pkl que pour un vol dont la
fiche ne donne pas de valeur.

## Conclusion

Sur les 20 vols disponibles, durée, plafond et gain calculés depuis `fv-config` sont identiques à ceux du GPX ; la
vitesse max l'est à moins de 3 %. Le passage de `gpx` à `trace` comme source des statistiques ne modifie pas les
valeurs du pkl (voir aussi `RECETTE.md`, section A/B). À refaire sur ~50 vols quand le rattrapage aura fourni les
fiches manquantes.
