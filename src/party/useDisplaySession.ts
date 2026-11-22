"use client";

/**
 * The party session. It lives only in the display tab: in memory plus
 * sessionStorage (so an accidental refresh survives, but closing the tab or
 * ending the party wipes everything). No server stores anything.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateDisplayKeys,
  openCard,
  randomId,
  randomIndex,
  type CardContent,
  type SealedCard,
} from "@/lib/crypto";
import {
  clientInbox,
  displayInbox,
  isCardMsg,
  LIMITS,
  type AckMsg,
  type CmdMsg,
  type Phase,
  type StatusMsg,
} from "@/lib/protocol";
import { getTransport } from "@/lib/transport";

export interface StoredCard extends SealedCard {
  id: string;
  receivedAt: number;
  revealedAt?: number;
}

export interface DisplaySession {
  room: string;
  hostToken: string;
  publicKey: string;
  privateJwk: JsonWebKey;
  phase: Phase;
  cards: StoredCard[]; // still encrypted; decrypted one at a time on reveal
  currentId?: string;
}

export interface RevealedCard {
  id: string;
  content: CardContent;
}

const STORAGE_KEY = "xmas-display-session";

function load(): DisplaySession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DisplaySession) : null;
  } catch {
    return null;
  }
}

function save(s: DisplaySession) {
  try {
    if (s.phase === "ended") sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage unavailable (private mode etc.) — memory only
  }
}

async function createSession(): Promise<DisplaySession> {
  const { publicKey, privateJwk } = await generateDisplayKeys();
  return {
    room: randomId(9),
    hostToken: randomId(12),
    publicKey,
    privateJwk,
    phase: "collecting",
    cards: [],
  };
}

export function toStatus(s: DisplaySession): StatusMsg {
  return {
    phase: s.phase,
    total: s.cards.length,
    revealed: s.cards.filter((c) => c.revealedAt).length,
    showing: Boolean(s.currentId),
  };
}

export function useDisplaySession() {
  const [session, setSession] = useState<DisplaySession | null>(null);
  const [current, setCurrent] = useState<RevealedCard | null>(null);
  const [connection, setConnection] = useState<
    "connecting" | "online" | "error"
  >("connecting");
  const ref = useRef<DisplaySession | null>(null);
  const hosts = useRef(new Set<string>());

  const commit = useCallback((next: DisplaySession) => {
    ref.current = next;
    save(next);
    setSession(next);
    const status = toStatus(next);
    for (const h of hosts.current) {
      getTransport()
        .send(clientInbox(next.room, h), "status", status)
        .catch(() => {});
    }
  }, []);

  const showCard = useCallback(async (s: DisplaySession, id: string) => {
    const card = s.cards.find((c) => c.id === id);
    if (!card) return setCurrent(null);
    try {
      const content = await openCard(s.privateJwk, card);
      if (ref.current?.currentId === id) setCurrent({ id, content });
    } catch {
      setCurrent({ id, content: { message: "⚠️ This card couldn't be opened." } });
    }
  }, []);

  const startReveal = useCallback(() => {
    const s = ref.current;
    if (!s || s.phase === "ended") return;
    setCurrent(null);
    commit({ ...s, phase: "revealing", currentId: undefined });
  }, [commit]);

  const revealNext = useCallback(() => {
    const s = ref.current;
    if (!s || s.phase === "ended") return;
    setCurrent(null);
    const remaining = s.cards.filter((c) => !c.revealedAt);
    if (remaining.length === 0) {
      commit({ ...s, phase: "revealing", currentId: undefined });
      return;
    }
    const pick = remaining[randomIndex(remaining.length)];
    const next: DisplaySession = {
      ...s,
      phase: "revealing",
      currentId: pick.id,
      cards: s.cards.map((c) =>
        c.id === pick.id ? { ...c, revealedAt: Date.now() } : c,
      ),
    };
    commit(next);
    void showCard(next, pick.id);
  }, [commit, showCard]);

  const backToCollecting = useCallback(() => {
    const s = ref.current;
    if (!s || s.phase === "ended") return;
    setCurrent(null);
    commit({ ...s, phase: "collecting", currentId: undefined });
  }, [commit]);

  const endParty = useCallback(() => {
    const s = ref.current;
    if (!s) return;
    setCurrent(null);
    // Drop the cards and the private key: nothing can be recovered.
    commit({ ...s, phase: "ended", cards: [], privateJwk: {}, currentId: undefined });
  }, [commit]);

  const newParty = useCallback(async () => {
    hosts.current.clear();
    setCurrent(null);
    setConnection("connecting");
    commit(await createSession());
  }, [commit]);

  const handleMessage = useCallback(
    (event: string, payload: unknown) => {
      const s = ref.current;
      if (!s) return;
      const t = getTransport();

      if (event === "card") {
        if (!isCardMsg(payload)) return;
        const { cardId, replyTo, epk, iv, ct } = payload;
        const reply = (ack: Omit<AckMsg, "cardId">) =>
          t
            .send(clientInbox(s.room, replyTo), "ack", { cardId, ...ack })
            .catch(() => {});
        if (s.phase === "ended")
          return void reply({ ok: false, reason: "This party has ended." });
        if (s.cards.some((c) => c.id === cardId)) return void reply({ ok: true });
        if (s.cards.length >= LIMITS.maxCards)
          return void reply({ ok: false, reason: "The tree is full!" });
        commit({
          ...s,
          cards: [...s.cards, { id: cardId, epk, iv, ct, receivedAt: Date.now() }],
        });
        return void reply({ ok: true });
      }

      if (event === "host-hello" || event === "cmd") {
        const p = (payload ?? {}) as Partial<CmdMsg>;
        if (p.token !== s.hostToken) return;
        if (typeof p.replyTo !== "string" || p.replyTo.length > 64) return;
        hosts.current.add(p.replyTo);
        if (event === "cmd") {
          if (p.action === "start-reveal") startReveal();
          else if (p.action === "next") revealNext();
          else if (p.action === "back-to-collecting") backToCollecting();
          else if (p.action === "end") endParty();
        }
        // Always answer the sender (commit() also notifies all hosts).
        const latest = ref.current;
        if (latest)
          t.send(clientInbox(s.room, p.replyTo), "status", toStatus(latest)).catch(
            () => {},
          );
      }
    },
    [commit, startReveal, revealNext, backToCollecting, endParty],
  );

  // Load (after a refresh) or create the session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = load();
      const s =
        existing && existing.phase !== "ended" ? existing : await createSession();
      if (cancelled) return;
      ref.current = s;
      save(s);
      setSession(s);
      if (s.currentId) void showCard(s, s.currentId);
    })();
    return () => {
      cancelled = true;
    };
  }, [showCard]);

  // Listen on the display inbox while the party is running.
  const room = session?.room;
  const ended = session?.phase === "ended";
  useEffect(() => {
    if (!room || ended) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    getTransport()
      .listen(displayInbox(room), handleMessage)
      .then((u) => {
        if (cancelled) return u();
        unsub = u;
        setConnection("online");
      })
      .catch(() => {
        if (!cancelled) setConnection("error");
      });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [room, ended, handleMessage]);

  return {
    session,
    current,
    connection,
    startReveal,
    revealNext,
    backToCollecting,
    endParty,
    newParty,
  };
}
