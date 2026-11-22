import type { CardArt, HangingCardProps, LoopCardProps, RevealProps } from "../types";

function HangingCard({ revealed }: HangingCardProps) {
  return <div className={revealed ? "hanging-card opened" : "hanging-card"} />;
}

function RevealCard({ content, index, total }: RevealProps) {
  return (
    <div className="reveal-card">
      <p className="message">{content.message}</p>
      <p className="from">— {content.from || "Secret Santa"}</p>
      <p className="counter">
        Card {index} of {total}
      </p>
    </div>
  );
}

function LoopCard({ content }: LoopCardProps) {
  return (
    <div className="loop-card">
      <p className="message">{content.message}</p>
      <p className="from">— {content.from || "Secret Santa"}</p>
    </div>
  );
}

export const plainCards: CardArt = { name: "plain", HangingCard, RevealCard, LoopCard };
