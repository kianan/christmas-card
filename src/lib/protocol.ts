/**
 * Wire protocol. Event names must be lowercase (Supabase matches them
 * case-insensitively).
 *
 *   guest  → display : "card"       CardMsg
 *   display → guest  : "ack"        AckMsg
 *   host   → display : "host-hello" HostHelloMsg
 *   host   → display : "cmd"        CmdMsg
 *   display → host   : "status"     StatusMsg   (counts only — never message text)
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
}

export type HostAction = "start-reveal" | "next" | "back-to-collecting" | "end";

export interface CmdMsg {
  token: string;
  replyTo: string;
  action: HostAction;
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
