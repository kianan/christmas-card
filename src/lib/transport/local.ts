import type { Transport } from "./types";

/**
 * Same-browser transport using BroadcastChannel. Only reaches other tabs of
 * the same browser — for local testing without any accounts.
 */
export function createLocalTransport(): Transport {
  return {
    name: "local",
    async listen(inbox, onMessage) {
      const ch = new BroadcastChannel(`xmas:${inbox}`);
      ch.onmessage = (e) => {
        const { event, payload } = e.data ?? {};
        if (typeof event === "string") onMessage(event, payload);
      };
      return () => ch.close();
    },
    async send(inbox, event, payload) {
      const ch = new BroadcastChannel(`xmas:${inbox}`);
      ch.postMessage({ event, payload });
      ch.close();
    },
  };
}
