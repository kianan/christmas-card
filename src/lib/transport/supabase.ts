import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { Transport } from "./types";

/**
 * Supabase Realtime Broadcast transport. Broadcast messages are relayed, never
 * stored — no database tables are used.
 *
 * Listeners hold a websocket; senders use the REST endpoint (httpSend), so a
 * guest only needs a connection while waiting for its "hung" ack.
 */
export function createSupabaseTransport(url: string, key: string): Transport {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // client.channel() returns an existing channel for the same topic, so keep
  // one handle per inbox and never remove send-only channels.
  const sendChannels = new Map<string, RealtimeChannel>();

  return {
    name: "supabase",
    listen(inbox, onMessage) {
      return new Promise((resolve, reject) => {
        const channel = client.channel(inbox, {
          config: { broadcast: { self: false, ack: false } },
        });
        channel.on("broadcast", { event: "*" }, (msg) => {
          onMessage(msg.event, msg.payload);
        });
        let settled = false;
        channel.subscribe((status, err) => {
          if (settled) return;
          if (status === "SUBSCRIBED") {
            settled = true;
            resolve(() => {
              sendChannels.delete(inbox);
              void client.removeChannel(channel);
            });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            settled = true;
            void client.removeChannel(channel);
            reject(err ?? new Error(`Realtime channel ${status}`));
          }
        });
      });
    },
    async send(inbox, event, payload) {
      let channel = sendChannels.get(inbox);
      if (!channel) {
        channel = client.channel(inbox);
        sendChannels.set(inbox, channel);
      }
      await channel.httpSend(event, payload as object);
    },
  };
}
