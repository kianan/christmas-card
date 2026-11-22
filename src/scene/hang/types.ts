/** Positions are fractions of the stage (0–1), so they scale with any screen. */
export interface Point {
  x: number;
  y: number;
}

/** Where one card hangs. Slot i always belongs to card i, so cards never jump. */
export interface Slot extends Point {
  rotate: number; // degrees of tilt, for a hand-hung look
}

/** Area cards may hang in, e.g. the tree's triangle or the mantel's garland. */
export type Region = (p: Point) => boolean;
