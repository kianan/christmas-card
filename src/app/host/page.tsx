"use client";

import { useState } from "react";
import { useHashParams } from "@/lib/hooks";
import { displayInbox, type CmdMsg, type HostAction } from "@/lib/protocol";
import { getTransport, RelayBusyError } from "@/lib/transport";

type Feedback = { kind: "ok" | "error"; text: string } | null;

const LABELS: Record<HostAction, string> = {
  "start-reveal": "Start reveal",
  next: "Next card",
  "back-to-collecting": "Back to collecting",
  end: "End party",
  remove: "Remove card",
};

/**
 * Host remote: one-way HTTP commands, no connection. The party screen shows
 * the result; this page only confirms the relay accepted the request.
 */
export default function HostPage() {
  const params = useHashParams();
  const [cardNo, setCardNo] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  if (params === null) return <main className="narrow">Loading…</main>;
  const room = params.r;
  const token = params.t;
  if (!room || !token) {
    return (
      <main className="narrow">
        <h1>Host remote</h1>
        <p>Press H on the party screen and scan the host QR code.</p>
      </main>
    );
  }

  async function cmd(action: HostAction, no?: number) {
    if (action === "end" && !confirm("End the party? All cards will be wiped for good."))
      return;
    if (action === "remove" && !confirm(`Remove card #${no}? It can't be brought back.`))
      return;
    const msg: CmdMsg = { token: token!, action, cardNo: no };
    setSending(true);
    setFeedback(null);
    try {
      await getTransport().send(displayInbox(room!), "cmd", msg);
      setFeedback({
        kind: "ok",
        text: `Sent ✓ ${action === "remove" ? `Remove #${no}` : LABELS[action]}. Check the party screen.`,
      });
      if (action === "remove") setCardNo("");
    } catch (e) {
      setFeedback({
        kind: "error",
        text:
          e instanceof RelayBusyError
            ? "The party service is busy. Try again in a moment."
            : "Couldn't send. Check your connection and try again.",
      });
    } finally {
      setSending(false);
    }
  }

  const no = Number(cardNo);
  const validNo = cardNo !== "" && Number.isInteger(no) && no > 0;

  return (
    <main className="narrow">
      <h1>🎅 Host remote</h1>
      <p className="muted">
        Each tap is sent to the party screen. Watch the screen to see it happen.
      </p>

      <div className="stack">
        <button disabled={sending} onClick={() => cmd("start-reveal")}>
          Start reveal
        </button>
        <button disabled={sending} onClick={() => cmd("next")}>
          Next card
        </button>
        <button className="secondary" disabled={sending} onClick={() => cmd("back-to-collecting")}>
          Back to collecting
        </button>
      </div>

      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (validNo) void cmd("remove", no);
        }}
      >
        <label htmlFor="card-no">Remove a prank card</label>
        <p className="muted">Enter the number shown on the revealed card (e.g. #3).</p>
        <div className="row">
          <input
            id="card-no"
            className="card-no-input"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="#"
            value={cardNo}
            onChange={(e) => setCardNo(e.target.value.replace(/\D/g, "").slice(0, 3))}
          />
          <button type="submit" disabled={sending || !validNo}>
            Remove
          </button>
        </div>
      </form>

      {feedback && (
        <p className={feedback.kind === "error" ? "error" : "muted"} role="status">
          {feedback.text}
        </p>
      )}

      <button className="secondary" disabled={sending} onClick={() => cmd("end")}>
        End party
      </button>
    </main>
  );
}
