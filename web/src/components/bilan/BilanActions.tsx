import { Button, Text } from '@mantine/core';
import { IconCheck, IconDownload, IconLink, IconListDetails } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBilan } from '@/components/bilan/BilanContext';
import './bilanB.css';
import { bilanCsvName, summaryText } from '@/lib/bilanDetails';
import { DEFAULT_SORT, defaultVisibleColumns, flightsToCsv, sortFlights } from '@/lib/flightsTable';

type Feedback = { kind: 'link' | 'summary' | 'csv'; ok: boolean } | null;

/** Télécharge un texte en fichier CSV, sans appel réseau. */
function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copie un texte dans le presse-papiers ; `false` si le navigateur refuse ou ne sait pas. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Actions du Bilan (5B.9) : copier le lien (URL courante, filtres et années comparées compris), copier le résumé,
 * exporter les vols de l'année en CSV. Barre discrète, pas une section.
 */
export function BilanActions() {
  const { pilot, slug, year, ongoing, cutoff, flights, story } = useBilan();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((next: Feedback) => {
    setFeedback(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), 2500);
  }, []);

  const copyLink = async () => show({ kind: 'link', ok: await copyText(window.location.href) });
  const copySummary = async () =>
    show({ kind: 'summary', ok: await copyText(summaryText({ pilot, year, ongoing, cutoff, flights, story })) });
  const exportCsv = () => {
    downloadText(bilanCsvName(slug, year), flightsToCsv(sortFlights(flights, DEFAULT_SORT), defaultVisibleColumns()));
    show({ kind: 'csv', ok: true });
  };

  const label = (kind: 'link' | 'summary', idle: string) =>
    feedback?.kind === kind ? (feedback.ok ? 'Copié' : 'Copie impossible') : idle;
  const icon = (kind: 'link' | 'summary', idle: React.ReactNode) =>
    feedback?.kind === kind && feedback.ok ? <IconCheck size={16} stroke={1.8} /> : idle;

  return (
    <div className="bb-actions" role="group" aria-label="Actions du bilan" data-testid="bilan-actions">
      <Button
        variant="default"
        size="xs"
        leftSection={icon('link', <IconLink size={16} stroke={1.6} />)}
        onClick={() => void copyLink()}
        data-testid="bilan-copy-link"
      >
        {label('link', 'Copier le lien')}
      </Button>
      <Button
        variant="default"
        size="xs"
        leftSection={icon('summary', <IconListDetails size={16} stroke={1.6} />)}
        onClick={() => void copySummary()}
        data-testid="bilan-copy-summary"
      >
        {label('summary', 'Copier mon résumé')}
      </Button>
      <Button
        variant="default"
        size="xs"
        leftSection={<IconDownload size={16} stroke={1.6} />}
        onClick={exportCsv}
        data-testid="bilan-export-csv"
      >
        Exporter en CSV
      </Button>
      <Text size="xs" c="dimmed" role="status" aria-live="polite">
        {feedback?.ok === false ? 'Le presse-papiers n’est pas disponible dans ce navigateur.' : ''}
      </Text>
    </div>
  );
}
