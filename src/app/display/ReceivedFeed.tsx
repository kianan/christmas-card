import { maskName } from "@/lib/protocol";

interface FeedCard {
  id: string;
  initial?: string;
  receivedAt: number;
  removed?: boolean;
}

/**
 * "Card received from K••••" — the guest's confirmation, since sending is
 * fire-and-forget. Newest first; each new line fades in.
 */
export function ReceivedFeed({ cards, max = 5 }: { cards: FeedCard[]; max?: number }) {
  const recent = cards
    .filter((c) => !c.removed)
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .slice(0, max);
  if (recent.length === 0) return null;
  return (
    <ul className="received-feed" aria-live="polite" aria-label="Recently received cards">
      {recent.map((c) => (
        <li key={c.id}>
          🎴 Card received from <strong>{maskName(c.initial)}</strong>
        </li>
      ))}
    </ul>
  );
}
