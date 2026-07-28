import type { Feature, PlasmidRecord, Strand } from '../types';

/**
 * Parse a GenBank flat file into a {@link PlasmidRecord}. Handles the LOCUS
 * topology, DEFINITION, the FEATURES table (with /label, /gene, /product
 * qualifiers and complement()/join() locations) and the ORIGIN sequence.
 * Robust to the common variations produced by SnapGene, Benchling and NCBI.
 */
export function parseGenBank(text: string): PlasmidRecord {
  const lines = text.split(/\r?\n/);

  let name = 'plasmid';
  let circular = true;
  let definition: string | undefined;

  // ---- header ----
  let inDefinition = false;
  for (const l of lines) {
    if (l.startsWith('LOCUS')) {
      inDefinition = false;
      const parts = l.split(/\s+/);
      if (parts[1]) name = parts[1];
      if (/\blinear\b/i.test(l)) circular = false;
      if (/\bcircular\b/i.test(l)) circular = true;
    } else if (l.startsWith('DEFINITION')) {
      definition = l.slice(10).trim();
      inDefinition = true;
    } else if (inDefinition && /^ {2,}\S/.test(l)) {
      // DEFINITION wraps onto indented continuation lines.
      definition = `${definition} ${l.trim()}`.trim();
    } else if (/^\S/.test(l)) {
      inDefinition = false;
    }
    if (l.startsWith('FEATURES') || l.startsWith('ORIGIN')) break;
  }

  // ---- features ----
  const features: Feature[] = [];
  let inFeatures = false;
  let cur: { location: string; type: string; quals: Record<string, string> } | null = null;
  // Which qualifier (if any) is still open across continuation lines, and
  // whether its value is a quoted string that has not been closed yet.
  let curQual: string | null = null;
  let qualOpen = false;

  const flush = () => {
    if (!cur) return;
    const loc = parseLocation(cur.location);
    if (loc) {
      const nm = cur.quals.label || cur.quals.gene || cur.quals.product || cur.quals.note || cur.type;
      if (cur.type !== 'source') {
        features.push({ name: nm, type: cur.type, start: loc.start, end: loc.end, strand: loc.strand });
      }
    }
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('FEATURES')) {
      inFeatures = true;
      continue;
    }
    if (!inFeatures) continue;
    if (l.startsWith('ORIGIN') || l.startsWith('//')) {
      flush();
      break;
    }
    // Feature key line: 5 spaces, key, location. Qualifier: 21 spaces + /key.
    const featMatch = /^ {5}(\S+)\s+(.+)$/.exec(l);
    const isQual = /^ {21}\//.test(l);
    if (featMatch && !isQual) {
      flush();
      cur = { type: featMatch[1], location: featMatch[2].trim(), quals: {} };
      curQual = null;
      qualOpen = false;
    } else if (cur) {
      const qm = /^ +\/(\w+)=?(.*)$/.exec(l);
      if (qm) {
        const raw = qm[2].trim();
        curQual = qm[1];
        // A value that opens with a quote runs until the closing quote, which
        // may be several lines down.
        qualOpen = raw.startsWith('"') && !(raw.length > 1 && raw.endsWith('"'));
        cur.quals[curQual] = stripQuotes(raw);
      } else if (/^ {21}\S/.test(l)) {
        const text = l.trim();
        if (qualOpen && curQual) {
          // Continuation of a multi-line qualifier value. Appending this to the
          // location instead (as an earlier version did) let a stray "100..190"
          // in a /note rewrite the feature's coordinates.
          const closes = text.endsWith('"');
          cur.quals[curQual] = `${cur.quals[curQual]} ${stripQuotes(text)}`.trim();
          if (closes) qualOpen = false;
        } else if (curQual === null) {
          // Continuation of a multi-line location — only possible before any
          // qualifier has been seen for this feature.
          cur.location += text;
        }
      }
    }
  }

  // ---- sequence ----
  let sequence = '';
  const originIdx = lines.findIndex((l) => l.startsWith('ORIGIN'));
  if (originIdx !== -1) {
    for (let i = originIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('//')) break;
      sequence += l.replace(/[^A-Za-z]/g, '');
    }
  }

  return { name, sequence, circular, definition, features };
}

/** Drop the surrounding double quotes GenBank wraps free-text values in. */
function stripQuotes(s: string): string {
  return s.replace(/^"/, '').replace(/"$/, '').trim();
}

/** Parse a GenBank location string into 1-based inclusive start/end + strand. */
function parseLocation(loc: string): { start: number; end: number; strand: Strand } | null {
  const strand: Strand = /complement/i.test(loc) ? -1 : 1;
  const nums = [...loc.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  if (nums.length === 0) return null;

  const ranges: Array<[number, number]> = [];
  const re = /(\d+)\.\.(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(loc))) ranges.push([Number(m[1]), Number(m[2])]);

  if (ranges.length === 0) {
    // single-base feature like "complement(345)"
    return { start: nums[0], end: nums[0], strand };
  }
  if (ranges.length === 1) {
    return { start: ranges[0][0], end: ranges[0][1], strand };
  }
  // join(): keep the start of the first range and the end of the last. When
  // the location wraps the origin the last range ends below the first's start,
  // which is exactly the start > end encoding the renderer expects; a spliced
  // (multi-exon) join collapses to its full extent, introns included, which is
  // the right read for a whole-molecule map.
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  return { start: first[0], end: last[1], strand };
}
