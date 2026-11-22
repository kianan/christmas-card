import type { Point, Region } from "./types";

export const everywhere: Region = () => true;

export const rect =
  (x0: number, y0: number, x1: number, y1: number): Region =>
  (p) =>
    p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;

/** Triangle (e.g. a tree): apex at the top, base corners at the bottom. */
export const triangle = (a: Point, b: Point, c: Point): Region => {
  const sign = (p: Point, q: Point, r: Point) =>
    (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  return (p) => {
    const d1 = sign(p, a, b);
    const d2 = sign(p, b, c);
    const d3 = sign(p, c, a);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
};

export const union =
  (...regions: Region[]): Region =>
  (p) =>
    regions.some((r) => r(p));
