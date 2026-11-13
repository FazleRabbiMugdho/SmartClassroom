// Seat-zone geometry (Level 9). All coordinates are NORMALIZED to 0..1 of the reference image,
// so the layout scales with any display size and any camera resolution.

export type Pt = [number, number];
export interface Box { x: number; y: number; w: number; h: number }
export interface Zone { seat_no: number; polygon: Pt[] }

/** A zone is occupied when a person's CENTRE lies inside it (ray casting). */
export function pointInPolygon([px, py]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const boxCentre = (b: Box): Pt => [b.x + b.w / 2, b.y + b.h / 2];

/** Sorted, de-duplicated seat numbers whose zone contains at least one person centre. */
export function occupiedSeats(boxes: Box[], zones: Zone[]): number[] {
  const centres = boxes.map(boxCentre);
  return zones
    .filter((z) => z.polygon.length >= 3 && centres.some((c) => pointInPolygon(c, z.polygon)))
    .map((z) => z.seat_no)
    .sort((a, b) => a - b);
}

export const rectToPolygon = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Validate/normalize a stored polygon (jsonb). Returns null if it is not a usable zone. */
export function parsePolygon(raw: unknown): Pt[] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const pts: Pt[] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "number" || typeof p[1] !== "number") return null;
    if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) return null;
    pts.push([p[0], p[1]]);
  }
  return pts;
}

/** Zones must not collapse to a sliver (a mis-click) — require a minimum area. */
export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}
