import { fmtInt, fmtPercent } from '@/lib/format';
import { parapenteShare, type DisciplineShare } from '@/lib/siteAggregates';

export { fmtInt, fmtPercent };

/** « 69 % / 31 % » (parapente / paramoteur), « – » si aucun vol. */
export function fmtWithShare(share: DisciplineShare): string {
  if (share.parapente + share.paramoteur === 0) return '–';
  const p = parapenteShare(share);
  return `${fmtPercent(p)} / ${fmtPercent(100 - p)}`;
}
