import { createContext, useContext } from 'react';
import type { Flight } from '@/data/flight';
import type { DisciplineFilter, InsightsFile, Story } from '@/data/schema.gen';

/**
 * Tout ce dont une section du Bilan a besoin, calculé une fois par `PilotYear`.
 * Contrat partagé par toutes les sections (`components/bilan/*`) : ne pas le modifier sans le maître d'œuvre.
 */
export interface BilanContextValue {
  /** Pseudo Syride exact. */
  pilot: string;
  slug: string;
  year: number;
  /** Discipline = filtre global « activité » (seul filtre global appliqué au Bilan). */
  discipline: DisciplineFilter;
  /** Vols de l'année du bilan dans la discipline, arrêtés à `cutoff`. Non vide. */
  flights: readonly Flight[];
  /** Tous les vols du pilote dans la discipline, toutes années (historique pour records et nouveautés). */
  history: readonly Flight[];
  /** Années comparées choisies (0 à 2), de la plus récente à la plus ancienne. */
  compareYears: readonly number[];
  /** Vols de chaque année comparée (année entière, même discipline) ; tableau vide si aucun vol. */
  compareFlights: ReadonlyMap<number, readonly Flight[]>;
  /** Change les années comparées (écrit l'URL). */
  setCompareYears: (years: readonly number[]) => void;
  /** Années où le pilote a volé (toutes disciplines), de la plus récente à la plus ancienne. */
  availableYears: readonly number[];
  /** Récit Python de la discipline. Non null quand `flights` est non vide. */
  story: NonNullable<Story>;
  insights: InsightsFile;
  /** Date de coupure ISO (fin d'année, ou date des données si l'année est en cours). */
  cutoff: string;
  /** Vrai si l'année du bilan est l'année en cours (chiffres « à date »). */
  ongoing: boolean;
  /** Date de référence des données (`meta.data_updated_at`). */
  refDate: string;
}

export const BilanContext = createContext<BilanContextValue | null>(null);

/** Contexte du Bilan ; n'existe que sous `PilotYear`. */
export function useBilan(): BilanContextValue {
  const value = useContext(BilanContext);
  if (!value) throw new Error('useBilan doit être utilisé sous <BilanContext.Provider>');
  return value;
}
