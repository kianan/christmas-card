"use client";

import Link from "next/link";
import { useSearch } from "@/lib/hooks";

export default function Home() {
  const search = useSearch();
  return (
    <main className="narrow">
      <h1>🎄 Secret Christmas Cards</h1>
      <p>
        Open the party screen on the TV or projector. Guests scan its QR code,
        write a secret card, and it hangs on the tree until the reveal.
      </p>
      <div className="panel stack">
        <strong>Private by design</strong>
        <p className="muted">
          Cards are encrypted on each guest&apos;s phone. Only the party screen can
          open them. Nothing is saved on a server, and when the party screen
          is closed or the party ends, every card is gone.
        </p>
      </div>
      <Link className="button" href={`/display${search}`}>
        Open the party screen
      </Link>
    </main>
  );
}
