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

  it('wraps a long title onto multiple centred lines', () => {
    const longName = 'pSpCas9(BB)-2A-GFP-PX458 super long variant name here';
    const svg = renderPlasmidSVG({ ...record, name: longName });
    const lines = [...svg.matchAll(/font-weight="700"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(lines.length).toBeGreaterThan(1);
    // Reassembling the wrapped lines reproduces the original name.
    expect(lines.join(' ').replace(/\s+/g, ' ')).toContain('pSpCas9');
    expect(lines.join('')).toContain('PX458');
    // A short title stays on a single line.
    const shortSvg = renderPlasmidSVG({ ...record, name: 'pUC19' });
    const shortLines = [...shortSvg.matchAll(/font-weight="700"[^>]*>([^<]*)</g)];
    expect(shortLines).toHaveLength(1);
  });

  it('wraps a dot-separated AAV name at the dots', () => {
    const dotName = 'pAAV.CBA.loxP.ArcLightD.2A.nlsmCherry.loxP.WPRE.SV40';
    const svg = renderPlasmidSVG({ ...record, name: dotName });
    const lines = [...svg.matchAll(/font-weight="700"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(lines.length).toBeGreaterThan(1);
    // Reassembling the wrapped lines reproduces the original name.
    expect(lines.join('')).toBe(dotName);
    // Breaks land after a dot, not mid-token.
    for (const line of lines.slice(0, -1)) {
      expect(line.endsWith('.')).toBe(true);
    }
  });

  /**
   * Estimated horizontal extent of every external (leader-line) label. These
   * are the only texts anchored 'start'/'end'; ruler and title texts are
   * centred and stay well inside the map.
   */
  const externalLabelExtents = (svg: string) =>
    [
      ...svg.matchAll(
        /<text x="([-\d.]+)" y="[-\d.]+" font-size="([\d.]+)"[^>]*text-anchor="(start|end)"[^>]*>([^<]*)<\/text>/g
      ),
    ].map(([, xs, fs, anchor, text]) => {
      const x = Number(xs);
      const w = text.length * Number(fs) * 0.55;
      return anchor === 'start' ? { text, left: x, right: x + w } : { text, left: x - w, right: x };
    });

  it('keeps long external labels inside the canvas', () => {
    // Names long enough that the label column has to give ground, on both
    // hemispheres so the left and right branches are both exercised.
    const longNames = {
      ...record,
      features: [
        { name: 'chicken β-actin promoter', type: 'promoter', start: 60, end: 90, strand: 1 as const },
        { name: 'woodchuck hepatitis post-transcriptional regulatory element', start: 500, end: 530, strand: 1 as const },
        { name: 'bovine growth hormone polyadenylation signal', start: 1100, end: 1130, strand: -1 as const },
        { name: 'internal ribosome entry site from EMCV', start: 1600, end: 1630, strand: -1 as const },
      ],
    };

    for (const size of [500, 640, 800, 1000]) {
      const labels = externalLabelExtents(renderPlasmidSVG(longNames, { size }));
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) {
        expect(l.left, `"${l.text}" overflows left at size ${size}`).toBeGreaterThanOrEqual(-0.5);
        expect(l.right, `"${l.text}" overflows right at size ${size}`).toBeLessThanOrEqual(size + 0.5);
      }
    }
  });

  it('wraps an external label rather than truncating it', () => {
    const name = 'woodchuck hepatitis post-transcriptional regulatory element';
    // A small canvas leaves too little room even at the shortest leader, so
    // the label has to wrap; no part of the name may be dropped.
    const svg = renderPlasmidSVG(
      { ...record, features: [{ name, start: 500, end: 530, strand: 1 as const }] },
      { size: 500 }
    );
    const parts = externalLabelExtents(svg).map((l) => l.text);
    expect(parts.length).toBeGreaterThan(1);
    // A break may land on a space or, for a word wider than the whole column,
    // mid-token — so compare ignoring whitespace. The point is that every
    // character survives rather than being cut off at the canvas edge.
    expect(parts.join('').replace(/\s+/g, '')).toBe(name.replace(/\s+/g, ''));
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
