import type { PlasmidRecord } from '../types';

/**
 * Parse a FASTA record. The first record's header becomes the name; all
 * sequence lines are concatenated. FASTA carries no annotations or topology,
 * so features are empty and the molecule defaults to circular (most user
 * pastes are plasmids); callers can override via the render options.
 */
export function parseFasta(text: string): PlasmidRecord {
  const lines = text.split(/\r?\n/);
  let name = 'sequence';
  const seq: string[] = [];
  let started = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith('>')) {
      if (started) break; // only the first record
      // Trim first: "> pUC19" is as common as ">pUC19", and splitting the
      // untrimmed remainder yields an empty first field and loses the name.
      name = l.slice(1).trim().split(/[\s|]/)[0] || 'sequence';
      started = true;
      continue;
    }
    // Sequence lines before the first header aren't part of this record.
    if (l && (started || !text.includes('>'))) seq.push(l);
  }
  return { name, sequence: seq.join('').replace(/[^A-Za-z]/g, ''), circular: true, features: [] };
}
