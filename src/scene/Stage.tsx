import type { CSSProperties } from "react";
import { RevealedLoop } from "./RevealedLoop";
import type { CardArt, LoopItem, SceneDef, StageCard } from "./types";

interface StageProps {
  scene: SceneDef;
  cardArt: CardArt;
  cards: StageCard[];
  /** Revealed cards to cycle through (empty = loop hidden). */
  revealed?: LoopItem[];
}

/**
 * Fixed-aspect stage that scales to fill its container. Background, cards and
 * (later) animations are layered inside; positions are % of the stage, so
 * they line up with the art at any screen size.
 */
export function Stage({ scene, cardArt, cards, revealed = [] }: StageProps) {
  const { Background, slots, overflowAt, cardWidth, aspect, dim = 0 } = scene;
  const { HangingCard, LoopCard } = cardArt;
  const hung = cards.slice(0, slots.length);
  const overflow = cards.slice(slots.length).filter((c) => !c.hidden).length;
  const visible = cards.filter((c) => !c.hidden).length;

  return (
    <div className="stage-area">
      <div
        className="stage"
        style={{ "--aspect": aspect, "--card-w": cardWidth } as CSSProperties}
        aria-label={`${visible} cards hanging`}
      >
        <div className="stage-bg">
          {/* key: remount on scene change so the new video starts cleanly */}
          <Background key={scene.id} />
        </div>
        {dim > 0 && <div className="stage-dim" style={{ opacity: dim }} />}
        {hung.map((card, i) => {
          if (card.hidden) return null;
          const s = slots[i];
          return (
            <div
              key={card.id}
              className="slot"
              style={{
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${s.rotate}deg)`,
              }}
            >
              <HangingCard revealed={card.revealed} />
            </div>
          );
        })}
        <RevealedLoop cards={revealed} area={scene.loopAt} LoopCard={LoopCard} />
        {overflow > 0 && (
          <div
            className="overflow-badge"
            style={{ left: `${overflowAt.x * 100}%`, top: `${overflowAt.y * 100}%` }}
          >
            +{overflow} more
          </div>
        )}
      </div>
    </div>
  );
}
