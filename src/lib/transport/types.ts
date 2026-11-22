/**
 * Message transport between the display, guests and host.
 *
 * Every participant has an "inbox" (a channel name). Anyone can send to an
 * inbox; only its owner listens. Nothing is stored — if nobody is listening,
 * the message is dropped.
 *
 * Sending is a plain HTTP request (no connection). Listening holds one live
 * connection — only the display and the host remote ever listen.
 *
 * Swap implementations (Supabase Broadcast, local BroadcastChannel, PeerJS…)
 * without touching any page or scene code.
 */
export type Unsubscribe = () => void;

export type MessageHandler = (event: string, payload: unknown) => void;

/**
 * Live state of a listener:
 *   connecting    – first attempt in progress
 *   online        – receiving messages
 *   reconnecting  – dropped (network blip / throttled); retrying by itself
 *   busy          – the relay refused us because it's at capacity; retrying
 */
export type ListenStatus = "connecting" | "online" | "reconnecting" | "busy";

export type StatusHandler = (status: ListenStatus, detail?: string) => void;

export interface Transport {
  readonly name: string;
  /** Listen on an inbox. Keeps retrying on its own; reports status changes. */
  listen(inbox: string, onMessage: MessageHandler, onStatus?: StatusHandler): Unsubscribe;
  /** Fire-and-forget send to someone else's inbox (one HTTP request). */
  send(inbox: string, event: string, payload: unknown): Promise<void>;
}

/** Thrown by send() when the relay is rate-limiting or over quota. */
export class RelayBusyError extends Error {
  constructor(message = "The party service is busy") {
    super(message);
    this.name = "RelayBusyError";
  }
}

/** Server reasons that mean "at capacity", e.g. too_many_connections. */
export const isCapacityReason = (text: string) =>
  /too.?many|rate.?limit|limit.?reached|quota|exceed|throttl|429/i.test(text);
