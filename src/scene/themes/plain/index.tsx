import type { RevealProps, Theme, TreeProps } from "../../types";

function Tree({ cards }: TreeProps) {
  return (
    <div className="tree" aria-label={`${cards.length} cards on the tree`}>
      <div className="tree-top" aria-hidden>
        🎄
      </div>
      <div className="tree-cards">
        {cards.map((c) => (
          <div
            key={c.id}
            className={c.revealed ? "tree-card opened" : "tree-card"}
            title={c.revealed ? "Revealed" : "Sealed"}
          />
        ))}
      </div>
      {cards.length === 0 && (
        <p className="muted">No cards yet. Scan the QR code to write one!</p>
      )}
    </div>
  );
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

export const plainTheme: Theme = { name: "plain", Tree, RevealCard };
