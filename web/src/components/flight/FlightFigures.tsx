import { Section } from '@/components/common/Section';
import '@/components/flight/flight.css';
import type { Flight, FlightSource } from '@/data/flight';
import { EMPTY, fmtDuration, fmtInt, fmtNum } from '@/lib/format';

interface Fig {
  label: string;
  value: string | null;
  unit?: string;
}

/** Les chiffres du vol, tels qu'exportés (une mesure absente reste « – », jamais 0). */
export function flightFigures(f: Flight): Fig[] {
  const num = (v: number | null, digits: number) => (v === null ? null : fmtNum(v, digits));
  const int = (v: number | null) => (v === null ? null : fmtInt(v));
  return [
    { label: 'Durée', value: f.durationMin === null ? null : fmtDuration(f.durationMin) },
    { label: 'Distance', value: num(f.distKm, 1), unit: 'km' },
    { label: 'Distance cumulée', value: num(f.distCumKm, 1), unit: 'km' },
    { label: 'Plafond', value: int(f.ceilingM), unit: 'm' },
    { label: 'Gain', value: int(f.gainM), unit: 'm' },
    { label: 'Vitesse moyenne', value: num(f.speedAvg, 1), unit: 'km/h' },
    { label: 'Vitesse max', value: num(f.speedMax, 1), unit: 'km/h' },
    { label: 'Vario max', value: num(f.varioMax, 1), unit: 'm/s' },
    { label: 'g max', value: num(f.gMax, 1), unit: 'g' },
  ];
}

const SOURCE_TEXT: Record<FlightSource, string> = {
  gpx: 'Source des mesures : GPX importé sur Syride (fichier non republié ici).',
  fiche: 'Source des mesures : fiche Syride (saisie par le pilote).',
  aucune: 'Source des mesures : aucune, ce vol n’a pas de mesure.',
};

export function FlightFigures({ flight }: { flight: Flight }) {
  const figs = flightFigures(flight);
  return (
    <Section id="chiffres" title="Chiffres du vol">
      <div className="fv-figs">
        {figs.map((fig) => (
          <div className="fv-fig" key={fig.label}>
            <span className="fv-fig-label">{fig.label}</span>
            {fig.value === null ? (
              <span className="fv-fig-value fv-fig-empty" aria-label={`${fig.label} : non renseigné`}>
                {EMPTY}
              </span>
            ) : (
              <span className="fv-fig-value">
                {fig.value}
                {fig.unit && <small>{fig.unit}</small>}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="fv-note" data-testid="flight-source">
        {SOURCE_TEXT[flight.source]}
        {flight.incomplete &&
          ' Vol incomplet sur Syride : ses statistiques de fiche ne sont pas comparées aux autres vols.'}
      </p>
    </Section>
  );
}
