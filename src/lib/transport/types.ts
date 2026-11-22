/**
 * Message transport between the display, guests and host.
 *
 * Every participant has an "inbox" (a channel name). Anyone can send to an
 * inbox; only its owner listens. Nothing is stored — if nobody is listening,
 * the message is dropped.
 *
 * Swap implementations (Supabase Broadcast, local BroadcastChannel, PeerJS…)
 * without touching any page or scene code.
 */
export type Unsubscribe = () => void;

export type MessageHandler = (event: string, payload: unknown) => void;

export interface Transport {
  readonly name: string;
  /** Start listening on an inbox. Resolves once messages can be received. */
  listen(inbox: string, onMessage: MessageHandler): Promise<Unsubscribe>;
  /** Fire-and-forget send to someone else's inbox. */
  send(inbox: string, event: string, payload: unknown): Promise<void>;
}
