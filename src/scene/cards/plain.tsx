import type { CardArt, HangingCardProps, LoopCardProps, RevealProps } from "../types";

function HangingCard({ revealed }: HangingCardProps) {
  return <div className={revealed ? "hanging-card opened" : "hanging-card"} />;
}

function RevealCard({ content, number }: RevealProps) {
  return (
    <div className="reveal-card">
      {number !== undefined && <span className="card-no">#{number}</span>}
      <p className="message">{content.message}</p>
      <p className="from">— {content.from || "Secret Santa"}</p>
    </div>
  );
}

function LoopCard({ content, number }: LoopCardProps) {
  return (
    <div className="loop-card">
      {number !== undefined && <span className="card-no">#{number}</span>}
      <p className="message">{content.message}</p>
      <p className="from">— {content.from || "Secret Santa"}</p>
    </div>
  );
}

export const plainCards: CardArt = { name: "plain", HangingCard, RevealCard, LoopCard };
