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
  /** Removed by the host: not drawn, but keeps its slot so others don't move. */
  hidden?: boolean;
}

/** A revealed card shown in the looping display. */
export interface LoopItem {
  id: string;
  number?: number; // reveal number, shown as #N
  content: CardContent;
}

/** Where revealed cards loop: centre point + width, as stage fractions. */
export interface LoopArea extends Point {
  width: number;
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
  /** Where revealed cards fade in and out (keep it clear of the hang region). */
  loopAt: LoopArea;
}

export interface HangingCardProps {
  revealed: boolean;
}

export interface RevealProps {
  content: CardContent;
  /** Reveal number shown as #N — the host removes pranks by this number. */
  number?: number;
}

export interface LoopCardProps {
  content: CardContent;
  number?: number;
}

export interface CardArt {
  name: string;
  HangingCard: ComponentType<HangingCardProps>;
  RevealCard: ComponentType<RevealProps>;
  /** Compact card used in the looping display of revealed messages. */
  LoopCard: ComponentType<LoopCardProps>;
}
