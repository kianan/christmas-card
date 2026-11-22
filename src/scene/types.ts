/**
 * Scene building blocks — each is swappable on its own:
 *
 *   SceneDef   background art + where cards hang (src/scene/scenes)
 *   CardArt    how a card looks hanging and when revealed (src/scene/cards)
 *   hang/      layout algorithms that turn a region into ordered slots
 *   Stage      puts them together at a fixed aspect ratio (src/scene/Stage.tsx)
 *
 * Animations will plug in as another module later.
 */
import type { ComponentType } from "react";
import type { CardContent } from "@/lib/crypto";
import type { Point, Slot } from "./hang";

export interface StageCard {
  id: string;
  revealed: boolean;
}

export interface SceneDef {
  id: string;
  name: string;
  /** Stage width ÷ height. Background art should match it. */
  aspect: number;
  /** Looping background: image, GIF, WebP or video. */
  Background: ComponentType;
  /** Ordered hang positions: card i uses slots[i]. */
  slots: Slot[];
  /** Where the "+N more" pile goes when every slot is taken. */
  overflowAt: Point;
  /** Card width as a fraction of stage width. */
  cardWidth: number;
  /** 0–1 dark wash over the background so cards stand out on busy footage. */
  dim?: number;
}

export interface HangingCardProps {
  revealed: boolean;
}

export interface RevealProps {
  content: CardContent;
  index: number; // 1-based position in the reveal order
  total: number;
}

export interface CardArt {
  name: string;
  HangingCard: ComponentType<HangingCardProps>;
  RevealCard: ComponentType<RevealProps>;
}
