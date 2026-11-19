import { ActionIcon } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import { Section } from '@/components/common/Section';
import { FilterLink } from '@/components/FilterLink';
import { formatRecordValue, recordCards, recordDelta, type RecordCard } from '@/lib/bilanDetails';
import { EMPTY, fmtDate, fmtInt } from '@/lib/format';
import { syrideFlightUrl } from '@/lib/syride';
import './bilanB.css';

function Card({ card }: { card: RecordCard }) {
  const { def, rows, beaten, previousBest, measured, partial } = card;
  const top = rows[0]?.value ?? 0;
  const foot: string[] = [];
  if (!beaten && previousBest) {
    foot.push(`Ton record : ${formatRecordValue(def.kind, def.unit, previousBest.value)} en ${previousBest.year}`);
  }
  if (measured.ok > 0 && measured.ok < measured.total) {
    foot.push(`mesuré sur ${fmtInt(measured.ok)} de tes ${fmtInt(measured.total)} vols`);
  }
  return (
    <div className="bb-record" data-new={beaten !== null} data-testid="bilan-record" data-record={def.key}>
      <h3>
        <span>
          {def.title}
          {partial && (
            <span
              className="bb-partial"
              title={`${def.measureName} : connu pour ${fmtInt(measured.ok)} vols sur ${fmtInt(measured.total)}`}
            >
              Données partielles
            </span>
          )}
        </span>
        {beaten && (
          <span className="bb-record-new" data-testid="bilan-record-new">
            Nouveau record !
          </span>
        )}
      </h3>
      {beaten && (
        <p className="bb-record-gain" data-testid="bilan-record-gain">
          {recordDelta(def.kind, def.unit, beaten.delta)} par rapport à {beaten.previousYear}
        </p>
      )}
      <ol>
        {rows.map((r) => (
          <li key={r.flightKey} data-new={r.isNew} data-testid="bilan-record-row">
            <span className="bb-rank">{r.rank}</span>
            <div className="bb-rec-meta">
              <FilterLink to={`/vol/${r.flightKey}`} fw={600} data-testid="bilan-record-link">
                {fmtDate(r.date, { withYear: true })}
              </FilterLink>
              <small>
                {r.site ?? EMPTY}
                {r.wing ? ` · ${r.wing}` : ''}
              </small>
            </div>
            <span className="bb-rec-val">{formatRecordValue(def.kind, def.unit, r.value)}</span>
            <ActionIcon
              component="a"
              href={syrideFlightUrl(r.pilot, r.syrideNum)}
              target="_blank"
              rel="noopener noreferrer"
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Voir la trace sur Syride"
              title="Voir la trace sur Syride"
              data-testid="syride-link"
            >
              <IconExternalLink size={15} stroke={1.6} />
            </ActionIcon>
            <div className="bb-rec-bar" aria-hidden="true">
              <span style={{ width: `${top > 0 ? Math.max(6, (100 * r.value) / top) : 0}%` }} />
            </div>
          </li>
        ))}
      </ol>
      {foot.length > 0 && <p className="bb-rec-foot">{foot.join(' · ')}</p>}
    </div>
  );
}

/**
 * Records : top 5 de l'année sur 6 critères (mêmes règles que le rapport), chaque ligne vers la fiche du vol et vers
 * Syride, « Nouveau record ! » en or sur les critères battus (`story.records_beaten`).
 */
export function BilanRecords() {
  const { flights, history, year, story } = useBilan();
  const cards = useMemo(() => recordCards(flights, history, year, story), [flights, history, year, story]);
  if (cards.length === 0) return null;
  return (
    <Section id="records" title="Tes records">
      {story.texts.records && (
        <p className="bb-lead" data-testid="bilan-texte-records">
          {story.texts.records}
        </p>
      )}
      <div className="bb-records" data-testid="bilan-records">
        {cards.map((c) => (
          <Card key={c.def.key} card={c} />
        ))}
      </div>
    </Section>
  );
}
