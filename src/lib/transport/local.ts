import { RelayBusyError, type ListenStatus, type Transport } from "./types";

/**
 * Same-browser transport using BroadcastChannel. Only reaches other tabs of
 * the same browser — for local testing without any accounts.
 *
 * Testing aid: add `&simulate=busy` or `&simulate=reconnecting` to the URL to
 * make listeners report that status (and `busy` also makes sends fail).
 */
function simulated(): ListenStatus | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("simulate");
  return v === "busy" || v === "reconnecting" ? v : null;
}

export function createLocalTransport(): Transport {
  return {
    name: "local",
    listen(inbox, onMessage, onStatus) {
      const ch = new BroadcastChannel(`xmas:${inbox}`);
      ch.onmessage = (e) => {
        const { event, payload } = e.data ?? {};
        if (typeof event === "string") onMessage(event, payload);
      };
      const sim = simulated();
      queueMicrotask(() =>
        onStatus?.(sim ?? "online", sim ? "simulated too_many_connections" : undefined),
      );
      return () => ch.close();
    },
    async send(inbox, event, payload) {
      if (simulated() === "busy") throw new RelayBusyError("simulated 429");
      const ch = new BroadcastChannel(`xmas:${inbox}`);
      ch.postMessage({ event, payload });
      ch.close();
    },
  };
}
