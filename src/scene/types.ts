/**
 * The contract every art theme implements. Pages only talk to these
 * components, so a theme can be swapped without touching party logic.
 *
 * Planned additions for the art pass: Background, Fireplace, hangPoints and
 * animation variants (send / fly-to-tree / fly-to-front / open).
 */
import type { ComponentType } from "react";
import type { CardContent } from "@/lib/crypto";

export interface TreeCard {
  id: string;
  revealed: boolean;
}

export interface TreeProps {
  cards: TreeCard[];
}

export interface RevealProps {
  content: CardContent;
  index: number; // 1-based position in the reveal order
  total: number;
}

export interface Theme {
  name: string;
  Tree: ComponentType<TreeProps>;
  RevealCard: ComponentType<RevealProps>;
}
