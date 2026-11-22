"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useOrigin, useSearch, useTransportName } from "@/lib/hooks";
import { useDisplaySession } from "@/party/useDisplaySession";
import { theme } from "@/scene";

const confirmEnd = () =>
  confirm("End the party? All cards will be wiped for good.");

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
    connection,
    startReveal,
    revealNext,
    backToCollecting,
    endParty,
    newParty,
  } = useDisplaySession();
  const [showHostQr, setShowHostQr] = useState(false);
  const transportName = useTransportName();
  const origin = useOrigin();
  const search = useSearch();

  const phase = session?.phase;
  const total = session?.cards.length ?? 0;
  const revealed = session?.cards.filter((c) => c.revealedAt).length ?? 0;
  const remaining = total - revealed;

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
      else if (k === "e" && confirmEnd()) endParty();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startReveal, revealNext, backToCollecting, endParty]);

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
  const { Tree, RevealCard } = theme;

  return (
    <div className="display">
      {transportName === "local" && (
        <div className="banner">
          Local test mode: only works between tabs of this browser. Set the
          Supabase environment variables to work across devices.
        </div>
      )}
      {connection === "error" && (
        <div className="banner">
          Couldn&apos;t connect to the realtime relay. Check your connection and
          refresh. Cards on the tree are kept.
        </div>
      )}

      <section className="display-main">
        <h1>🎄 Secret Christmas Cards</h1>
        <Tree
          cards={session.cards.map((c) => ({ id: c.id, revealed: Boolean(c.revealedAt) }))}
        />
      </section>

      <aside className="display-side">
        {showHostQr ? (
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
            <a className="qr" href={guestUrl} target="_blank" rel="noreferrer">
              <QRCodeSVG value={guestUrl} size={256} marginSize={0} />
            </a>
            <p className="stat">{total} 🎴</p>
            <p className="muted">cards on the tree</p>
          </>
        ) : (
          <>
            <h2>🎁 Reveal time!</h2>
            <p className="stat">{remaining}</p>
            <p className="muted">cards left to open</p>
          </>
        )}
      </aside>

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
        <button className="secondary" onClick={() => setShowHostQr((v) => !v)}>
          {showHostQr ? "Hide host remote (H)" : "Host remote (H)"}
        </button>
        <button
          className="secondary"
          onClick={() => void goFullscreen()}
        >
          Fullscreen (F)
        </button>
        <button className="secondary" onClick={() => confirmEnd() && endParty()}>
          End party (E)
        </button>
        <span className="muted">
          {connection === "online" ? "● Live" : connection === "error" ? "● Offline" : "● Connecting…"}
          {transportName ? ` · ${transportName}` : ""}
        </span>
      </footer>

      {phase === "revealing" && (current || remaining === 0) && (
        <div className="overlay" onClick={revealNext}>
          {current ? (
            <RevealCard content={current.content} index={revealed} total={total} />
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
