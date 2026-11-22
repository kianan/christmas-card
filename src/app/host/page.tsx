"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { generateKeyPair, openJson, randomId, type SealedCard } from "@/lib/crypto";
import { useHashParams } from "@/lib/hooks";
import {
  clientInbox,
  displayInbox,
  type CmdMsg,
  type HostAction,
  type RevealedList,
  type StatusMsg,
} from "@/lib/protocol";
import { getTransport, type ListenStatus } from "@/lib/transport";

const HELLO_EVERY_MS = 10_000;
const STALE_AFTER_MS = 25_000;

/** True while this page is on screen (phone unlocked, tab in front). */
function usePageVisible(): boolean {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => document.visibilityState === "visible",
    () => true,
  );
}

interface HostIdentity {
  clientId: string;
  publicKey: string;
  privateJwk: JsonWebKey;
}

export default function HostPage() {
  const params = useHashParams();
  const room = params?.r;
  const token = params?.t;
  // Created in the browser only. The key pair lets the display send this phone
  // the revealed cards without the relay being able to read them.
  const me = useRef<HostIdentity | null>(null);
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [revealed, setRevealed] = useState<RevealedList | null>(null);
  const [stale, setStale] = useState(false);
  const [relay, setRelay] = useState<ListenStatus>("connecting");
  const lastSeen = useRef(0);
  const visible = usePageVisible();
  // Only stay connected (and keep checking in) while it's useful: the party is
  // still on and this page is on screen. Otherwise the connection is released.
  const active = visible && status?.phase !== "ended";

  useEffect(() => {
    if (!room || !token || !active) return;
    const t = getTransport();
    let cancelled = false;
    let unsub: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      if (!me.current) {
        const keys = await generateKeyPair();
        me.current = { clientId: randomId(), ...keys };
      }
      const { clientId, publicKey, privateJwk } = me.current;
      const hello = () =>
        t
          .send(displayInbox(room), "host-hello", { token, replyTo: clientId, pubKey: publicKey })
          .catch(() => {});
      if (cancelled) return;
      const u = t.listen(
        clientInbox(room, clientId),
        (event, payload) => {
          lastSeen.current = Date.now();
          setStale(false);
          if (event === "status") setStatus(payload as StatusMsg);
          else if (event === "revealed")
            openJson<RevealedList>(privateJwk, payload as SealedCard)
              .then(setRevealed)
              .catch(() => {});
        },
        (st) => {
          setRelay(st);
          if (st === "online") void hello(); // (re)connected: ask for fresh status
        },
      );
      unsub = u;
      timer = setInterval(() => {
        void hello();
        setStale(Date.now() - lastSeen.current > STALE_AFTER_MS);
      }, HELLO_EVERY_MS);
    })().catch(() => setStale(true));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      unsub?.();
    };
  }, [room, token, active]);

  if (params === null) return <main className="narrow">Loading…</main>;
  if (!room || !token) {
    return (
      <main className="narrow">
        <h1>Host remote</h1>
        <p>Press H on the party screen and scan the host QR code.</p>
      </main>
    );
  }

  const cmd = (action: HostAction, cardId?: string) => {
    if (action === "end" && !confirm("End the party? All cards will be wiped for good."))
      return;
    if (action === "remove" && !confirm("Remove this card? It can't be brought back."))
      return;
    if (!me.current) return;
    const msg: CmdMsg = {
      token,
      replyTo: me.current.clientId,
      pubKey: me.current.publicKey,
      action,
      cardId,
    };
    void getTransport().send(displayInbox(room), "cmd", msg).catch(() => setStale(true));
  };

  const remaining = status ? status.total - status.revealed : 0;
  const currentCard = revealed?.items.find((i) => i.id === revealed.currentId);
  const pastCards = revealed?.items.filter((i) => i.id !== revealed.currentId) ?? [];

  return (
    <main className="narrow">
      <h1>🎅 Host remote</h1>
      {!status ? (
        <p className="muted">Connecting to the party screen…</p>
      ) : (
        <>
          {relay === "busy" ? (
            <p className="error">
              The party service is overloaded. Retrying automatically…
            </p>
          ) : (
            stale && (
              <p className="error">
                Lost contact with the party screen. Is it still open?
              </p>
            )
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

              {currentCard && (
                <section className="stack">
                  <h2>On screen now</h2>
                  <HostCard item={currentCard} onRemove={() => cmd("remove", currentCard.id)} />
                </section>
              )}

              <section className="stack">
                <h2>Revealed cards</h2>
                {pastCards.length === 0 ? (
                  <p className="muted">
                    Cards appear here once revealed. Unrevealed cards stay secret, even
                    from you.
                  </p>
                ) : (
                  pastCards.map((item) => (
                    <HostCard key={item.id} item={item} onRemove={() => cmd("remove", item.id)} />
                  ))
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}

function HostCard({
  item,
  onRemove,
}: {
  item: RevealedList["items"][number];
  onRemove: () => void;
}) {
  return (
    <div className="panel host-card">
      <p className="host-card-message">{item.message}</p>
      <div className="row">
        <span className="muted">— {item.from || "Secret Santa"}</span>
        <button className="secondary host-card-remove" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}
