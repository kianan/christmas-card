import { plainCards } from "./cards/plain";
import { plainScene } from "./scenes/plain";
import {
  fireplaceLogsScene,
  fireplaceScene,
  treeLightsScene,
  treeScene,
} from "./scenes/video-scenes";
import type { CardArt, SceneDef } from "./types";

export type { CardArt, SceneDef, StageCard } from "./types";
export { Stage } from "./Stage";

/** Scenes in switching order (S key cycles through them). */
export const sceneList: SceneDef[] = [
  treeScene,
  treeLightsScene,
  fireplaceScene,
  fireplaceLogsScene,
  plainScene, // lightweight fallback for slow TV browsers
];

export const defaultScene: SceneDef = treeScene;

export function getScene(id: string | null | undefined): SceneDef {
  return sceneList.find((s) => s.id === id) ?? defaultScene;
}

export function nextScene(id: string): SceneDef {
  const i = sceneList.findIndex((s) => s.id === id);
  return sceneList[(i + 1) % sceneList.length];
}

/** Active card art. */
export const cardArt: CardArt = plainCards;
