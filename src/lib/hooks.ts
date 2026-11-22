"use client";

import { useSyncExternalStore } from "react";
import { getTransport } from "./transport";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** Params from the URL #fragment; null during server render. */
export function useHashParams(): Record<string, string> | null {
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => null,
  );
  if (hash === null) return null;
  return Object.fromEntries(new URLSearchParams(hash.slice(1)).entries());
}

const noopSubscribe = () => () => {};

/** "supabase" | "local", or null during server render. */
export function useTransportName(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => getTransport().name,
    () => null,
  );
}

/** Current page's ?query string (to carry "?local" into QR links). */
export function useSearch(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.search,
    () => "",
  );
}

export function useOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}
