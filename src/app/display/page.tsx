"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useOrigin, useSearch, useTransportName } from "@/lib/hooks";
import { downloadFile, keepsakeFilename, keepsakeHtml } from "@/lib/keepsake";
import { useDisplaySession } from "@/party/useDisplaySession";
import { cardArt, getScene, nextScene, Stage } from "@/scene";
import { ReceivedFeed } from "./ReceivedFeed";

/** End-party confirmation; nudges towards exporting if the wishes aren't saved yet. */
const confirmEnd = (unsavedWishes: boolean) =>
  confirm(
    unsavedWishes
      ? "The wishes haven't been exported yet. End the party anyway?\n\nEverything will be wiped for good. Press Cancel, then X, to save them first."
      : "End the party? All cards will be wiped for good.",
  );
const confirmRemove = () => confirm("Remove this card? It can't be brought back.");

/**
 * Fullscreen, plus Keyboard Lock (Chrome/Edge) so Esc reaches the page instead
 * of exiting fullscreen — hold Esc to leave fullscreen. Other browsers: the
 * first Esc exits fullscreen, the next one goes back to collecting.
 */
async function goFullscreen() {
  try {
    await document.documentElement.requestFullscreen?.();
    const nav = navigator as Navigator & {
      keyboard?: { lock?: (keys: string[]) => Promise<void> };
    };
    await nav.keyboard?.lock?.(["Escape"]);
  } catch {
    // fullscreen or keyboard lock not allowed — ignore
  }
}

export default function DisplayPage() {
  const {
    session,
    current,
    revealedCards,
    connection,
    everOnline,
    startReveal,
    revealNext,
    backToCollecting,
    removeCard,
    endParty,
    newParty,
    setScene,
    exportOffer,
    exported,
    offerExport,
    closeExport,
    buildExport,
    markExported,
  } = useDisplaySession();
  const [showHostQr, setShowHostQr] = useState(false);
  const transportName = useTransportName();
  const origin = useOrigin();
  const search = useSearch();

  const phase = session?.phase;
  const liveCards = session?.cards.filter((c) => !c.removed) ?? [];
  const total = liveCards.length;
  const revealed = liveCards.filter((c) => c.revealedAt).length;
  const remaining = total - revealed;
  const unsavedWishes = revealed > 0 && !exported;
  // Saved choice wins; otherwise ?scene=<id> in the URL; otherwise the default.
  const scene = getScene(session?.sceneId ?? new URLSearchParams(search).get("scene"));

  // Keyboard shortcuts for a laptop driving the projector.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!phase || phase === "ended") return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
      const k = e.key.toLowerCase();
      if (k === "h") setShowHostQr((v) => !v);
      else if (k === "f") void goFullscreen();
      else if (k === "r" && phase === "collecting") startReveal();
      else if ((k === "n" || k === " " || k === "arrowright") && phase === "revealing") {
        e.preventDefault();
        revealNext();
      } else if (k === "escape" && phase === "revealing") backToCollecting();
      else if (k === "s") setScene(nextScene(scene.id).id);
      else if (k === "d" && current && confirmRemove()) removeCard(current.id);
      else if (k === "x") {
        if (exportOffer) closeExport();
        else {
          setShowHostQr(false);
          offerExport();
        }
      } else if (k === "e" && confirmEnd(unsavedWishes)) endParty();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    phase,
    scene.id,
    current,
    startReveal,
    revealNext,
    backToCollecting,
    removeCard,
    endParty,
    setScene,
    exportOffer,
    offerExport,
    closeExport,
    unsavedWishes,
  ]);

  // Warn before closing the tab while cards are hanging.
  useEffect(() => {
    if (!total || phase === "ended") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [total, phase]);

  // Keep the screen awake during the party.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = () =>
      navigator.wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && request();
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  if (!session) {
    return <main className="narrow">Setting up the party…</main>;
  }

  if (phase === "ended") {
    return (
      <main className="narrow">
        <h1>🎅 The party has ended</h1>
        <p>All cards and keys have been wiped from this screen.</p>
        <button onClick={() => void newParty()}>Start a new party</button>
      </main>
    );
  }

  const guestUrl = `${origin}/write${search}#r=${session.room}&k=${session.publicKey}`;
  const hostUrl = `${origin}/host${search}#r=${session.room}&t=${session.hostToken}`;
  const exportUrl =
    exportOffer && `${origin}/export${search}#r=${session.room}&x=${exportOffer.id}&k=${exportOffer.key}`;
  const downloadHere = () => {
    const data = buildExport();
    downloadFile(keepsakeFilename(data), keepsakeHtml(data));
    markExported();
  };
  const { RevealCard } = cardArt;

  return (
    <div className="display">
      {transportName === "local" && (
        <div className="banner">
          Local test mode: only works between tabs of this browser. Set the
          Supabase environment variables to work across devices.
        </div>
      )}
      {everOnline && connection === "busy" && (
        <div className="banner warn">
          ⚠️ The party service is overloaded and has paused this screen. Retrying
          automatically… Cards sent right now may be lost, so ask guests to wait until
          the QR code is back. Cards already on the tree are safe.
        </div>
      )}
      {everOnline && connection === "reconnecting" && (
        <div className="banner warn">
          Connection lost. Reconnecting… Cards sent right now may be lost. Cards already
          on the tree are safe.
        </div>
      )}

      <div className="display-body">
      <section className="display-main" aria-label="Secret Christmas Cards">
        <Stage
          scene={scene}
          cardArt={cardArt}
          cards={session.cards.map((c) => ({
            id: c.id,
            revealed: Boolean(c.revealedAt),
            hidden: c.removed,
          }))}
          revealed={revealedCards}
        />
      </section>

      <aside className="display-side">
        {exportOffer && exportUrl ? (
          <>
            <h2>Save the wishes</h2>
            {revealed === 0 ? (
              <p className="muted">
                No revealed wishes yet. Only revealed cards are exported, so reveal
                some first.
              </p>
            ) : (
              <>
                <div className="qr-wrap">
                  <a className="qr" href={exportUrl} target="_blank" rel="noreferrer">
                    <QRCodeSVG value={exportUrl} size={256} marginSize={0} />
                  </a>
                  {exportOffer.status !== "waiting" && (
                    <div className="qr-paused" role="status">
                      {exportOffer.status === "sending" && <strong>Sending to your phone…</strong>}
                      {exportOffer.status === "sent" && <strong>✓ Sent to your phone</strong>}
                      {exportOffer.status === "failed" && (
                        <>
                          <strong>Couldn&apos;t send</strong>
                          <span>Make a new code and try again.</span>
                        </>
                      )}
                      <button className="secondary" onClick={offerExport}>
                        New code
                      </button>
                    </div>
                  )}
                </div>
                <p className="muted">
                  Scan with <strong>your</strong> phone to save {revealed}{" "}
                  {revealed === 1 ? "wish" : "wishes"} as a keepsake page. This code works
                  once and is encrypted end to end.
                </p>
                <button className="secondary" onClick={downloadHere}>
                  Download here instead
                </button>
              </>
            )}
            <button className="secondary" onClick={closeExport}>
              Close (X)
            </button>
          </>
        ) : showHostQr ? (
          <>
            <h2>Host remote</h2>
            <a className="qr" href={hostUrl} target="_blank" rel="noreferrer">
              <QRCodeSVG value={hostUrl} size={256} marginSize={0} />
            </a>
            <p className="muted">
              Scan with your own phone, then press H to hide this. Don&apos;t
              let guests scan it.
            </p>
          </>
        ) : phase === "collecting" ? (
          <>
            <h2>Scan to write a secret card</h2>
            <div className="qr-wrap">
              <a className="qr" href={guestUrl} target="_blank" rel="noreferrer">
                <QRCodeSVG value={guestUrl} size={256} marginSize={0} />
              </a>
              {/* Guests send fire-and-forget: only offer the QR while we can receive. */}
              {connection !== "online" && (
                <div className="qr-paused" role="status">
                  {connection === "busy" && !everOnline ? (
                    <>
                      <strong>Party service is full</strong>
                      <span>
                        Too many parties are running right now. This screen keeps
                        trying and the QR code appears as soon as there&apos;s room.
                      </span>
                    </>
                  ) : connection === "connecting" ? (
                    <strong>Connecting…</strong>
                  ) : (
                    <>
                      <strong>Paused</strong>
                      <span>Reconnecting, please wait before scanning.</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="stat">{total} 🎴</p>
            <p className="muted">cards on the tree</p>
            <ReceivedFeed cards={session.cards} />
          </>
        ) : (
          <>
            <h2>🎁 Reveal time!</h2>
            <p className="stat">{remaining}</p>
            <p className="muted">cards left to open</p>
          </>
        )}
      </aside>
      </div>

      <footer className="controls">
        {phase === "collecting" ? (
          <button onClick={startReveal} disabled={total === 0}>
            Start reveal (R)
          </button>
        ) : (
          <>
            <button onClick={revealNext} disabled={remaining === 0}>
              {current ? "Next card (N)" : "Reveal a card (N)"}
            </button>
            <button className="secondary" onClick={backToCollecting}>
              Back to collecting (Esc)
            </button>
          </>
        )}
        <button className="secondary" onClick={() => setScene(nextScene(scene.id).id)}>
          Scene: {scene.name} (S)
        </button>
        <button className="secondary" onClick={() => setShowHostQr((v) => !v)}>
          {showHostQr ? "Hide host remote (H)" : "Host remote (H)"}
        </button>
        <button
          className="secondary"
          onClick={() => void goFullscreen()}
        >
          Fullscreen (F)
        </button>
        <button
          className="secondary"
          onClick={() => {
            if (exportOffer) closeExport();
            else {
              setShowHostQr(false);
              offerExport();
            }
          }}
        >
          {exportOffer ? "Close export (X)" : "Export wishes (X)"}
        </button>
        <button className="secondary" onClick={() => confirmEnd(unsavedWishes) && endParty()}>
          End party (E)
        </button>
      </footer>

      <span className="connection-status muted">
        {
          {
            online: "● Live",
            connecting: "● Connecting…",
            reconnecting: "● Reconnecting…",
            busy: "● Service busy, retrying",
          }[connection]
        }
        {transportName ? ` · ${transportName}` : ""}
      </span>

      {phase === "revealing" && (current || remaining === 0) && !exportOffer && (
        <div className="overlay" onClick={revealNext}>
          {current ? (
            <div className="reveal-wrap">
              <RevealCard content={current.content} number={current.number} />
              <button
                className="secondary remove-card"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmRemove()) removeCard(current.id);
                }}
              >
                Remove card (D)
              </button>
            </div>
          ) : (
            <div className="reveal-card">
              <p className="message">That&apos;s every card! 🎉</p>
              <p className="counter">Merry Christmas</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
