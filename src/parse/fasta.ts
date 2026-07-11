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
      name = l.slice(1).split(/[\s|]/)[0] || 'sequence';
      started = true;
      continue;
    }
    if (l) seq.push(l);
  }
  return { name, sequence: seq.join('').replace(/[^A-Za-z]/g, ''), circular: true, features: [] };
}
