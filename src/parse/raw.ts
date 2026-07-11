import type { PlasmidRecord } from '../types';

/**
 * Parse a bare nucleotide sequence (no header). Whitespace, digits (as in
 * GenBank-copied numbered lines) and other non-letters are stripped.
 */
export function parseRaw(text: string, name = 'sequence'): PlasmidRecord {
  return {
    name,
    sequence: text.replace(/[^A-Za-z]/g, ''),
    circular: true,
    features: [],
  };
}
