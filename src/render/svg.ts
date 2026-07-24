import type { Feature, PlasmidRecord, RenderOptions } from '../types';
import { featureColor } from './color';
import { detectCommonFeatures } from '../detect/features';
import { findCutters, DEFAULT_ENZYMES } from '../detect/restriction';
import {
  pointOnCircle,
  arcsOverlap,
  spanToArc,
  arcBandPath,
  normAngle,
  f,
  type Point,
} from './geometry';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function line(p1: Point, p2: Point, stroke: string, width: number): string {
  return `<line x1="${p1[0].toFixed(2)}" y1="${p1[1].toFixed(2)}" x2="${p2[0].toFixed(2)}" y2="${p2[1].toFixed(2)}" stroke="${stroke}" stroke-width="${width}"/>`;
}

/**
 * Wrap a plasmid title into lines that fit within `maxWidth` px. Names are
 * often long single tokens (e.g. "pSpCas9(BB)-2A-GFP-PX458"), so we break
 * after separators (space, "-", "_", ")") as well as between words, and
 * hard-break any remaining run that is still too wide. Width is estimated from
 * an average glyph ratio since the renderer has no DOM to measure real text.
 */
function wrapTitle(text: string, maxWidth: number, fontSize: number): string[] {
  const charW = fontSize * 0.58; // approx avg glyph width for the serif title
  const maxChars = Math.max(4, Math.floor(maxWidth / charW));
  if (text.length <= maxChars) return [text];
  // Keep each separator attached to the preceding chunk so a break lands
  // *after* the "-" / "_" / ")" / "." rather than orphaning it onto the next
  // line. Dots matter for AAV-style names (e.g. "pAAV.CBA.loxP.WPRE.SV40")
  // which are otherwise a single unbreakable token.
  const chunks = text.match(/[^\s_).\-]+[\s_).\-]*/g) ?? [text];
  const lines: string[] = [];
  let line = '';
  for (let chunk of chunks) {
    // A single chunk wider than a full line: hard-break it.
    while (chunk.length > maxChars) {
      const take = maxChars - line.length;
      if (take > 0) {
        line += chunk.slice(0, take);
        chunk = chunk.slice(take);
      }
      lines.push(line.trimEnd());
      line = '';
    }
    if (line.length > 0 && line.length + chunk.length > maxChars) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += chunk;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

interface Laid {
  feature: Feature;
  /** Index of the feature in the input record.features array. */
  index: number;
  startAngle: number;
  arcLen: number;
  lane: number;
}

/**
 * Assign each feature to a radial lane so overlapping features stack outward
 * instead of colliding. Larger features are placed first (inner lanes) so the
 * dominant backbone elements read clearly.
 */
function assignLanes(features: Laid[]): number {
  const lanes: Laid[][] = [];
  const sorted = [...features].sort((a, b) => b.arcLen - a.arcLen);
  for (const item of sorted) {
    let placed = false;
    for (let l = 0; l < lanes.length; l++) {
      const clash = lanes[l].some((o) =>
        arcsOverlap(item.startAngle, item.arcLen, o.startAngle, o.arcLen)
      );
      if (!clash) {
        item.lane = l;
        lanes[l].push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      item.lane = lanes.length;
      lanes.push([item]);
    }
  }
  return lanes.length;
}

/**
 * Render a plasmid as a standalone SVG string. Pure function — no DOM, no
 * external libraries — so it runs identically in Node (wiki pre-render, tests)
 * and the browser.
 */
export function renderPlasmidSVG(record: PlasmidRecord, opts: RenderOptions = {}): string {
  const size = opts.size ?? 800;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.3;
  const circular = record.circular ?? true;

  const seq = record.sequence.replace(/[^ACGTacgt]/g, '');
  const length = seq.length;

  const parts: string[] = [];
  const defs: string[] = [];

  // ---- backbone ----
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${radius.toFixed(2)}" fill="none" stroke="#2b2f36" stroke-width="2.5"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${(radius - 4).toFixed(2)}" fill="none" stroke="#2b2f36" stroke-width="1"/>`
  );

  // ---- bp ruler ----
  if ((opts.showTicks ?? true) && length > 0) {
    const step = tickStep(length);
    for (let bp = 0; bp < length; bp += step) {
      const angle = (bp / length) * 360;
      const p1 = pointOnCircle(cx, cy, radius - 4, angle);
      const p2 = pointOnCircle(cx, cy, radius - 12, angle);
      const lp = pointOnCircle(cx, cy, radius - 22, angle);
      parts.push(line(p1, p2, '#9aa0a6', 1));
      parts.push(
        `<text x="${lp[0].toFixed(2)}" y="${lp[1].toFixed(2)}" font-size="10" fill="#9aa0a6" text-anchor="middle" dominant-baseline="middle" font-family="monospace">${bp}</text>`
      );
    }
  }

  // ---- features ----
  let features = record.features ?? [];
  if (features.length === 0 && (opts.detectFeatures ?? true) && length > 0) {
    features = detectCommonFeatures(seq, circular);
  }

  const externalLabels: Array<{ angle: number; anchorR: number; text: string; color: string }> = [];

  // Innermost radius still clear of feature bands. The centre title must fit
  // inside this zone, otherwise a long name overlaps the structures. Updated
  // to the deepest lane once the feature layout is known below.
  let innerClearR = radius - 28;

  if ((opts.showFeatures ?? true) && features.length > 0 && length > 0) {
    const laid: Laid[] = features
      .map((ft, index) => ({ ft, index }))
      .filter((x) => x.ft.start >= 1 && x.ft.start <= length)
      .map(({ ft, index }) => {
        const { startAngle, arcLen } = spanToArc(ft.start, ft.end, length, circular);
        return { feature: ft, index, startAngle, arcLen, lane: 0 };
      });

    const laneCount = assignLanes(laid);
    const laneW = Math.min(30, (radius - 52) / Math.max(1, laneCount));
    const band = Math.max(13, laneW - 4);
    innerClearR = radius - 28 - (laneCount - 1) * laneW - band;

    for (const it of laid) {
      const outerR = radius - 28 - it.lane * laneW;
      const innerR = outerR - band;
      const col = featureColor(it.feature.name, it.feature.type);
      const strand = it.feature.strand ?? 0;
      const headAt: 0 | 1 | -1 = strand === 1 ? 1 : strand === -1 ? -1 : 0;
      const headDeg = Math.min(7, it.arcLen / 2);
      const d = arcBandPath(cx, cy, innerR, outerR, it.startAngle, it.arcLen, headAt, headDeg);
      parts.push(
        `<path class="feature" data-fi="${it.index}" data-name="${esc(it.feature.name)}"` +
          ` data-type="${esc(it.feature.type ?? '')}" data-start="${it.feature.start}"` +
          ` data-end="${it.feature.end}" data-strand="${it.feature.strand ?? 0}"` +
          ` d="${d}" fill="${col.fill}" stroke="${col.border}" stroke-width="1"` +
          ` stroke-linejoin="round"><title>${esc(it.feature.name)} (${it.feature.start}–${it.feature.end})</title></path>`
      );

      const midAngle = normAngle(it.startAngle + it.arcLen / 2);
      const midR = (innerR + outerR) / 2;

      if (it.arcLen >= 26) {
        // On-arc curved label for wide features.
        const id = `arc${defs.length}`;
        const bottom = midAngle > 90 && midAngle < 270;
        const a0 = it.startAngle;
        const a1 = it.startAngle + it.arcLen;
        const large = it.arcLen > 180 ? 1 : 0;
        const rTxt = midR;
        let dPath: string;
        if (bottom) {
          const s = pointOnCircle(cx, cy, rTxt, a1);
          const e = pointOnCircle(cx, cy, rTxt, a0);
          dPath = `M${f(s)} A${rTxt} ${rTxt} 0 ${large} 0 ${f(e)}`;
        } else {
          const s = pointOnCircle(cx, cy, rTxt, a0);
          const e = pointOnCircle(cx, cy, rTxt, a1);
          dPath = `M${f(s)} A${rTxt} ${rTxt} 0 ${large} 1 ${f(e)}`;
        }
        defs.push(`<path id="${id}" d="${dPath}" fill="none"/>`);
        parts.push(
          `<text font-size="11" fill="${col.border}" font-family="sans-serif" font-weight="600" dominant-baseline="central"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(it.feature.name)}</textPath></text>`
        );
      } else if (it.arcLen >= 3) {
        externalLabels.push({
          angle: midAngle,
          anchorR: outerR,
          text: it.feature.name,
          color: col.border,
        });
      }
    }
  }

  // ---- restriction cutters: tick marks now; labels merged with feature labels
  // below so a cutter label never overlaps a feature label ----
  if ((opts.showCutters ?? true) && length > 0) {
    const enzymes = opts.enzymes ?? DEFAULT_ENZYMES;
    const cutters = findCutters(seq, circular, enzymes, opts.maxCutFrequency ?? 1);
    for (const c of cutters) {
      for (const pos of c.positions) {
        const angle = (pos / length) * 360;
        const p1 = pointOnCircle(cx, cy, radius - 2, angle);
        const p2 = pointOnCircle(cx, cy, radius + 10, angle);
        parts.push(line(p1, p2, '#5f6368', 1));
        externalLabels.push({ angle, anchorR: radius + 10, text: `${c.enzyme} (${pos + 1})`, color: '#3c4043' });
      }
    }
  }

  // ---- external labels: feature + cutter labels de-collided together ----
  parts.push(...layoutExternalLabels(externalLabels, cx, cy, radius, size));

  // ---- centre title (wrapped + recentred to fit the clear inner zone) ----
  const rawTitle = opts.title ?? record.name ?? 'plasmid';
  // Pin the locale so the rendered SVG is identical on every host (a German
  // default locale would otherwise emit "2.000 bp" instead of "2,000 bp").
  const subtitle = `${length.toLocaleString('en-US')} bp${circular ? '' : ' · linear'}`;
  // Constrain the title to the clear inner circle so it never overlaps the
  // feature bands; keep a small readable floor for pathological many-lane maps.
  const maxTitleW = Math.max(96, innerClearR * 2 * 0.85);
  let titleSize = 20;
  let subSize = 14;
  let subGap = 22;
  const titleLines = wrapTitle(rawTitle, maxTitleW, titleSize);
  let lineH = titleSize * 1.15;
  let blockH = titleLines.length * lineH + subGap;
  // If the stacked block is taller than the clear zone, shrink it uniformly so
  // the whole title still fits vertically inside the inner circle.
  const maxBlockH = innerClearR * 2 * 0.9;
  if (blockH > maxBlockH) {
    const s = Math.max(0.5, maxBlockH / blockH);
    titleSize *= s;
    subSize *= s;
    subGap *= s;
    lineH *= s;
    blockH *= s;
  }
  // Baseline of the first title line, so the block is vertically centred on cy.
  let ty = cy - blockH / 2 + titleSize;
  for (const ln of titleLines) {
    parts.push(
      `<text x="${cx}" y="${ty.toFixed(2)}" font-size="${titleSize.toFixed(2)}" font-weight="700" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" fill="#202124">${esc(ln)}</text>`
    );
    ty += lineH;
  }
  parts.push(
    `<text x="${cx}" y="${ty.toFixed(2)}" font-size="${subSize.toFixed(2)}" text-anchor="middle" font-family="Georgia, serif" fill="#5f6368">${esc(subtitle)}</text>`
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" font-family="sans-serif">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    parts.join('') +
    `</svg>`
  );
}

/** Choose a round ruler step (1k, 2k, 5k, …) yielding ~8–14 ticks. */
function tickStep(length: number): number {
  const target = length / 10;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= target) return m * pow;
  return 10 * pow;
}

/** Horizontal breathing room kept between a label and the canvas edge. */
const LABEL_PAD = 4;
/** Preferred gap between the ring and the label column. */
const LABEL_LEAD = 46;
/** Shortest leader we will draw before wrapping the text instead. */
const MIN_LABEL_LEAD = 10;

/**
 * Place external labels outside the map with leader lines, stacking them
 * vertically within each hemisphere so they don't overlap.
 *
 * The label column is pulled inwards until the *text* fits the canvas, not
 * just its anchor point — a long name like "chicken β-actin promoter" used to
 * start at the preferred offset and run straight off the viewBox. When even
 * the shortest leader leaves too little room, the label wraps onto extra lines
 * and the vertical packing accounts for the taller block.
 */
function layoutExternalLabels(
  labels: Array<{ angle: number; anchorR: number; text: string; color: string }>,
  cx: number,
  cy: number,
  radius: number,
  size: number,
  compact = false
): string[] {
  if (labels.length === 0) return [];
  const out: string[] = [];
  const rowH = compact ? 13 : 15;
  const fontSize = compact ? 10 : 11;
  const lineH = fontSize + 2;
  // Average sans-serif glyph width; the renderer has no DOM to measure with.
  const charW = fontSize * 0.55;
  const textWidth = (s: string) => s.length * charW;

  for (const side of ['right', 'left'] as const) {
    const group = labels
      .filter((l) => (side === 'right' ? l.angle <= 180 : l.angle > 180))
      .map((l) => {
        const anchor = pointOnCircle(cx, cy, l.anchorR, l.angle) as Point;
        return { ...l, anchor, y: anchor[1] };
      })
      .sort((a, b) => a.y - b.y);
    if (group.length === 0) continue;

    // Slide the column towards the ring until the widest label fits, but never
    // closer than MIN_LABEL_LEAD so the leader line stays visible.
    const widest = Math.max(...group.map((g) => textWidth(g.text)));
    const x =
      side === 'right'
        ? Math.max(cx + radius + MIN_LABEL_LEAD, Math.min(cx + radius + LABEL_LEAD, size - LABEL_PAD - widest))
        : Math.min(cx - radius - MIN_LABEL_LEAD, Math.max(cx - radius - LABEL_LEAD, LABEL_PAD + widest));

    // Whatever room is left at that column is the hard budget for the text.
    const avail = side === 'right' ? size - LABEL_PAD - x : x - LABEL_PAD;
    const rows = group.map((g) => {
      const lines = textWidth(g.text) <= avail ? [g.text] : wrapTitle(g.text, avail, fontSize);
      return { ...g, lines, h: Math.max(rowH, lines.length * lineH) };
    });

    // Push apart so neighbouring blocks never touch, then keep the whole
    // column inside the canvas: shift up if it overruns the bottom, and clamp
    // at the top so a tall stack cannot be pushed off the other edge.
    for (let i = 1; i < rows.length; i++) {
      const minGap = (rows[i - 1].h + rows[i].h) / 2;
      if (rows[i].y - rows[i - 1].y < minGap) rows[i].y = rows[i - 1].y + minGap;
    }
    const last = rows[rows.length - 1];
    const overflow = last.y + last.h / 2 - (size - LABEL_PAD);
    if (overflow > 0) for (const r of rows) r.y -= overflow;
    const underflow = LABEL_PAD - (rows[0].y - rows[0].h / 2);
    if (underflow > 0) for (const r of rows) r.y += underflow;

    const elbowX = side === 'right' ? x - 6 : x + 6;
    for (const r of rows) {
      out.push(
        `<polyline points="${r.anchor[0].toFixed(2)},${r.anchor[1].toFixed(2)} ${elbowX.toFixed(2)},${r.y.toFixed(2)} ${x.toFixed(2)},${r.y.toFixed(2)}" fill="none" stroke="#c0c4c9" stroke-width="0.8"/>`
      );
      // Centre a wrapped block on the leader so the line meets its middle.
      const top = r.y - ((r.lines.length - 1) * lineH) / 2;
      r.lines.forEach((lineText, i) => {
        out.push(
          `<text x="${x.toFixed(2)}" y="${(top + i * lineH + 3).toFixed(2)}" font-size="${fontSize}" fill="${r.color}" text-anchor="${side === 'right' ? 'start' : 'end'}" font-family="sans-serif">${esc(lineText)}</text>`
        );
      });
    }
  }
  return out;
}
