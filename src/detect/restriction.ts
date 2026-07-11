import type { EnzymeSpec } from '../types';

/** A small default panel of common type-II restriction enzymes. */
export const DEFAULT_ENZYMES: EnzymeSpec[] = [
  { name: 'EcoRI', site: 'GAATTC' },
  { name: 'BamHI', site: 'GGATCC' },
  { name: 'HindIII', site: 'AAGCTT' },
  { name: 'XhoI', site: 'CTCGAG' },
  { name: 'XbaI', site: 'TCTAGA' },
  { name: 'NotI', site: 'GCGGCCGC' },
  { name: 'NcoI', site: 'CCATGG' },
  { name: 'NdeI', site: 'CATATG' },
  { name: 'SalI', site: 'GTCGAC' },
  { name: 'PstI', site: 'CTGCAG' },
  { name: 'KpnI', site: 'GGTACC' },
  { name: 'SacI', site: 'GAGCTC' },
  { name: 'SmaI', site: 'CCCGGG' },
  { name: 'SpeI', site: 'ACTAGT' },
  { name: 'ApaI', site: 'GGGCCC' },
  { name: 'BglII', site: 'AGATCT' },
];

const COMP: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' };

export function reverseComplement(seq: string): string {
  let out = '';
  for (let i = seq.length - 1; i >= 0; i--) out += COMP[seq[i].toUpperCase()] ?? 'N';
  return out;
}

/** All indices of `needle` in `haystack` (0-based, overlapping-safe by +1 step). */
function indicesOf(haystack: string, needle: string): number[] {
  const out: number[] = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}

/**
 * Find every start position of a recognition site, scanning both strands and
 * (for circular molecules) across the origin. Returns sorted, de-duplicated
 * 0-based indices in [0, length).
 */
export function findSites(sequence: string, site: string, circular: boolean): number[] {
  const seq = sequence.toUpperCase();
  const s = site.toUpperCase();
  const L = seq.length;
  if (!s || L === 0 || s.length > L) return [];

  const haystack = circular ? seq + seq.slice(0, s.length - 1) : seq;
  const rc = reverseComplement(s);
  const needles = rc === s ? [s] : [s, rc];

  const found = new Set<number>();
  for (const needle of needles) {
    for (const idx of indicesOf(haystack, needle)) {
      if (idx < L) found.add(idx);
    }
  }
  return [...found].sort((a, b) => a - b);
}

export interface CutSite {
  enzyme: string;
  positions: number[];
}

/**
 * Scan a sequence against an enzyme panel.
 * @param maxCutFrequency  keep only enzymes cutting at most this many times
 *   (1 = unique cutters, the most legible on a map). 0 = keep all.
 */
export function findCutters(
  sequence: string,
  circular: boolean,
  enzymes: EnzymeSpec[] = DEFAULT_ENZYMES,
  maxCutFrequency = 1
): CutSite[] {
  const out: CutSite[] = [];
  for (const e of enzymes) {
    const positions = findSites(sequence, e.site, circular);
    if (positions.length === 0) continue;
    if (maxCutFrequency > 0 && positions.length > maxCutFrequency) continue;
    out.push({ enzyme: e.name, positions });
  }
  return out;
}
