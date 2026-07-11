import type { PlasmidRecord } from '../types';
import { parseFasta } from './fasta';
import { parseGenBank } from './genbank';
import { parseRaw } from './raw';

export type InputFormat = 'genbank' | 'fasta' | 'raw';

/** Sniff the input format from its leading content. */
export function detectFormat(text: string): InputFormat {
  const t = text.trimStart();
  if (/^LOCUS\s/i.test(t) || /^\s*ORIGIN\b/im.test(t) && /^\s*FEATURES\b/im.test(t)) return 'genbank';
  if (t.startsWith('>')) return 'fasta';
  return 'raw';
}

/**
 * Parse plasmid text in any supported format into a {@link PlasmidRecord}.
 * Format is auto-detected unless `format` is given.
 */
export function parsePlasmid(text: string, format?: InputFormat): PlasmidRecord {
  const fmt = format ?? detectFormat(text);
  switch (fmt) {
    case 'genbank':
      return parseGenBank(text);
    case 'fasta':
      return parseFasta(text);
    default:
      return parseRaw(text);
  }
}

export { parseFasta, parseGenBank, parseRaw };
