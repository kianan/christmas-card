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
  sealJson,
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
  type RevealedList,
  type StatusMsg,
} from "@/lib/protocol";
import { getTransport } from "@/lib/transport";

export interface StoredCard extends SealedCard {
  id: string;
  receivedAt: number;
  revealedAt?: number;
  /** Removed by the host (prank). Kept as a tombstone so other cards keep their slots. */
  removed?: boolean;
}

export interface DisplaySession {
  room: string;
  hostToken: string;
  publicKey: string;
  privateJwk: JsonWebKey;
  phase: Phase;
  cards: StoredCard[]; // still encrypted; decrypted one at a time on reveal
  currentId?: string;
  sceneId?: string; // chosen background scene (resolved by the display page)
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

const live = (s: DisplaySession) => s.cards.filter((c) => !c.removed);

export function toStatus(s: DisplaySession): StatusMsg {
  const cards = live(s);
  return {
    phase: s.phase,
    total: cards.length,
    revealed: cards.filter((c) => c.revealedAt).length,
    showing: Boolean(s.currentId),
  };
}

const UNREADABLE: CardContent = { message: "⚠️ This card couldn't be opened." };

export function useDisplaySession() {
  const [session, setSession] = useState<DisplaySession | null>(null);
  const [current, setCurrent] = useState<RevealedCard | null>(null);
  /** Decrypted revealed cards, in reveal order — for the looping display. */
  const [revealedCards, setRevealedCards] = useState<RevealedCard[]>([]);
  const [connection, setConnection] = useState<
    "connecting" | "online" | "error"
  >("connecting");
  const ref = useRef<DisplaySession | null>(null);
  const contents = useRef(new Map<string, CardContent>()); // id → decrypted, revealed only
  const hosts = useRef(new Map<string, string | undefined>()); // host client id → its public key

  /** Rebuild the revealed list from the session + decrypted contents. */
  const refreshRevealed = useCallback(() => {
    const s = ref.current;
    if (!s) return setRevealedCards([]);
    const list = s.cards
      .filter((c) => c.revealedAt && !c.removed && contents.current.has(c.id))
      .sort((a, b) => (a.revealedAt ?? 0) - (b.revealedAt ?? 0))
      .map((c) => ({ id: c.id, content: contents.current.get(c.id)! }));
    setRevealedCards(list);
  }, []);

  /** Send each host remote the revealed cards, encrypted to that host's key. */
  const pushRevealedToHosts = useCallback((only?: string) => {
    const s = ref.current;
    if (!s) return;
    const items = s.cards
      .filter((c) => c.revealedAt && !c.removed && contents.current.has(c.id))
      .sort((a, b) => (b.revealedAt ?? 0) - (a.revealedAt ?? 0)) // newest first
      .slice(0, LIMITS.hostListItems)
      .map((c) => ({ id: c.id, ...contents.current.get(c.id)! }));
    const list: RevealedList = { currentId: s.currentId, items };
    for (const [h, pubKey] of hosts.current) {
      if (!pubKey || (only && h !== only)) continue;
      void sealJson(pubKey, list)
        .then((sealed) => getTransport().send(clientInbox(s.room, h), "revealed", sealed))
        .catch(() => {});
    }
  }, []);

  const commit = useCallback((next: DisplaySession) => {
    ref.current = next;
    save(next);
    setSession(next);
    const status = toStatus(next);
    for (const h of hosts.current.keys()) {
      getTransport()
        .send(clientInbox(next.room, h), "status", status)
        .catch(() => {});
    }
  }, []);

  /** Decrypt a card (cached), remember it as revealed, update loop + hosts. */
  const decrypt = useCallback(
    async (s: DisplaySession, id: string): Promise<CardContent> => {
      const cached = contents.current.get(id);
      if (cached) return cached;
      const card = s.cards.find((c) => c.id === id);
      let content = UNREADABLE;
      if (card) {
        try {
          content = await openCard(s.privateJwk, card);
        } catch {
          // keep UNREADABLE
        }
      }
      contents.current.set(id, content);
      return content;
    },
    [],
  );

  const showCard = useCallback(
    async (s: DisplaySession, id: string) => {
      const content = await decrypt(s, id);
      if (ref.current?.currentId === id) setCurrent({ id, content });
      refreshRevealed();
      pushRevealedToHosts();
    },
    [decrypt, refreshRevealed, pushRevealedToHosts],
  );

  const startReveal = useCallback(() => {
    const s = ref.current;
    if (!s || s.phase === "ended") return;
    setCurrent(null);
    commit({ ...s, phase: "revealing", currentId: undefined });
    pushRevealedToHosts();
  }, [commit, pushRevealedToHosts]);

  const revealNext = useCallback(() => {
    const s = ref.current;
    if (!s || s.phase === "ended") return;
    setCurrent(null);
    const remaining = live(s).filter((c) => !c.revealedAt);
    if (remaining.length === 0) {
      commit({ ...s, phase: "revealing", currentId: undefined });
      pushRevealedToHosts();
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
  }, [commit, showCard, pushRevealedToHosts]);

  const backToCollecting = useCallback(() => {
    const s = ref.current;
    if (!s || s.phase === "ended") return;
    setCurrent(null);
    commit({ ...s, phase: "collecting", currentId: undefined });
    pushRevealedToHosts();
  }, [commit, pushRevealedToHosts]);

  /** Remove a card (e.g. a prank). Its text and ciphertext are dropped. */
  const removeCard = useCallback(
    (id: string) => {
      const s = ref.current;
      if (!s || s.phase === "ended") return;
      contents.current.delete(id);
      const isCurrent = s.currentId === id;
      if (isCurrent) setCurrent(null);
      commit({
        ...s,
        currentId: isCurrent ? undefined : s.currentId,
        cards: s.cards.map((c) =>
          c.id === id ? { ...c, removed: true, epk: "", iv: "", ct: "" } : c,
        ),
      });
      refreshRevealed();
      pushRevealedToHosts();
    },
    [commit, refreshRevealed, pushRevealedToHosts],
  );

  const endParty = useCallback(() => {
    const s = ref.current;
    if (!s) return;
    setCurrent(null);
    contents.current.clear();
    setRevealedCards([]);
    // Drop the cards and the private key: nothing can be recovered.
    commit({ ...s, phase: "ended", cards: [], privateJwk: {}, currentId: undefined });
  }, [commit]);

  const setScene = useCallback(
    (sceneId: string) => {
      const s = ref.current;
      if (!s || s.phase === "ended") return;
      commit({ ...s, sceneId });
    },
    [commit],
  );

  const newParty = useCallback(async () => {
    hosts.current.clear();
    contents.current.clear();
    setCurrent(null);
    setRevealedCards([]);
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
        // Known id (incl. a removed one): ack without re-adding.
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
        const pubKey =
          typeof p.pubKey === "string" && p.pubKey.length < 200 ? p.pubKey : undefined;
        const isNewHost = hosts.current.get(p.replyTo) !== pubKey;
        hosts.current.set(p.replyTo, pubKey);
        if (event === "cmd") {
          if (p.action === "start-reveal") startReveal();
          else if (p.action === "next") revealNext();
          else if (p.action === "back-to-collecting") backToCollecting();
          else if (p.action === "end") endParty();
          else if (p.action === "remove" && typeof p.cardId === "string") removeCard(p.cardId);
        }
        // Always answer the sender (commit() also notifies all hosts).
        const latest = ref.current;
        if (latest)
          t.send(clientInbox(s.room, p.replyTo), "status", toStatus(latest)).catch(
            () => {},
          );
        if (event === "host-hello" && isNewHost) pushRevealedToHosts(p.replyTo);
      }
    },
    [commit, startReveal, revealNext, backToCollecting, endParty, removeCard, pushRevealedToHosts],
  );

  // Load (after a refresh) or create the session; re-open already revealed cards.
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
      for (const c of s.cards) {
        if (c.revealedAt && !c.removed) await decrypt(s, c.id);
      }
      if (cancelled) return;
      if (s.currentId) void showCard(s, s.currentId);
      else refreshRevealed();
    })();
    return () => {
      cancelled = true;
    };
  }, [decrypt, showCard, refreshRevealed]);

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
    revealedCards,
    connection,
    startReveal,
    revealNext,
    backToCollecting,
    removeCard,
    endParty,
    newParty,
    setScene,
  };
}
