"use client";

import { useRef, useState } from "react";
import { randomId, sealCard } from "@/lib/crypto";
import { useHashParams } from "@/lib/hooks";
import { displayInbox, LIMITS, maskName, nameInitial, type CardMsg } from "@/lib/protocol";
import { getTransport, RelayBusyError } from "@/lib/transport";

const RETRY_DELAYS_MS = [1_000, 3_000, 6_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function WritePage() {
  const params = useHashParams();
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "retrying" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [sentAs, setSentAs] = useState<string | undefined>(undefined); // initial of the last sent card
  const pendingCardId = useRef<string | null>(null); // reused on retry so the tree never gets duplicates

  if (params === null) return <main className="narrow">Loading…</main>;

  const room = params.r;
  const key = params.k;
  if (!room || !key) {
    return (
      <main className="narrow">
        <h1>🎄 Secret Christmas Cards</h1>
        <p>Scan the QR code on the party screen to write a card.</p>
      </main>
    );
  }

  const editMessage = (v: string) => {
    pendingCardId.current = null; // content changed: treat as a new card
    setMessage(v);
  };

  /**
   * Fire-and-forget: seal on this phone, then one HTTP POST to the relay.
   * No WebSocket and no reply — the party screen shows
   * "Card received from K••••" instead.
   */
  async function send() {
    if (!message.trim()) return;
    setState("sending");
    setError("");
    const cardId = (pendingCardId.current ??= randomId());
    const initial = nameInitial(from);
    try {
      const sealed = await sealCard(key, {
        message: message.trim(),
        from: from.trim() || undefined,
      });
      const msg: CardMsg = { ...sealed, cardId, initial };
      // Retry a few times on hiccups or when the service is busy. Same cardId
      // every time, so the tree never shows a duplicate.
      for (let attempt = 0; ; attempt++) {
        try {
          await getTransport().send(displayInbox(room), "card", msg);
          break;
        } catch (e) {
          if (attempt >= RETRY_DELAYS_MS.length) throw e;
          setState("retrying");
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
      pendingCardId.current = null;
      setSentAs(initial);
      setMessage("");
      setFrom("");
      setState("sent");
    } catch (e) {
      setError(
        e instanceof RelayBusyError
          ? "The party service is very busy right now. Wait a minute, then tap Try again. Your card won't be sent twice."
          : "Couldn't send your card. Check your connection and try again.",
      );
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <main className="narrow">
        <h1>🎄 Card sent!</h1>
        <p>It&apos;s sealed. Nobody can read it until the reveal.</p>
        <p className="muted">
          Look for <strong>&ldquo;Card received from {maskName(sentAs)}&rdquo;</strong> under
          the QR code on the party screen. If it doesn&apos;t appear, the screen may have
          been closed. Just send it again.
        </p>
        <button onClick={() => setState("idle")}>Write another card</button>
      </main>
    );
  }

  return (
    <main className="narrow">
      <h1>✉️ Write a secret card</h1>
      <p className="muted">
        Your card is encrypted on this phone. Only the party screen can open
        it, at the reveal.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div>
          <label htmlFor="message">Your message</label>
          <textarea
            id="message"
            value={message}
            maxLength={LIMITS.messageChars}
            onChange={(e) => editMessage(e.target.value)}
            placeholder="Merry Christmas! …"
            required
          />
          <p className="muted">
            {message.length}/{LIMITS.messageChars}
          </p>
        </div>
        <div>
          <label htmlFor="from">From (optional)</label>
          <input
            id="from"
            value={from}
            maxLength={LIMITS.fromChars}
            onChange={(e) => {
              pendingCardId.current = null;
              setFrom(e.target.value);
            }}
            placeholder="Leave blank to stay anonymous"
          />
        </div>
        {state === "error" && <p className="error">{error}</p>}
        <button
          type="submit"
          disabled={state === "sending" || state === "retrying" || !message.trim()}
        >
          {state === "sending"
            ? "Sending…"
            : state === "retrying"
              ? "Busy, retrying…"
            : state === "error"
              ? "Try again"
              : "Seal & send 🎄"}
        </button>
      </form>
    </main>
  );
}
