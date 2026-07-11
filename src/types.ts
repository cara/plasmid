/**
 * Public data model for the plasmid renderer.
 *
 * Coordinates follow the common annotation convention used by GenBank and
 * SnapGene: `start` and `end` are 1-based and inclusive. A feature that wraps
 * the origin of a circular molecule has `start > end`.
 */

/** Strand a feature lives on: 1 = forward (sense), -1 = reverse, 0/undefined = unstranded. */
export type Strand = 1 | -1 | 0;

export interface Feature {
  /** Human-readable label drawn on the map. */
  name: string;
  /** Optional feature class (e.g. "CDS", "promoter", "rep_origin"). Drives colour. */
  type?: string;
  /** 1-based inclusive start. */
  start: number;
  /** 1-based inclusive end. May be < start for origin-spanning features. */
  end: number;
  /** 1 forward, -1 reverse, 0/undefined unstranded. */
  strand?: Strand;
}

export interface PlasmidRecord {
  /** Display name, drawn in the centre of the map. */
  name: string;
  /** Raw nucleotide sequence. Non-ACGT characters are ignored for length/rendering. */
  sequence: string;
  /** Circular (plasmid) vs linear. Defaults to true. */
  circular?: boolean;
  /** Known annotations. When omitted, `detectFeatures` may fill these in. */
  features?: Feature[];
  /** Free-text description (GenBank DEFINITION, etc.). Not drawn, but carried through. */
  definition?: string;
}

export interface EnzymeSpec {
  /** Enzyme name, e.g. "EcoRI". */
  name: string;
  /** Recognition site on the sense strand, e.g. "GAATTC". */
  site: string;
}

export interface RenderOptions {
  /** SVG viewport size (square). Default 800. */
  size?: number;
  /** Draw restriction cut sites. Default true. */
  showCutters?: boolean;
  /** Only draw enzymes that cut exactly this many times (unique cutters read best). 0 = no filter. Default 1. */
  maxCutFrequency?: number;
  /** Enzymes to scan for. Defaults to a small common panel. */
  enzymes?: EnzymeSpec[];
  /** Draw feature arrows. Default true. */
  showFeatures?: boolean;
  /** Draw bp tick ruler. Default true. */
  showTicks?: boolean;
  /** When the record has no features, auto-detect a bundled common-feature panel. Default true. */
  detectFeatures?: boolean;
  /** Optional title override (defaults to record.name). */
  title?: string;
}
