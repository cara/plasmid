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
  // Fold ambiguity codes to N instead of deleting them: they occupy a base
  // position that the returned 1-based coordinates have to line up with, and
  // an N can never match a probe anyway.
  const seq = sequence.replace(/[^A-Za-z]/g, '').toUpperCase().replace(/[^ACGT]/g, 'N');
  const L = seq.length;
  if (L === 0) return [];
  const out: Feature[] = [];

  for (const cf of COMMON_FEATURES) {
    const fwd = cf.bp.toUpperCase();
    const rev = reverseComplement(fwd);
    // Only the longest probe can straddle the origin, so a `needle.length - 1`
    // tail is all the wrap-around a search needs — doubling a 200 kb sequence
    // per probe is pure waste.
    const haystack = circular ? seq + seq.slice(0, Math.max(0, fwd.length - 1)) : seq;
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
