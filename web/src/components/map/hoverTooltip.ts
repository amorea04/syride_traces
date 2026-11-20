/** Texte de l'infobulle de survol des cartes de sites (fonction pure : testée sans carte). */
import { fmtInt, NBSP, plural } from '@/lib/format';

export interface HoverTooltipText {
  /** Ligne principale (nom du site, ou « N sites · M vols » pour une grappe). */
  title: string;
  /** Ligne secondaire facultative (vols et discipline dominante d'un site). */
  detail?: string;
}

const DOMINANT_LABEL: Record<string, string> = { parapente: 'Parapente', paramoteur: 'Paramoteur' };

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Infobulle d'un site : nom, nombre de vols et discipline dominante (absente si « tout »). */
export function siteHoverText(p: { name: string; flights: number; dominant?: string }): HoverTooltipText {
  const flights = plural(p.flights, 'vol');
  const dominant = p.dominant ? DOMINANT_LABEL[p.dominant] : undefined;
  return { title: p.name, detail: dominant ? `${flights} · ${dominant}` : flights };
}

/** Infobulle d'une grappe : « N sites · M vols », ou « N sites » si le total de vols est inconnu. */
export function clusterHoverText(p: { point_count?: unknown; flights?: unknown }): HoverTooltipText | null {
  if (!isCount(p.point_count) || p.point_count < 1) return null;
  const sites = `${fmtInt(p.point_count)}${NBSP}site${p.point_count > 1 ? 's' : ''}`;
  return { title: isCount(p.flights) ? `${sites} · ${plural(p.flights, 'vol')}` : sites };
}

/** Contenu DOM de l'infobulle (textContent uniquement : aucun nom n'est interprété comme HTML). */
export function buildHoverContent(text: HoverTooltipText): HTMLElement {
  const root = document.createElement('div');
  root.className = 'sr-map-hover';
  const title = document.createElement('strong');
  title.textContent = text.title;
  root.appendChild(title);
  if (text.detail) {
    const detail = document.createElement('div');
    detail.textContent = text.detail;
    root.appendChild(detail);
  }
  return root;
}
