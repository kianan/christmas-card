/**
 * Wire protocol. Event names must be lowercase (Supabase matches them
 * case-insensitively).
 *
 *   guest  → display : "card"       CardMsg
 *   display → guest  : "ack"        AckMsg
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
  replyTo: string; // guest's client id
}

export interface AckMsg {
  cardId: string;
  ok: boolean;
  reason?: string;
}

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
    ["cardId", "replyTo", "epk", "iv", "ct"].every(
      (k) => typeof c[k] === "string" && (c[k] as string).length > 0,
    ) &&
    (c.ct as string).length <= LIMITS.maxCiphertextChars &&
    (c.cardId as string).length <= 64 &&
    (c.replyTo as string).length <= 64
  );
}
