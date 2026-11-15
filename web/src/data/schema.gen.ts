/* eslint-disable */
// FICHIER GÉNÉRÉ par `npm run gen:types` à partir de src/web_export/schema.json. Ne pas modifier à la main.

export type SchemaVersion = 1;
/**
 * Date ISO AAAA-MM-JJ (1980 ou après : la date sentinelle 1901 est refusée).
 */
export type IsoDate = string;
/**
 * Heure de décollage HH:MM.
 */
export type ClockTime = string;
/**
 * Identifiant d'URL : minuscules ASCII, chiffres, tirets (accents translittérés).
 */
export type Slug = string;
/**
 * Clé stable d'un vol : "<pilote_slug>-<num_activite>", utilisée dans /vol/:key.
 */
export type FlightKey = string;
/**
 * Index dans la liste correspondante de FlightsFile.dict.
 */
export type Index = number;
export type NullableIndex = number | null;
/**
 * Mesure strictement positive, ou null si inconnue. Les valeurs ≤ 0 du pkl sont exportées en null : c'est équivalent à la règle `_positive` du rapport et de l'app (moyennes, max, sommes et « vols mesurés » ignorent les valeurs ≤ 0).
 */
export type PositiveMeasure = number | null;
export type Discipline = "parapente" | "paramoteur";
export type DisciplineFilter = "tout" | "parapente" | "paramoteur";
/**
 * Date ISO AAAA-MM-JJ (1980 ou après : la date sentinelle 1901 est refusée).
 */
export type IsoDate1 = string;
/**
 * Date ISO AAAA-MM-JJ (1980 ou après : la date sentinelle 1901 est refusée).
 */
export type IsoDate2 = string;
/**
 * Récit d'une discipline pour un pilote et une année ; null si le pilote n'a aucun vol dans cette discipline cette année. Textes en texte brut, identiques à ceux du rapport HTML.
 */
export type Story = null | {
  /**
   * Portrait du pilote (page du bilan uniquement, D11) ; null si le texte est absent.
   */
  persona: null | {
    main: PersonaKey;
    secondary: {
      key: PersonaKey;
      label: string;
      why: string;
    }[];
    label: string;
    /**
     * Justification ; chaîne vide si le texte n'en a pas.
     */
    why: string;
  };
  /**
   * Avance ou retard sur l'année précédente (à date si l'année est en cours) ; null sans année de comparaison.
   */
  gap: null | {
    status: "avance" | "retard" | "egal";
    ref_year: number;
    ongoing: boolean;
    /**
     * Écart absolu en minutes de vol.
     */
    minutes: number;
    /**
     * Écart signé en nombre de vols.
     */
    flights: number;
    text: string;
    note: string;
  };
  /**
   * Jalons de l'année, triés par date, au plus 12.
   */
  milestones: {
    date: IsoDate;
    kind: "first" | "nth_flight" | "nth_hour" | "record" | "best_day" | "new_site" | "new_wing" | "comeback";
    /**
     * Palier (n-ième vol ou heure) pour nth_flight et nth_hour, sinon null.
     */
    value: number | null;
    /**
     * Or = records et nouveautés uniquement.
     */
    gold: boolean;
    title: string;
    /**
     * Détail en une ligne (sites, durées, valeurs) ; chaîne vide s'il n'y en a pas.
     */
    detail: string;
    flight: FlightRef;
    /**
     * Records du vol cité (jalons « record » et « first »).
     */
    metrics?: {
      metric: "duree" | "plafond" | "distance";
      value: number;
    }[];
  }[];
  /**
   * Records personnels battus contre tout l'historique du pilote.
   */
  records_beaten: {
    metric: "plafond" | "vitesse_max" | "distance" | "vario" | "g" | "duree";
    value: number;
    previous: number;
    previous_year: number;
    date: IsoDate;
    flight: FlightRef;
  }[];
  equivalences: string[];
  /**
   * Sites jamais volés les années précédentes, triés par date de découverte.
   */
  new_sites: {
    site: string;
    first_date: IsoDate;
    n: number;
  }[];
  /**
   * Voiles jamais utilisées les années précédentes, triées par date.
   */
  new_wings: {
    wing: string;
    first_date: IsoDate;
  }[];
  /**
   * Zones de la carte, de la plus volée à la moins volée.
   */
  map_zones: {
    /**
     * « Autour de <site le plus volé> ».
     */
    name: string;
    top: string;
    /**
     * @minItems 1
     */
    sites: [string, ...string[]];
    flights: number;
    minutes: number;
    /**
     * [lon_min, lat_min, lon_max, lat_max] des positions moyennes des sites de la zone (jamais d'un vol).
     *
     * @minItems 4
     * @maxItems 4
     */
    bbox: [number, number, number, number];
  }[];
  /**
   * Portée autour du site principal ; null avec un seul site.
   */
  reach: null | {
    main_site: string;
    /**
     * null si les sites n'ont pas de position.
     */
    farthest_site: string | null;
    km: number | null;
    /**
     * Part des vols sur le site principal.
     */
    main_share: number;
  };
  /**
   * Phrases du rapport (aperçu, histoire, faits marquants) ; null si la phrase n'a pas lieu d'être.
   */
  texts: {
    synthese: string | null;
    rythme: string | null;
    quand: string | null;
    ou: string | null;
    matos: string | null;
    records: string | null;
    meilleure_journee: string | null;
    journee_type: string | null;
  };
};
/**
 * Étiquette du portrait (clés de PERSONA_RULES, plus « debut » sous 5 vols et « libre » sans règle applicable).
 */
export type PersonaKey =
  | "debut"
  | "libre"
  | "polyvalent"
  | "treuilleur"
  | "marcheur"
  | "plafond"
  | "explorateur"
  | "nomade"
  | "marathonien"
  | "regulier"
  | "leve_tot"
  | "soir"
  | "fidele"
  | "week_end";
export type FlightRef = FlightKey | null;

export interface SchemaRoot {
  SchemaVersion?: SchemaVersion;
  IsoDate?: IsoDate;
  ClockTime?: ClockTime;
  Slug?: Slug;
  FlightKey?: FlightKey;
  Index?: Index;
  NullableIndex?: NullableIndex;
  PositiveMeasure?: PositiveMeasure;
  Discipline?: Discipline;
  DisciplineFilter?: DisciplineFilter;
  MetaFile?: MetaFile;
  FlightsFile?: FlightsFile;
  SitesFile?: SitesFile;
  InsightsFile?: InsightsFile;
  FlightRef?: FlightRef;
  PersonaKey?: PersonaKey;
  Story?: Story;
}
/**
 * Petit fichier d'amorce, jamais mis en cache (Cache-Control: no-cache). Donne les noms hashés des autres fichiers.
 */
export interface MetaFile {
  schema_version: SchemaVersion;
  /**
   * Horodatage UTC de l'export.
   */
  generated_at: string;
  data_updated_at: IsoDate1;
  counts: {
    flights: number;
    pilots: number;
    sites: number;
    wings: number;
    /**
     * Vols du pkl écartés de l'export (ex. date sentinelle 1901), affichés dans « Qualité des données ».
     */
    excluded_flights: number;
  };
  files: {
    flights: string;
    sites: string;
  };
  /**
   * Couples (pilote, année) pour lesquels un fichier insights/<pilote_slug>-<année>.json existe.
   */
  insights: {
    pilot: Slug;
    year: number;
    file: string;
  }[];
}
/**
 * Une ligne par vol, dans l'ordre de `columns`. La clé d'un vol (FlightKey, URL /vol/:key) n'est pas exportée : le front la recalcule = pilot_slugs[pilot] + "-" + syride_num (gain ≈ 30 Ko gzip). Les catégories sont des index dans `dict`. Champs dérivés (année, mois, jour, saison, heure entière) non exportés : recalculés côté front depuis `date` et `time`.
 */
export interface FlightsFile {
  schema_version: SchemaVersion;
  columns: [
    "pilot",
    "activity",
    "date",
    "time",
    "site",
    "wing",
    "instrument",
    "mode",
    "duration_min",
    "dist_km",
    "dist_cum_km",
    "speed_avg",
    "speed_max",
    "ceiling_m",
    "gain_m",
    "vario_max",
    "g_max",
    "incomplete",
    "source",
    "syride_num"
  ];
  dict: {
    /**
     * Pseudo Syride exact (sert à construire les liens syride.com).
     */
    pilot: string[];
    activity: ["parapente", "paramoteur"];
    /**
     * L'index d'un site est aussi son `id` dans sites.json.
     */
    site: string[];
    wing: string[];
    instrument: string[];
    /**
     * Libellés courts de `mode_of` (report_data.py) : Site, Treuil, Rando, Bord de mer, Moteur, puis éventuels inconnus.
     */
    mode: string[];
    source: ["gpx", "fiche", "aucune"];
  };
  /**
   * Aligné sur dict.pilot : slug d'URL du pilote (calculé une seule fois, en Python).
   */
  pilot_slugs: Slug[];
  rows: [
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown,
    unknown
  ][];
}
/**
 * Un objet par site, `id` = index dans FlightsFile.dict.site. Coordonnées = moyenne du site (jamais celles d'un vol). Clé vide de sites_coordinates.json exclue.
 */
export interface SitesFile {
  schema_version: SchemaVersion;
  sites: {
    id: Index;
    name: string;
    lat: number | null;
    lon: number | null;
    flights: number;
    pilots: number;
    activities: {
      parapente: number;
      paramoteur: number;
    };
  }[];
}
/**
 * Récit précalculé par src/web_export/insights.py en appelant src/rapport/report_data.py et le moteur de textes du rapport (report_textes.md, tirage crc32). Textes déjà rendus, en texte brut (espaces insécables conservés). `v` versionne ce fichier. Aucune coordonnée de vol : seules les zones de carte portent l'emprise des sites.
 */
export interface InsightsFile {
  v: 1;
  pilot: Slug;
  year: number;
  cutoff: IsoDate2;
  by_disc: {
    tout: Story;
    parapente: Story;
    paramoteur: Story;
  };
}
