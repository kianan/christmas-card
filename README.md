# Secret Christmas Cards

Guests scan a QR code on the party screen, write a secret card, and it hangs on
a virtual tree. The host starts the reveal; cards are picked at random and
opened on the big screen. Afterwards the host can save every wish as a keepsake
page.

**Demo:** https://christmas-card-five.vercel.app/ — open it on a laptop or TV,
then scan the QR code with your phone.

> Hosting a real party? Deploy your own copy (below). It's free, takes about
> 10 minutes, and your party won't share the demo's limits.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkianan%2Fchristmas-card&project-name=christmas-card&repository-name=christmas-card&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_KEY&envDescription=Your%20Supabase%20project%20URL%20and%20publishable%20key%20(see%20README%3A%20Deploy%20your%20own)&envLink=https%3A%2F%2Fgithub.com%2Fkianan%2Fchristmas-card%23deploy-your-own)

## Privacy model

- **No database.** The party lives only in the display tab (memory +
  `sessionStorage`). Closing the tab or pressing *End party* wipes it.
- **End-to-end encrypted.** The display creates a key pair; the public key goes
  to guests inside the QR link's `#fragment` (never sent to a server). Cards are
  encrypted on the phone (ECDH P-256 → HKDF → AES-GCM). The relay only ever
  sees ciphertext, and unrevealed cards stay secret even from the host.
- **Relay only.** Supabase Realtime *Broadcast* passes messages between devices
  and stores nothing. Only the display holds a connection (one per party);
  guests and the host remote send one-way HTTP requests.

## Pages

| Route | Who | What |
|---|---|---|
| `/display` | TV / projector | Tree, guest QR, reveal. Keys: `R` start reveal, `N`/`Space` next, `Esc` back to collecting, `E` end party, `S` switch scene, `D` remove card on screen, `X` export wishes, `H` host QR, `F` fullscreen |
| `/write#r=…&k=…` | Guests (via QR) | Write and send a card — one HTTP POST, no WebSocket; the display confirms with "Card received from K••••" |
| `/host#r=…&t=…` | Host's phone (press `H` on display) | Start reveal / next / back / end, and "Remove card #N" for pranks — one-way HTTP, no connection |
| `/export#r=…&x=…&k=…` | Host's phone (press `X` on display) | One-time, end-to-end encrypted export of the revealed wishes → keepsake page (.html): share, download or copy |

## Deploy your own

You need free accounts on [Supabase](https://supabase.com) (the relay) and
[Vercel](https://vercel.com) (hosting). No database tables, no server code to
manage.

### 1. Create the Supabase project

1. In Supabase, click **New project**. Pick the region closest to your guests.
   (The database password it asks for isn't used by this app.)
2. When it's ready, open **Project Settings → API Keys** and copy:
   - the **Project URL** (`https://<ref>.supabase.co`)
   - the **Publishable key** (`sb_publishable_…`, or the legacy `anon` key)

   Both are public by design: they end up in the browser anyway, and every card
   is encrypted before it's sent. **Never use the `sb_secret_…` / `service_role`
   key**; it has admin access to your project.
3. The app uses public Realtime **Broadcast** channels. If your project's
   Realtime settings have an option to allow only private channels, leave
   public access on.

### 2. Deploy to Vercel

1. Click **Deploy with Vercel** above (or fork the repo and import it in Vercel).
2. When asked for environment variables, enter:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_KEY` | your publishable key |

   If Vercel asks for a type, choose **Config**, not *Sensitive / Secret*:
   `NEXT_PUBLIC_` values are meant to reach the browser.
3. Deploy. If you add or change the variables later, **redeploy** so the new
   build picks them up.

### 3. Check it

Open `https://<your-app>.vercel.app/display`. The bottom-right corner should say
**"● Live · supabase"**, and there should be no yellow "Local test mode" banner.
Scan the QR code with your phone and send a card. It should appear as
"Card received from …" under the QR code.

### Limits & tips

- Free Supabase allows **200 live connections**. Only the party screen holds
  one (guests and the host remote use one-way HTTP), so that's about 200
  parties at the same moment.
- Free Supabase projects **pause after about a week without activity**. Open
  your display page the day before the party to wake it up.
- Watch usage under **Reports → Realtime** in Supabase if you share your link
  widely.

## Run locally

```bash
npm install
npm run dev
```

Without env vars it runs in **local mode** (tabs of the same browser talk via
`BroadcastChannel`). Append `?local` to any URL to force it.

To work across devices, copy `.env.example` to `.env.local` and fill in your
Supabase project URL and publishable key.

To test with phones on your Wi-Fi, serve over HTTPS (browsers only allow the
encryption on HTTPS or `localhost`). Create a self-signed certificate for your
computer's LAN IP once (`.certs/` is gitignored), then run `npm run dev:lan`:

```bash
mkdir -p .certs && IP=192.168.1.23  # your computer's LAN IP
openssl req -x509 -newkey rsa:2048 -nodes -days 60 \
  -keyout .certs/key.pem -out .certs/cert.pem -subj "/CN=christmas-card-dev" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$IP"
npm run dev:lan
```

Open `https://<LAN IP>:3000/display` (not `localhost`, so the QR code points
somewhere phones can reach). Phones show a certificate warning you can tap
through.

## Code map

- `src/lib/transport/` — swappable message relay (`supabase`, `local`)
- `src/lib/crypto.ts` — card encryption
- `src/lib/protocol.ts` — message types between display / guest / host
- `src/party/useDisplaySession.ts` — party state machine (display only)
- `src/scene/` — swappable art: `scenes/` (backgrounds + hang settings), `cards/` (card art), `hang/` (centre-out layout), `Stage.tsx`
- `public/scenes/` — looping background videos (see `public/scenes/CREDITS.md`). Pick one with `?scene=tree|tree-lights|fireplace|fireplace-logs|plain` or press `S`

## License

[MIT](LICENSE). Background footage: Mixkit Free License, see
[`public/scenes/CREDITS.md`](public/scenes/CREDITS.md).
