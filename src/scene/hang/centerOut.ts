import { everywhere } from "./regions";
import type { Point, Region, Slot } from "./types";

export interface CenterOutOptions {
  /** First card hangs here; later cards fill outward from it. */
  center: Point;
  /** Gap between card positions, as a fraction of stage width / height. */
  spacing: { x: number; y: number };
  /** Only positions inside this area are used. */
  region?: Region;
  /** Stage width ÷ height, so "distance from the middle" is measured on screen. */
  aspect?: number;
  /** Shift every other row by half a gap (brick pattern) — looks less grid-like. */
  stagger?: boolean;
  /** Max random tilt per card, in degrees. */
  maxRotate?: number;
  /** Keep this far from the stage edges (fraction). */
  margin?: number;
}

/** Repeatable pseudo-random in [-1, 1] — the same card always gets the same tilt. */
function wobble(i: number): number {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Lays out card slots on a grid, ordered from the centre outward.
 *
 * The order never depends on how many cards there are, so slot 0 is always
 * the middle, slot 1 its nearest neighbour, and so on — a newly hung card
 * never moves an existing one.
 */
export function centerOut({
  center,
  spacing,
  region = everywhere,
  aspect = 16 / 9,
  stagger = true,
  maxRotate = 8,
  margin = 0.03,
}: CenterOutOptions): Slot[] {
  const rows = Math.ceil(1 / spacing.y) + 1;
  const cols = Math.ceil(1 / spacing.x) + 1;
  const candidates: (Point & { dist: number; angle: number })[] = [];

  for (let r = -rows; r <= rows; r++) {
    const shift = stagger && r % 2 !== 0 ? 0.5 : 0;
    for (let c = -cols; c <= cols; c++) {
      const x = center.x + (c + shift) * spacing.x;
      const y = center.y + r * spacing.y;
      if (x < margin || x > 1 - margin || y < margin || y > 1 - margin) continue;
      if (!region({ x, y })) continue;
      const dx = (x - center.x) * aspect;
      const dy = y - center.y;
      candidates.push({ x, y, dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) });
    }
  }

  candidates.sort((a, b) => a.dist - b.dist || a.angle - b.angle);
  return candidates.map(({ x, y }, i) => ({ x, y, rotate: wobble(i) * maxRotate }));
}
