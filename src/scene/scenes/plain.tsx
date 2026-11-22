import { centerOut, rect } from "../hang";
import type { SceneDef } from "../types";

const ASPECT = 16 / 9;

function Background() {
  return <div className="scene-bg-plain" aria-hidden />;
}

/** Placeholder scene: plain panel, cards fill outward from the middle. */
export const plainScene: SceneDef = {
  id: "plain",
  name: "Plain",
  aspect: ASPECT,
  Background,
  cardWidth: 0.032,
  slots: centerOut({
    center: { x: 0.5, y: 0.48 },
    spacing: { x: 0.055, y: 0.14 },
    region: rect(0.04, 0.08, 0.96, 0.66),
    aspect: ASPECT,
  }),
  overflowAt: { x: 0.5, y: 0.72 },
  loopAt: { x: 0.5, y: 0.85, width: 0.6 },
};
