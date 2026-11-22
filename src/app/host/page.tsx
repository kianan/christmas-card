"use client";

import { useEffect, useRef, useState } from "react";
import { randomId } from "@/lib/crypto";
import { useHashParams } from "@/lib/hooks";
import {
  clientInbox,
  displayInbox,
  type CmdMsg,
  type HostAction,
  type StatusMsg,
} from "@/lib/protocol";
import { getTransport } from "@/lib/transport";

const HELLO_EVERY_MS = 10_000;
const STALE_AFTER_MS = 25_000;

export default function HostPage() {
  const params = useHashParams();
  const room = params?.r;
  const token = params?.t;
  const clientIdRef = useRef<string | null>(null); // created in the browser only
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [stale, setStale] = useState(false);
  const lastSeen = useRef(0);

  useEffect(() => {
    if (!room || !token) return;
    const clientId = (clientIdRef.current ??= randomId());
    const t = getTransport();
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const hello = () =>
      t
        .send(displayInbox(room), "host-hello", { token, replyTo: clientId })
        .catch(() => {});
    t.listen(clientInbox(room, clientId), (event, payload) => {
      if (event !== "status") return;
      lastSeen.current = Date.now();
      setStale(false);
      setStatus(payload as StatusMsg);
    })
      .then((u) => {
        if (cancelled) return u();
        unsub = u;
        void hello();
      })
      .catch(() => setStale(true));
    const timer = setInterval(() => {
      void hello();
      setStale(Date.now() - lastSeen.current > STALE_AFTER_MS);
    }, HELLO_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsub?.();
    };
  }, [room, token]);

  if (params === null) return <main className="narrow">Loading…</main>;
  if (!room || !token) {
    return (
      <main className="narrow">
        <h1>Host remote</h1>
        <p>Press H on the party screen and scan the host QR code.</p>
      </main>
    );
  }

  const cmd = (action: HostAction) => {
    if (action === "end" && !confirm("End the party? All cards will be wiped for good."))
      return;
    const clientId = clientIdRef.current;
    if (!clientId) return;
    const msg: CmdMsg = { token, replyTo: clientId, action };
    void getTransport().send(displayInbox(room), "cmd", msg).catch(() => setStale(true));
  };

  const remaining = status ? status.total - status.revealed : 0;

  return (
    <main className="narrow">
      <h1>🎅 Host remote</h1>
      {!status ? (
        <p className="muted">Connecting to the party screen…</p>
      ) : (
        <>
          {stale && (
            <p className="error">
              Lost contact with the party screen. Is it still open?
            </p>
          )}
          {status.phase === "ended" ? (
            <p>The party has ended. All cards were wiped.</p>
          ) : (
            <>
              <div className="panel row">
                <div>
                  <div className="stat">{status.total}</div>
                  <div className="muted">cards on the tree</div>
                </div>
                <div>
                  <div className="stat">{status.revealed}</div>
                  <div className="muted">revealed</div>
                </div>
              </div>
              <p className="muted">
                You only see counts here. Messages appear on the party screen.
              </p>
              <div className="stack">
                {status.phase === "collecting" ? (
                  <button onClick={() => cmd("start-reveal")} disabled={status.total === 0}>
                    Start reveal
                  </button>
                ) : (
                  <>
                    <button onClick={() => cmd("next")} disabled={remaining === 0}>
                      {remaining === 0
                        ? "All cards revealed"
                        : status.showing
                          ? "Next card"
                          : "Reveal a card"}
                    </button>
                    <button className="secondary" onClick={() => cmd("back-to-collecting")}>
                      Back to collecting
                    </button>
                  </>
                )}
                <button className="secondary" onClick={() => cmd("end")}>
                  End party
                </button>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
