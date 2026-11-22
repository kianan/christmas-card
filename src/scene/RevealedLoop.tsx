"use client";

import { useEffect, useState, type ComponentType, type CSSProperties } from "react";
import type { LoopCardProps, LoopArea, LoopItem } from "./types";

interface RevealedLoopProps {
  cards: LoopItem[];
  area: LoopArea;
  LoopCard: ComponentType<LoopCardProps>;
  /** How long each card stays (including its fade in and out). */
  intervalMs?: number;
}

/** Cycles through revealed cards one at a time, fading each in and out. */
export function RevealedLoop({ cards, area, LoopCard, intervalMs = 7000 }: RevealedLoopProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (cards.length === 0) return;
    const t = setInterval(() => setTick((v) => v + 1), intervalMs);
    return () => clearInterval(t);
  }, [cards.length, intervalMs]);

  if (cards.length === 0) return null;
  const card = cards[tick % cards.length];

  return (
    <div
      // new key each tick restarts the fade animation
      key={`${card.id}-${tick}`}
      className="revealed-loop"
      style={
        {
          left: `${area.x * 100}%`,
          top: `${area.y * 100}%`,
          width: `${area.width * 100}%`,
          "--loop-ms": `${intervalMs}ms`,
        } as CSSProperties
      }
      aria-live="polite"
    >
      <LoopCard content={card.content} />
    </div>
  );
}
