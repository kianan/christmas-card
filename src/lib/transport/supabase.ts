import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { isCapacityReason, RelayBusyError, type Transport } from "./types";

const clientOptions = (storageKey: string) => ({
  auth: { persistSession: false, autoRefreshToken: false, storageKey },
});

/**
 * Supabase Realtime Broadcast transport. Broadcast messages are relayed, never
 * stored — no database tables are used.
 *
 * Two clients on purpose:
 *   - `listener` holds the page's one WebSocket. When its last channel is
 *     removed, Supabase closes the socket (~50 s later), freeing a connection.
 *   - `sender` only makes HTTP requests (httpSend). It never connects, and its
 *     channel objects can't keep the listener's socket alive.
 */
export function createSupabaseTransport(url: string, key: string): Transport {
  const listener = createClient(url, key, clientOptions("xmas-listen"));
  const sender = createClient(url, key, clientOptions("xmas-send"));
  const sendChannels = new Map<string, RealtimeChannel>();

  return {
    name: "supabase",

    listen(inbox, onMessage, onStatus) {
      const channel = listener.channel(inbox, {
        config: { broadcast: { self: false, ack: false } },
      });
      channel.on("broadcast", { event: "*" }, (msg) => onMessage(msg.event, msg.payload));
      let closed = false;
      onStatus?.("connecting");
      // The callback fires on every state change, including automatic rejoins
      // after a drop or a capacity refusal.
      channel.subscribe((status, err) => {
        if (closed) return;
        if (status === "SUBSCRIBED") onStatus?.("online");
        else if (status === "CHANNEL_ERROR") {
          const reason = err?.message ?? "";
          onStatus?.(isCapacityReason(reason) ? "busy" : "reconnecting", reason);
        } else if (status === "TIMED_OUT") onStatus?.("reconnecting", "timed out");
      });
      return () => {
        closed = true;
        void listener.removeChannel(channel);
      };
    },

    async send(inbox, event, payload) {
      let channel = sendChannels.get(inbox);
      if (!channel) {
        channel = sender.channel(inbox);
        sendChannels.set(inbox, channel);
      }
      try {
        await channel.httpSend(event, payload as object);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw isCapacityReason(msg) ? new RelayBusyError(msg) : e;
      }
    },
  };
}
