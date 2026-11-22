/**
 * Wire protocol. Event names must be lowercase (Supabase matches them
 * case-insensitively).
 *
 *   guest  → display : "card"       CardMsg     (one HTTP POST, fire-and-forget:
 *                                                guests never open a WebSocket)
 *   host   → display : "host-hello" HostHelloMsg
 *   host   → display : "cmd"        CmdMsg
 *   display → host   : "status"     StatusMsg   (counts only)
 *   display → host   : "revealed"   SealedCard  (RevealedList, encrypted to the
 *                                                host remote's own key — the
 *                                                relay never sees message text)
 */
import type { SealedCard } from "./crypto";

export const LIMITS = {
  hostListItems: 100, // newest revealed cards sent to the host remote
  messageChars: 500,
  fromChars: 40,
  maxCards: 500,
  maxCiphertextChars: 4000,
};

export type Phase = "collecting" | "revealing" | "ended";

export const displayInbox = (room: string) => `xmas-${room}`;
export const clientInbox = (room: string, clientId: string) =>
  `xmas-${room}-${clientId}`;

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

export interface HostHelloMsg {
  token: string;
  replyTo: string;
  /** Host remote's public key, so the display can send it revealed cards. */
  pubKey?: string;
}

export type HostAction =
  | "start-reveal"
  | "next"
  | "back-to-collecting"
  | "end"
  | "remove"; // remove a revealed card (needs cardId)

export interface CmdMsg extends HostHelloMsg {
  action: HostAction;
  cardId?: string;
}

/** Revealed cards, for the host remote (decrypted on the host's phone). */
export interface RevealedList {
  currentId?: string;
  items: { id: string; message: string; from?: string }[];
}

export interface StatusMsg {
  phase: Phase;
  total: number;
  revealed: number;
  showing: boolean;
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
