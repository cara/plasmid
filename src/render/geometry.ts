/** Pure geometry helpers for laying out a circular plasmid map. No DOM. */

export type Point = [number, number];

/**
 * Point on a circle. Angle is in degrees, measured clockwise from the top
 * (12 o'clock = 0°), matching the reading direction of a plasmid map.
 */
export function pointOnCircle(cx: number, cy: number, radius: number, angleDeg: number): Point {
  const rad = (Math.PI / 180) * (angleDeg - 90);
  return [Math.cos(rad) * radius + cx, Math.sin(rad) * radius + cy];
}

/** Normalise any angle into [0, 360). */
export function normAngle(a: number): number {
  return ((a % 360) + 360) % 360;
}

/**
 * Do two angular arcs overlap on the circle? Each arc is (start, length) in
 * degrees, start normalised to [0,360). Handles wrap-around across the origin.
 */
export function arcsOverlap(startA: number, lenA: number, startB: number, lenB: number): boolean {
  // Sample-free interval overlap on a circle: shift B into A's frame.
  const delta = normAngle(startB - startA);
  return delta < lenA || delta + lenB > 360;
}

/**
 * Convert a 1-based inclusive [start,end] feature span to an angular arc.
 * Returns the start angle and the angular length (degrees). Origin-spanning
 * features (start > end on a circular molecule) wrap correctly.
 */
export function spanToArc(
  start: number,
  end: number,
  length: number,
  circular: boolean
): { startAngle: number; arcLen: number } {
  const perBase = 360 / length;
  // Feature occupies bases start..end inclusive; convert to 0-based half-open.
  const from = start - 1;
  let bases: number;
  if (end >= start) {
    bases = end - start + 1;
  } else if (circular) {
    bases = length - start + 1 + end; // wraps the origin
  } else {
    bases = Math.max(1, length - start + 1);
  }
  return { startAngle: normAngle(from * perBase), arcLen: bases * perBase };
}

/**
 * SVG path for a filled arc "band" between innerR and outerR spanning
 * [startAngle, startAngle+arcLen], optionally with a triangular arrowhead at
 * one end to indicate strand direction.
 *
 * @param headAt  0 = no head, 1 = head at the leading (end) edge (forward),
 *                -1 = head at the trailing (start) edge (reverse).
 */
export function arcBandPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  arcLen: number,
  headAt: 0 | 1 | -1,
  headDeg: number
): string {
  const midR = (innerR + outerR) / 2;
  const large = arcLen > 180 ? 1 : 0;
  const a0 = startAngle;
  const a1 = startAngle + arcLen;

  if (headAt === 0 || arcLen <= headDeg) {
    // Plain band (also used when the feature is too short for a head).
    const p1 = pointOnCircle(cx, cy, outerR, a0);
    const p2 = pointOnCircle(cx, cy, outerR, a1);
    const p3 = pointOnCircle(cx, cy, innerR, a1);
    const p4 = pointOnCircle(cx, cy, innerR, a0);
    return (
      `M${f(p1)} A${outerR} ${outerR} 0 ${large} 1 ${f(p2)}` +
      ` L${f(p3)} A${innerR} ${innerR} 0 ${large} 0 ${f(p4)} Z`
    );
  }

  if (headAt === 1) {
    // Body ends at a1-headDeg, head tip at a1 (mid radius).
    const bodyEnd = a1 - headDeg;
    const largeBody = bodyEnd - a0 > 180 ? 1 : 0;
    const o0 = pointOnCircle(cx, cy, outerR, a0);
    const oB = pointOnCircle(cx, cy, outerR, bodyEnd);
    const tip = pointOnCircle(cx, cy, midR, a1);
    const iB = pointOnCircle(cx, cy, innerR, bodyEnd);
    const i0 = pointOnCircle(cx, cy, innerR, a0);
    return (
      `M${f(o0)} A${outerR} ${outerR} 0 ${largeBody} 1 ${f(oB)}` +
      ` L${f(tip)} L${f(iB)}` +
      ` A${innerR} ${innerR} 0 ${largeBody} 0 ${f(i0)} Z`
    );
  }

  // headAt === -1: head at the start edge, body from a0+headDeg to a1.
  const bodyStart = a0 + headDeg;
  const largeBody = a1 - bodyStart > 180 ? 1 : 0;
  const oS = pointOnCircle(cx, cy, outerR, bodyStart);
  const o1 = pointOnCircle(cx, cy, outerR, a1);
  const i1 = pointOnCircle(cx, cy, innerR, a1);
  const iS = pointOnCircle(cx, cy, innerR, bodyStart);
  const tip = pointOnCircle(cx, cy, midR, a0);
  return (
    `M${f(oS)} A${outerR} ${outerR} 0 ${largeBody} 1 ${f(o1)}` +
    ` L${f(i1)} A${innerR} ${innerR} 0 ${largeBody} 0 ${f(iS)}` +
    ` L${f(tip)} Z`
  );
}

/** Format a point for an SVG path with fixed precision. */
export function f(p: Point): string {
  return `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
}
