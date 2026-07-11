import { describe, it, expect } from 'vitest';
import {
  renderPlasmidSVG,
  parsePlasmid,
  detectFormat,
  findSites,
  reverseComplement,
  detectCommonFeatures,
  COMMON_FEATURES,
} from '../src/index';
import { arcsOverlap, spanToArc } from '../src/render/geometry';

// Full AmpR CDS from the bundled panel, so detection has a real target.
const AMPR = COMMON_FEATURES.find((f) => f.name === 'AmpR')!.bp;

describe('restriction site finding', () => {
  it('finds EcoRI on the sense strand', () => {
    const seq = 'AAAAGAATTCAAAA';
    expect(findSites(seq, 'GAATTC', false)).toEqual([4]);
  });

  it('finds a site across the origin only when circular', () => {
    // GAATTC wraps: "GAA" at bp 12-14, "TTC" wraps to bp 0-2.
    const seq = 'TTCAAAAAAAAAGAA'; // length 15
    expect(findSites(seq, 'GAATTC', false)).toEqual([]);
    expect(findSites(seq, 'GAATTC', true)).toContain(12);
  });

  it('reverse-complements correctly', () => {
    expect(reverseComplement('GAATTC')).toBe('GAATTC'); // palindrome
    expect(reverseComplement('ATGC')).toBe('GCAT');
  });
});

describe('geometry', () => {
  it('spanToArc converts a simple forward span', () => {
    const { startAngle, arcLen } = spanToArc(1, 100, 400, true);
    expect(startAngle).toBe(0);
    expect(arcLen).toBeCloseTo((100 / 400) * 360, 5);
  });

  it('spanToArc wraps the origin when start > end', () => {
    const { arcLen } = spanToArc(390, 10, 400, true); // 390..400 + 1..10 = 21 bases
    expect(arcLen).toBeCloseTo((21 / 400) * 360, 5);
  });

  it('arcsOverlap detects wrap-around overlap', () => {
    expect(arcsOverlap(350, 30, 5, 10)).toBe(true); // 350-20 overlaps 5-15
    expect(arcsOverlap(10, 20, 100, 20)).toBe(false);
  });
});

describe('format detection & parsing', () => {
  it('detects FASTA, raw and GenBank', () => {
    expect(detectFormat('>seq1\nACGT')).toBe('fasta');
    expect(detectFormat('ACGTACGT')).toBe('raw');
    expect(detectFormat('LOCUS       x 100 bp')).toBe('genbank');
  });

  it('parses a FASTA record', () => {
    const rec = parsePlasmid('>pUC19 something\nACGTACGT\nACGT');
    expect(rec.name).toBe('pUC19');
    expect(rec.sequence).toBe('ACGTACGTACGT');
  });

  it('parses a minimal GenBank with a feature and sequence', () => {
    const gbk = [
      'LOCUS       test        20 bp    DNA     circular',
      'DEFINITION  a test plasmid.',
      'FEATURES             Location/Qualifiers',
      '     CDS             1..9',
      '                     /label="myGene"',
      'ORIGIN',
      '        1 atgctagcat gcatgcatgc',
      '//',
    ].join('\n');
    const rec = parsePlasmid(gbk);
    expect(rec.circular).toBe(true);
    expect(rec.sequence.toUpperCase()).toBe('ATGCTAGCATGCATGCATGC');
    expect(rec.features?.[0]).toMatchObject({ name: 'myGene', start: 1, end: 9, strand: 1 });
  });
});

describe('common-feature detection', () => {
  it('detects a bundled AmpR sequence embedded in a plasmid', () => {
    const seq = 'GATC'.repeat(50) + AMPR + 'TTAG'.repeat(50);
    const feats = detectCommonFeatures(seq, true);
    expect(feats.some((f) => f.name === 'AmpR')).toBe(true);
  });
});

describe('SVG rendering', () => {
  const record = {
    name: 'pTest',
    sequence: 'ACGT'.repeat(500), // 2000 bp
    circular: true,
    features: [
      { name: 'AmpR', type: 'CDS', start: 100, end: 900, strand: 1 as const },
      { name: 'ori', type: 'rep_origin', start: 1200, end: 1500, strand: -1 as const },
      { name: 'origin-spanner', start: 1950, end: 50, strand: 1 as const },
    ],
  };

  it('produces a valid SVG string', () => {
    const svg = renderPlasmidSVG(record);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 800 800"');
  });

  it('draws the title and bp count', () => {
    const svg = renderPlasmidSVG(record);
    expect(svg).toContain('pTest');
    expect(svg).toContain('2,000 bp');
  });

  it('renders each feature as a colored path', () => {
    const svg = renderPlasmidSVG(record);
    const paths = svg.match(/<path /g) ?? [];
    expect(paths.length).toBeGreaterThanOrEqual(3);
    expect(svg).toContain('AmpR');
  });

  it('escapes XML-unsafe names', () => {
    const svg = renderPlasmidSVG({ name: 'a & <b>', sequence: 'ACGT'.repeat(50) });
    expect(svg).toContain('a &amp; &lt;b&gt;');
    expect(svg).not.toContain('a & <b>');
  });

  it('handles an empty / tiny sequence without throwing', () => {
    expect(() => renderPlasmidSVG({ name: 'x', sequence: '' })).not.toThrow();
    expect(() => renderPlasmidSVG({ name: 'x', sequence: 'ACGT' })).not.toThrow();
  });
});
