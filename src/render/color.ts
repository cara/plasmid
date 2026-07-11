/**
 * Deterministic feature colouring. Well-known feature classes get fixed,
 * conventional colours (resistance genes red, origins grey, promoters green,
 * etc.); everything else is hashed to a stable pastel hue so the same label
 * always renders in the same colour across plasmids.
 */

export interface FeatureColor {
  fill: string;
  border: string;
}

/** FNV-1a hash → 32-bit unsigned. Stable across runs and platforms. */
function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/** Keyword → hue (degrees). Matched case-insensitively against the label. */
const KEYWORD_HUE: Array<[RegExp, number]> = [
  [/ampr|amp\b|bla\b|ampicillin/i, 0], // red
  [/kanr|kan\b|neor|neo\b|puror|puro|hygr|hygro|blast|zeo|resist/i, 12], // orange-red
  [/\bori\b|origin|rep_origin|f1 ori|colE1|pUC ori/i, 220], // blue-grey handled below
  [/prom|promoter|cmv|sv40|ef1|pgk|t7|t3|sp6|lac|tac|trc/i, 130], // green
  [/term|terminator|polya|poly\(a\)|pause/i, 275], // purple
  [/cds|orf|gene|cas9|gfp|rfp|mcherry|egfp|luc/i, 200], // cyan-blue
  [/primer|fwd|rev|sequencing/i, 45], // yellow
  [/tag|his|flag|myc|ha\b|halo|snap|gst|mbp/i, 320], // magenta
];

export function featureColor(name: string, type?: string): FeatureColor {
  const key = `${type ?? ''} ${name}`.trim();

  // Origins get a neutral grey — conventional on plasmid maps.
  if (/\bori\b|origin|rep_origin/i.test(key)) {
    return { fill: '#c9ccd1', border: '#7c8087' };
  }

  for (const [re, hue] of KEYWORD_HUE) {
    if (re.test(key)) {
      return { fill: hsl(hue, 62, 68), border: hsl(hue, 55, 42) };
    }
  }

  // Fall back to a stable hashed hue.
  const hue = fnv1a(name.toLowerCase()) % 360;
  return { fill: hsl(hue, 55, 72), border: hsl(hue, 48, 45) };
}
