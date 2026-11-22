"use client";

import { useRef, useState } from "react";
import { randomId, sealCard } from "@/lib/crypto";
import { useHashParams } from "@/lib/hooks";
import {
  clientInbox,
  displayInbox,
  LIMITS,
  type AckMsg,
  type CardMsg,
} from "@/lib/protocol";
import { getTransport } from "@/lib/transport";

const ACK_TIMEOUT_MS = 12_000;

export default function WritePage() {
  const params = useHashParams();
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const pendingCardId = useRef<string | null>(null); // reused on retry so the tree never gets duplicates
  const clientId = useRef<string | null>(null);

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

  async function send() {
    if (!message.trim()) return;
    setState("sending");
    setError("");
    const t = getTransport();
    const cardId = (pendingCardId.current ??= randomId());
    const me = (clientId.current ??= randomId());
    let unsub: (() => void) | undefined;
    try {
      const sealed = await sealCard(key, {
        message: message.trim(),
        from: from.trim() || undefined,
      });
      const ack = await new Promise<AckMsg>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), ACK_TIMEOUT_MS);
        t.listen(clientInbox(room, me), (event, payload) => {
          const a = payload as AckMsg;
          if (event === "ack" && a?.cardId === cardId) {
            clearTimeout(timer);
            resolve(a);
          }
        })
          .then((u) => {
            unsub = u;
            const msg: CardMsg = { ...sealed, cardId, replyTo: me };
            return t.send(displayInbox(room), "card", msg);
          })
          .catch((e) => {
            clearTimeout(timer);
            reject(e);
          });
      });
      if (!ack.ok) throw new Error(ack.reason ?? "The party screen didn't accept the card.");
      pendingCardId.current = null;
      setMessage("");
      setFrom("");
      setState("sent");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg === "timeout"
          ? "Couldn't reach the party screen. Make sure it's still open, then try again."
          : msg,
      );
      setState("error");
    } finally {
      unsub?.();
    }
  }

  if (state === "sent") {
    return (
      <main className="narrow">
        <h1>🎄 Your card is on the tree!</h1>
        <p>It&apos;s sealed. Nobody can read it until the reveal.</p>
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
        <button type="submit" disabled={state === "sending" || !message.trim()}>
          {state === "sending"
            ? "Hanging it on the tree…"
            : state === "error"
              ? "Try again"
              : "Seal & send 🎄"}
        </button>
      </form>
    </main>
  );
}
