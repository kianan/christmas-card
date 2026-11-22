"use client";

import { useEffect, useRef } from "react";

/**
 * Shown after End party. "Return to homepage" is pre-selected so a TV remote's
 * OK does the safe thing; arrows move between the two buttons.
 */
export function EndedScreen({ onHome, onNewParty }: { onHome: () => void; onNewParty: () => void }) {
  const home = useRef<HTMLButtonElement>(null);
  const fresh = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    home.current?.focus({ focusVisible: true } as FocusOptions);
    const onKey = (e: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      (document.activeElement === home.current ? fresh : home).current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="narrow centered">
      <h1>🎅 The party has ended</h1>
      <p>All cards and keys have been wiped from this screen.</p>
      <div className="row ended-actions">
        <button ref={home} className="focus-ring" onClick={onHome}>
          Return to homepage
        </button>
        <button ref={fresh} className="secondary focus-ring" onClick={onNewParty}>
          Start a new party
        </button>
      </div>
    </main>
  );
}
