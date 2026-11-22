"use client";

/**
 * The party session. It lives only in the display tab: in memory plus
 * sessionStorage (so an accidental refresh survives, but closing the tab or
 * ending the party wipes everything). No server stores anything.
 *
 * The display is the only participant that listens (one connection). Guests
 * and the host remote send one-way HTTP requests and watch the screen.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateDisplayKeys,
  openCard,
  randomId,
  randomIndex,
  randomKey,
  sealWithKey,
  type CardContent,
  type SealedCard,
} from "@/lib/crypto";
import type { KeepsakeData } from "@/lib/keepsake";
import {
  displayInbox,
  EXPORT_CHUNK_CHARS,
  exportInbox,
  isCardMsg,
  LIMITS,
  type CmdMsg,
  type ExportChunkMsg,
  type ExportReadyMsg,
  type Phase,
} from "@/lib/protocol";
import { getTransport, type ListenStatus } from "@/lib/transport";

export interface StoredCard extends SealedCard {
  id: string;
  receivedAt: number;
  revealedAt?: number;
  /** #N shown on screen: reveal order, from 1. Stable even if cards are removed. */
  revealNo?: number;
  /** Removed by the host (prank). Kept as a tombstone so other cards keep their slots. */
  removed?: boolean;
  /** First character of the sender's name (sent in the clear), for "received from K••••". */
  initial?: string;
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
  number?: number; // reveal number (#N)
  content: CardContent;
}

/** A one-time export offer shown as a QR (id + key live only in the QR link). */
export interface ExportOffer {
  id: string;
  key: string;
  status: "waiting" | "sending" | "sent" | "failed";
}

const EXPORT_TTL_MS = 10 * 60_000;

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

const UNREADABLE: CardContent = { message: "⚠️ This card couldn't be opened." };

export function useDisplaySession() {
  const [session, setSession] = useState<DisplaySession | null>(null);
  const [current, setCurrent] = useState<RevealedCard | null>(null);
  /** Decrypted revealed cards, in reveal order — for the looping display. */
  const [revealedCards, setRevealedCards] = useState<RevealedCard[]>([]);
  /** Live relay status: guests' cards only arrive while this is "online". */
  const [connection, setConnection] = useState<ListenStatus>("connecting");
  /** Has this party ever been live? (busy at start = couldn't open the party) */
  const [everOnline, setEverOnline] = useState(false);
  const [exportOffer, setExportOffer] = useState<ExportOffer | null>(null);
  /** Wishes saved this session (phone or download) — End party warns if not. */
  const [exported, setExported] = useState(false);
  const ref = useRef<DisplaySession | null>(null);
  const contents = useRef(new Map<string, CardContent>()); // id → decrypted, revealed only
  const offerRef = useRef<(ExportOffer & { expires: number }) | null>(null);

  /** Rebuild the revealed list from the session + decrypted contents. */
  const refreshRevealed = useCallback(() => {
    const s = ref.current;
    if (!s) return setRevealedCards([]);
    const list = s.cards
      .filter((c) => c.revealedAt && !c.removed && contents.current.has(c.id))
      .sort((a, b) => (a.revealedAt ?? 0) - (b.revealedAt ?? 0))
      .map((c) => ({ id: c.id, number: c.revealNo, content: contents.current.get(c.id)! }));
    setRevealedCards(list);
  }, []);

  const commit = useCallback((next: DisplaySession) => {
    ref.current = next;
    save(next);
    setSession(next);
  }, []);

  /** Decrypt a card (cached). */
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
      const number = s.cards.find((c) => c.id === id)?.revealNo;
      if (ref.current?.currentId === id) setCurrent({ id, number, content });
      refreshRevealed();
    },
    [decrypt, refreshRevealed],
  );

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
    const remaining = live(s).filter((c) => !c.revealedAt);
    if (remaining.length === 0) {
      commit({ ...s, phase: "revealing", currentId: undefined });
      return;
    }
    const pick = remaining[randomIndex(remaining.length)];
    // Numbers follow reveal order (random), never arrival order, so a number
    // can't be matched to who scanned the QR when.
    const revealNo = Math.max(0, ...s.cards.map((c) => c.revealNo ?? 0)) + 1;
    const next: DisplaySession = {
      ...s,
      phase: "revealing",
      currentId: pick.id,
      cards: s.cards.map((c) =>
        c.id === pick.id ? { ...c, revealedAt: Date.now(), revealNo } : c,
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
    },
    [commit, refreshRevealed],
  );

  /** Revealed (not removed) wishes, in reveal order — what gets exported. */
  const buildExport = useCallback((): KeepsakeData => {
    const s = ref.current;
    const wishes = (s?.cards ?? [])
      .filter((c) => c.revealedAt && !c.removed && contents.current.has(c.id))
      .sort((a, b) => (a.revealNo ?? 0) - (b.revealNo ?? 0))
      .map((c) => ({ no: c.revealNo, ...contents.current.get(c.id)! }));
    return { title: "Our Christmas wishes", date: new Date().toISOString(), wishes };
  }, []);

  /** Show a fresh one-time export QR. */
  const offerExport = useCallback(() => {
    const offer: ExportOffer = { id: randomId(9), key: randomKey(), status: "waiting" };
    offerRef.current = { ...offer, expires: Date.now() + EXPORT_TTL_MS };
    setExportOffer(offer);
  }, []);

  const closeExport = useCallback(() => {
    offerRef.current = null;
    setExportOffer(null);
  }, []);

  const markExported = useCallback(() => setExported(true), []);

  /** Phone scanned the export QR and is listening: send it the wishes, once. */
  const sendExport = useCallback(
    async (offer: ExportOffer) => {
      const s = ref.current;
      if (!s) return;
      setExportOffer({ ...offer, status: "sending" });
      try {
        const box = await sealWithKey(offer.key, buildExport());
        const total = Math.max(1, Math.ceil(box.ct.length / EXPORT_CHUNK_CHARS));
        for (let part = 0; part < total; part++) {
          const msg: ExportChunkMsg = {
            part,
            total,
            iv: box.iv,
            data: box.ct.slice(part * EXPORT_CHUNK_CHARS, (part + 1) * EXPORT_CHUNK_CHARS),
          };
          await getTransport().send(exportInbox(s.room, offer.id), "export", msg);
        }
        setExportOffer({ ...offer, status: "sent" });
        setExported(true);
      } catch {
        setExportOffer({ ...offer, status: "failed" });
      }
    },
    [buildExport],
  );

  /** Remove the revealed card shown as #N (host remote). */
  const removeByNumber = useCallback(
    (n: number) => {
      const card = ref.current?.cards.find((c) => c.revealNo === n && !c.removed);
      if (card) removeCard(card.id);
    },
    [removeCard],
  );

  const endParty = useCallback(() => {
    const s = ref.current;
    if (!s) return;
    setCurrent(null);
    contents.current.clear();
    setRevealedCards([]);
    offerRef.current = null;
    setExportOffer(null);
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
    contents.current.clear();
    setCurrent(null);
    setRevealedCards([]);
    setConnection("connecting");
    setEverOnline(false);
    setExported(false);
    commit(await createSession());
  }, [commit]);

  const handleMessage = useCallback(
    (event: string, payload: unknown) => {
      const s = ref.current;
      if (!s) return;

      if (event === "card") {
        // Fire-and-forget from guests: no reply. The guest checks the
        // "Card received from K••••" feed on screen instead.
        if (!isCardMsg(payload)) return;
        if (s.phase === "ended") return;
        const { cardId, epk, iv, ct, initial } = payload;
        // Known id (a retry, or a removed card): don't add it again.
        if (s.cards.some((c) => c.id === cardId)) return;
        if (s.cards.length >= LIMITS.maxCards) return;
        commit({
          ...s,
          cards: [...s.cards, { id: cardId, epk, iv, ct, initial, receivedAt: Date.now() }],
        });
        return;
      }

      if (event === "export-ready") {
        const o = offerRef.current;
        const id = (payload as Partial<ExportReadyMsg> | null)?.exportId;
        if (!o || id !== o.id || Date.now() > o.expires) return;
        offerRef.current = null; // one-time: a second scan gets nothing
        void sendExport(o);
        return;
      }

      if (event === "cmd") {
        // Host remote, fire-and-forget. Only obey the host token from the host QR.
        const p = (payload ?? {}) as Partial<CmdMsg>;
        if (p.token !== s.hostToken) return;
        if (p.action === "start-reveal") startReveal();
        else if (p.action === "next") revealNext();
        else if (p.action === "back-to-collecting") backToCollecting();
        else if (p.action === "end") endParty();
        else if (p.action === "remove" && Number.isInteger(p.cardNo)) removeByNumber(p.cardNo!);
      }
    },
    [commit, startReveal, revealNext, backToCollecting, endParty, removeByNumber, sendExport],
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

  // Listen on the display inbox while the party is running. After End party
  // this stops listening, so the display's one connection is released
  // (Supabase closes the socket shortly after its last channel goes).
  const room = session?.room;
  const ended = session?.phase === "ended";
  useEffect(() => {
    if (!room || ended) return;
    return getTransport().listen(displayInbox(room), handleMessage, (status) => {
      setConnection(status);
      if (status === "online") setEverOnline(true);
    });
  }, [room, ended, handleMessage]);

  return {
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
  };
}
