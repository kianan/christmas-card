/**
 * End-to-end encryption for cards, using the browser's Web Crypto API.
 *
 * The display creates an ECDH P-256 key pair. Its public key travels to guests
 * inside the QR code's URL fragment (never sent to any server). Each guest
 * encrypts with a fresh ephemeral key (ECDH → HKDF → AES-GCM), so the relay
 * and the host remote only ever see ciphertext. Only the display tab, which
 * holds the private key, can decrypt.
 */

export interface SealedCard {
  epk: string; // guest's ephemeral public key (raw, base64url)
  iv: string; // AES-GCM IV (base64url)
  ct: string; // ciphertext (base64url)
}

export interface CardContent {
  message: string;
  from?: string;
}

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const INFO = new TextEncoder().encode("xmas-card-v1");

export function toB64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomId(bytes = 12): string {
  return toB64u(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Uniform random integer in [0, n). */
export function randomIndex(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

export async function generateKeyPair(): Promise<{
  publicKey: string;
  privateJwk: JsonWebKey;
}> {
  // Extractable so the key can survive a refresh via sessionStorage (wiped
  // when the tab closes or the party ends).
  const pair = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: toB64u(raw), privateJwk };
}

export const generateDisplayKeys = generateKeyPair;

async function aesKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  usage: KeyUsage,
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256,
  );
  const hkdf = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: INFO },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

/** Encrypt any JSON value for the holder of `recipientPublicKey`. */
export async function sealJson(
  recipientPublicKey: string,
  value: unknown,
): Promise<SealedCard> {
  const recipient = await crypto.subtle.importKey(
    "raw",
    fromB64u(recipientPublicKey),
    ECDH,
    false,
    [],
  );
  const eph = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
  const key = await aesKey(eph.privateKey, recipient, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const epk = await crypto.subtle.exportKey("raw", eph.publicKey);
  return { epk: toB64u(epk), iv: toB64u(iv), ct: toB64u(ct) };
}

export const sealCard = (displayPublicKey: string, content: CardContent) =>
  sealJson(displayPublicKey, content);

/** Decrypt a value sealed with sealJson / sealCard. */
export async function openJson<T>(
  privateJwk: JsonWebKey,
  card: SealedCard,
): Promise<T> {
  const priv = await crypto.subtle.importKey("jwk", privateJwk, ECDH, false, [
    "deriveBits",
  ]);
  const sender = await crypto.subtle.importKey(
    "raw",
    fromB64u(card.epk),
    ECDH,
    false,
    [],
  );
  const key = await aesKey(priv, sender, "decrypt");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64u(card.iv) },
    key,
    fromB64u(card.ct),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export const openCard = (privateJwk: JsonWebKey, card: SealedCard) =>
  openJson<CardContent>(privateJwk, card);

/* ---------- symmetric (export): key travels in a QR link's #fragment ---------- */

export interface SealedBox {
  iv: string;
  ct: string;
}

/** Fresh random AES-256 key, base64url (fits in a QR link). */
export function randomKey(): string {
  return toB64u(crypto.getRandomValues(new Uint8Array(32)));
}

const aesFromB64 = (keyB64: string, usage: KeyUsage) =>
  crypto.subtle.importKey("raw", fromB64u(keyB64), "AES-GCM", false, [usage]);

export async function sealWithKey(keyB64: string, value: unknown): Promise<SealedBox> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesFromB64(keyB64, "encrypt"), plain);
  return { iv: toB64u(iv), ct: toB64u(ct) };
}

export async function openWithKey<T>(keyB64: string, box: SealedBox): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64u(box.iv) },
    await aesFromB64(keyB64, "decrypt"),
    fromB64u(box.ct),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
