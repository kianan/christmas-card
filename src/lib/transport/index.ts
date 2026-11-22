import { createLocalTransport } from "./local";
import { createSupabaseTransport } from "./supabase";
import type { Transport } from "./types";

export type { Transport, Unsubscribe, MessageHandler } from "./types";

let instance: Transport | null = null;

/**
 * Uses Supabase when NEXT_PUBLIC_SUPABASE_URL / _KEY are set, otherwise the
 * same-browser local transport. Add `?local` to the URL to force local mode.
 */
export function getTransport(): Transport {
  if (instance) return instance;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  const forceLocal =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("local");
  instance =
    url && key && !forceLocal
      ? createSupabaseTransport(url, key)
      : createLocalTransport();
  return instance;
}
