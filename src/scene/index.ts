import { plainTheme } from "./themes/plain";
import type { Theme } from "./types";

export type { Theme } from "./types";

/** Swap the active art theme here (later: pick via ?theme= or env var). */
export const theme: Theme = plainTheme;
