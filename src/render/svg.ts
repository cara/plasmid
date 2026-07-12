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

  // ---- centre title ----
  const title = esc(opts.title ?? record.name ?? 'plasmid');
  parts.push(
    `<text x="${cx}" y="${cy - 6}" font-size="20" font-weight="700" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" fill="#202124">${title}</text>`,
    `<text x="${cx}" y="${cy + 16}" font-size="14" text-anchor="middle" font-family="Georgia, serif" fill="#5f6368">${length.toLocaleString()} bp${circular ? '' : ' · linear'}</text>`
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

/**
 * Place external labels outside the map with leader lines, stacking them
 * vertically within each hemisphere so they don't overlap.
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
  const labelX = { right: Math.min(size - 4, cx + radius + 46), left: Math.max(4, cx - radius - 46) };

  for (const side of ['right', 'left'] as const) {
    const group = labels
      .filter((l) => (side === 'right' ? l.angle <= 180 : l.angle > 180))
      .map((l) => {
        const anchor = pointOnCircle(cx, cy, l.anchorR, l.angle) as Point;
        return { ...l, anchor, y: anchor[1] };
      })
      .sort((a, b) => a.y - b.y);

    // Push apart so consecutive rows keep at least rowH gap.
    for (let i = 1; i < group.length; i++) {
      if (group[i].y - group[i - 1].y < rowH) group[i].y = group[i - 1].y + rowH;
    }
    // Keep within canvas; if overflow, compress from the bottom.
    const overflow = group.length ? group[group.length - 1].y - (size - 6) : 0;
    if (overflow > 0) for (const g of group) g.y -= overflow;

    const x = side === 'right' ? labelX.right : labelX.left;
    for (const g of group) {
      const elbowX = side === 'right' ? x - 6 : x + 6;
      out.push(
        `<polyline points="${g.anchor[0].toFixed(2)},${g.anchor[1].toFixed(2)} ${elbowX.toFixed(2)},${g.y.toFixed(2)} ${x.toFixed(2)},${g.y.toFixed(2)}" fill="none" stroke="#c0c4c9" stroke-width="0.8"/>`
      );
      out.push(
        `<text x="${x.toFixed(2)}" y="${(g.y + 3).toFixed(2)}" font-size="${fontSize}" fill="${g.color}" text-anchor="${side === 'right' ? 'start' : 'end'}" font-family="sans-serif">${esc(g.text)}</text>`
      );
    }
  }
  return out;
}
