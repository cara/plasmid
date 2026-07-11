/**
 * @cara/plasmid — a small, dependency-free plasmid map renderer.
 *
 * Turns a nucleotide sequence (or a FASTA / GenBank file) into a standalone
 * circular plasmid-map SVG. Pure functions, no DOM and no runtime
 * dependencies, so it runs the same in Node (server / static pre-render) and
 * the browser.
 *
 * @example
 * ```ts
 * import { renderPlasmidSVG, parsePlasmid } from '@cara/plasmid';
 * const record = parsePlasmid(fastaText);   // or GenBank, or raw sequence
 * const svg = renderPlasmidSVG(record);
 * ```
 */
export { renderPlasmidSVG } from './render/svg';
export { featureColor } from './render/color';
export {
  findSites,
  findCutters,
  reverseComplement,
  DEFAULT_ENZYMES,
} from './detect/restriction';
export { detectCommonFeatures } from './detect/features';
export { COMMON_FEATURES } from './detect/common-features';
export {
  parsePlasmid,
  parseFasta,
  parseGenBank,
  parseRaw,
  detectFormat,
  type InputFormat,
} from './parse/index';
export type {
  Feature,
  PlasmidRecord,
  EnzymeSpec,
  RenderOptions,
  Strand,
} from './types';
