# Secret Christmas Cards

Guests scan a QR code on the party screen, write a secret card, and it hangs on
a virtual tree. The host starts the reveal; cards are picked at random and
opened on the big screen.

## Privacy model

- **No database.** The party lives only in the display tab (memory +
  `sessionStorage`). Closing the tab or pressing *End party* wipes it.
- **End-to-end encrypted.** The display creates a key pair; the public key goes
  to guests inside the QR link's `#fragment` (never sent to a server). Cards are
  encrypted on the phone (ECDH P-256 → HKDF → AES-GCM). The relay and the host
  remote only see ciphertext / counts.
- **Relay only.** Supabase Realtime *Broadcast* passes messages between devices
  and stores nothing. Only the display holds a connection (one per party);
  guests and the host remote send one-way HTTP requests.

## Pages

| Route | Who | What |
|---|---|---|
| `/display` | TV / projector | Tree, guest QR, reveal. Keys: `R` start reveal, `N`/`Space` next, `Esc` back to collecting, `E` end party, `S` switch scene, `D` remove card on screen, `H` host QR, `F` fullscreen |
| `/write#r=…&k=…` | Guests (via QR) | Write and send a card — one HTTP POST, no WebSocket; the display confirms with "Card received from K••••" |
| `/host#r=…&t=…` | Host's phone (press `H` on display) | Start reveal / next / back / end, and "Remove card #N" for pranks — one-way HTTP, no connection |

## Run locally

```bash
npm install
npm run dev
```

Without env vars it runs in **local mode** (tabs of the same browser talk via
`BroadcastChannel`). Append `?local` to any URL to force it.

To work across devices, copy `.env.example` to `.env.local` and fill in your
Supabase project URL and publishable key.

## Code map

- `src/lib/transport/` — swappable message relay (`supabase`, `local`)
- `src/lib/crypto.ts` — card encryption
- `src/lib/protocol.ts` — message types between display / guest / host
- `src/party/useDisplaySession.ts` — party state machine (display only)
- `src/scene/` — swappable art: `scenes/` (backgrounds + hang settings), `cards/` (card art), `hang/` (centre-out layout), `Stage.tsx`
- `public/scenes/` — looping background videos (see `public/scenes/CREDITS.md`). Pick one with `?scene=tree|tree-lights|fireplace|fireplace-logs|plain` or press `S`
