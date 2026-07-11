import type { Feature } from '../types';
import { COMMON_FEATURES } from './common-features';
import { reverseComplement } from './restriction';

/**
 * Auto-annotate a bare sequence by exact-matching a curated common-feature
 * panel on both strands (and, for circular molecules, across the origin).
 * Returns 1-based inclusive features suitable for {@link renderPlasmidSVG}.
 *
 * This is intentionally conservative: it only surfaces features it can find
 * verbatim, so a rendered map never invents annotations that aren't there.
 */
export function detectCommonFeatures(sequence: string, circular = true): Feature[] {
  const seq = sequence.toUpperCase().replace(/[^ACGT]/g, '');
  const L = seq.length;
  if (L === 0) return [];
  const haystack = circular ? seq + seq : seq;
  const out: Feature[] = [];

  for (const cf of COMMON_FEATURES) {
    const fwd = cf.bp.toUpperCase();
    const rev = reverseComplement(fwd);
    for (const [needle, strand] of [
      [fwd, 1],
      [rev, -1],
    ] as const) {
      let i = haystack.indexOf(needle);
      while (i !== -1 && i < L) {
        const startBase = i + 1; // 1-based
        const endBase = ((i + needle.length - 1) % L) + 1;
        out.push({ name: cf.name, type: cf.type, start: startBase, end: endBase, strand });
        i = haystack.indexOf(needle, i + 1);
      }
    }
  }
  // De-duplicate identical (name,start) hits that circular doubling can produce.
  const seen = new Set<string>();
  return out.filter((f) => {
    const k = `${f.name}:${f.start}:${f.strand}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
