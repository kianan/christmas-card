"use client";

import { useEffect, useState } from "react";
import { openWithKey } from "@/lib/crypto";
import { useHashParams } from "@/lib/hooks";
import {
  downloadFile,
  keepsakeFilename,
  keepsakeHtml,
  keepsakeText,
  type KeepsakeData,
} from "@/lib/keepsake";
import { displayInbox, exportInbox, type ExportChunkMsg } from "@/lib/protocol";
import { getTransport } from "@/lib/transport";

const TIMEOUT_MS = 20_000;

type State =
  | { kind: "waiting" }
  | { kind: "done"; data: KeepsakeData }
  | { kind: "error"; text: string };

/**
 * Opened by scanning the display's export QR. Listens briefly on a one-time
 * inbox, tells the display it's ready, receives the wishes encrypted with the
 * key from the QR's #fragment, then disconnects. Nothing is stored online.
 */
export default function ExportPage() {
  const params = useHashParams();
  const room = params?.r;
  const exportId = params?.x;
  const key = params?.k;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "waiting" });
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!room || !exportId || !key) return;
    const t = getTransport();
    const parts = new Map<number, string>();
    let done = false;
    const conn: { unsub?: () => void } = {};

    const finish = (next: State) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      conn.unsub?.(); // release the connection straight away
      setState(next);
    };

    const timer = setTimeout(
      () =>
        finish({
          kind: "error",
          text: "Couldn't reach the party screen. This code may have been used already. Press X on the party screen for a new one, then scan again.",
        }),
      TIMEOUT_MS,
    );

    conn.unsub = t.listen(
      exportInbox(room, exportId),
      (event, payload) => {
        if (event !== "export") return;
        const c = payload as ExportChunkMsg;
        parts.set(c.part, c.data);
        if (parts.size < c.total) return;
        const ct = Array.from({ length: c.total }, (_, i) => parts.get(i) ?? "").join("");
        openWithKey<KeepsakeData>(key, { iv: c.iv, ct })
          .then((data) => finish({ kind: "done", data }))
          .catch(() => finish({ kind: "error", text: "The wishes couldn't be opened. Make a new code and try again." }));
      },
      (status) => {
        // Listening: now ask the display to send.
        if (status === "online")
          void t.send(displayInbox(room), "export-ready", { exportId }).catch(() => {});
      },
    );

    return () => {
      done = true;
      clearTimeout(timer);
      conn.unsub?.();
    };
  }, [room, exportId, key, attempt]);

  if (params === null) return <main className="narrow">Loading…</main>;
  if (!room || !exportId || !key) {
    return (
      <main className="narrow">
        <h1>Save the wishes</h1>
        <p>Press X on the party screen and scan the export QR code.</p>
      </main>
    );
  }

  if (state.kind === "waiting") {
    return (
      <main className="narrow">
        <h1>🎁 Fetching the wishes…</h1>
        <p className="muted">Keep this page open for a few seconds.</p>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="narrow">
        <h1>Save the wishes</h1>
        <p className="error">{state.text}</p>
        <button
          onClick={() => {
            setState({ kind: "waiting" });
            setAttempt((a) => a + 1);
          }}
        >
          Try again
        </button>
      </main>
    );
  }

  const { data } = state;
  const html = keepsakeHtml(data);
  const text = keepsakeText(data);
  const file = keepsakeFilename(data);

  const share = async () => {
    const f = new File([html], file, { type: "text/html" });
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: data.title });
      else await navigator.share({ title: data.title, text });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote("Sharing isn't available here. Use Download instead.");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied ✓");
    } catch {
      setNote("Couldn't copy. Use Download instead.");
    }
  };

  return (
    <main className="narrow">
      <h1>🎄 {data.wishes.length} {data.wishes.length === 1 ? "wish" : "wishes"} saved</h1>
      <p className="muted">
        This page holds the only copy. Save it now: nothing is stored online, and the
        party screen wipes everything when the party ends.
      </p>
      <div className="stack">
        {typeof navigator !== "undefined" && "share" in navigator && (
          <button onClick={share}>Share or save…</button>
        )}
        <button className={"share" in navigator ? "secondary" : ""} onClick={() => downloadFile(file, html)}>
          Download keepsake (.html)
        </button>
        <button className="secondary" onClick={copy}>
          Copy as text
        </button>
      </div>
      {note && <p className="muted" role="status">{note}</p>}
      <section className="stack">
        {data.wishes.map((w, i) => (
          <div key={i} className="panel export-wish">
            {w.no !== undefined && <span className="export-no">#{w.no}</span>}
            <p>{w.message}</p>
            <p className="muted">— {w.from || "Secret Santa"}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
