/**
 * Wire protocol. Event names must be lowercase (Supabase matches them
 * case-insensitively).
 *
 *   guest → display : "card"  CardMsg   one HTTP POST, fire-and-forget
 *   host  → display : "cmd"   CmdMsg    one HTTP POST, fire-and-forget
 *
 * Only the display listens (one connection per party). Guests and the host
 * remote never connect; they watch the party screen for the result.
 */
import type { SealedCard } from "./crypto";

export const LIMITS = {
  messageChars: 500,
  fromChars: 40,
  maxCards: 500,
  maxCiphertextChars: 4000,
};

export type Phase = "collecting" | "revealing" | "ended";

export const displayInbox = (room: string) => `xmas-${room}`;

export interface CardMsg extends SealedCard {
  cardId: string;
  /**
   * First character of the sender's name, in the clear, so the display can
   * show "Card received from K••••". The full name stays inside the
   * encrypted card. Absent for anonymous cards.
   */
  initial?: string;
}

/** First character (grapheme, so emoji and accents stay whole) of a name. */
export function nameInitial(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  const first =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter().segment(trimmed)[Symbol.iterator]().next().value?.segment
      : Array.from(trimmed)[0];
  return first?.toLocaleUpperCase();
}

/** "K" → "K••••" (fixed length, so the name's length isn't revealed). */
export const maskName = (initial: string | undefined) =>
  initial ? `${initial}••••` : "a Secret Santa";

export type HostAction =
  | "start-reveal"
  | "next"
  | "back-to-collecting"
  | "end"
  | "remove"; // remove a revealed card by its reveal number (#N on screen)

export interface CmdMsg {
  token: string; // host token from the host QR; the display ignores anything else
  action: HostAction;
  /** For "remove": the #N shown on the revealed card (reveal order, from 1). */
  cardNo?: number;
}

/** URL fragments: everything after # stays in the browser. */
export function parseHash(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return Object.fromEntries(
    new URLSearchParams(window.location.hash.slice(1)).entries(),
  );
}

export function isCardMsg(p: unknown): p is CardMsg {
  if (!p || typeof p !== "object") return false;
  const c = p as Record<string, unknown>;
  return (
    ["cardId", "epk", "iv", "ct"].every(
      (k) => typeof c[k] === "string" && (c[k] as string).length > 0,
    ) &&
    (c.ct as string).length <= LIMITS.maxCiphertextChars &&
    (c.cardId as string).length <= 64 &&
    (c.initial === undefined || (typeof c.initial === "string" && c.initial.length <= 8))
  );
}
