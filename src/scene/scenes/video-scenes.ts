import { videoBackground } from "../backgrounds/video";
import { centerOut, rect } from "../hang";
import type { SceneDef } from "../types";

/**
 * Looping-video scenes. Footage: Mixkit (Stock Video Free License) — see
 * public/scenes/CREDITS.md. All clips are 16:9.
 */
const ASPECT = 16 / 9;

/** Cards spread outward from the middle; the bottom is kept for the revealed loop. */
const wholeFrame = centerOut({
  center: { x: 0.5, y: 0.5 },
  spacing: { x: 0.055, y: 0.14 },
  region: rect(0.04, 0.08, 0.96, 0.66),
  aspect: ASPECT,
});

/** Cards strung across the top like a garland, keeping the fire visible. */
const garland = centerOut({
  center: { x: 0.5, y: 0.18 },
  spacing: { x: 0.055, y: 0.13 },
  region: rect(0.04, 0.06, 0.96, 0.46),
  aspect: ASPECT,
});

export const treeScene: SceneDef = {
  id: "tree",
  name: "Christmas tree",
  aspect: ASPECT,
  Background: videoBackground("/scenes/tree"),
  slots: wholeFrame,
  overflowAt: { x: 0.5, y: 0.72 },
  loopAt: { x: 0.5, y: 0.85, width: 0.6 },
  cardWidth: 0.032,
  dim: 0.15,
};

export const treeLightsScene: SceneDef = {
  id: "tree-lights",
  name: "Tree lights",
  aspect: ASPECT,
  Background: videoBackground("/scenes/tree-lights"),
  slots: wholeFrame,
  overflowAt: { x: 0.5, y: 0.72 },
  loopAt: { x: 0.5, y: 0.85, width: 0.6 },
  cardWidth: 0.032,
  dim: 0,
};

export const fireplaceScene: SceneDef = {
  id: "fireplace",
  name: "Fireplace",
  aspect: ASPECT,
  Background: videoBackground("/scenes/fireplace"),
  slots: garland,
  overflowAt: { x: 0.5, y: 0.53 },
  loopAt: { x: 0.5, y: 0.8, width: 0.6 },
  cardWidth: 0.032,
  dim: 0.2,
};

export const fireplaceLogsScene: SceneDef = {
  id: "fireplace-logs",
  name: "Log fire",
  aspect: ASPECT,
  Background: videoBackground("/scenes/fireplace-logs"),
  slots: garland,
  overflowAt: { x: 0.5, y: 0.53 },
  loopAt: { x: 0.5, y: 0.8, width: 0.6 },
  cardWidth: 0.032,
  dim: 0.2,
};
