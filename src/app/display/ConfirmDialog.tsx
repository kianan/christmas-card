"use client";

import { useEffect, useRef } from "react";

export interface DialogAction {
  label: string;
  onSelect: () => void;
  /** "primary" = filled button; "danger" = red outline; default = secondary. */
  tone?: "primary" | "danger";
}

interface ConfirmDialogProps {
  title: string;
  body: string;
  actions: DialogAction[];
  /** Index of the button selected when the dialog opens (pick the safe one). */
  initialFocus?: number;
  onCancel: () => void;
}

/** Keys TV remotes send for "Back" (plus Escape / Backspace on keyboards). */
const isBackKey = (e: KeyboardEvent) =>
  ["Escape", "Backspace", "GoBack", "BrowserBack", "Back"].includes(e.key) ||
  [27, 8, 461 /* LG webOS */, 10009 /* Samsung Tizen */].includes(e.keyCode);

/**
 * In-page confirmation, used instead of the browser's confirm() popup, which
 * smart-TV browsers often block or can't operate with a remote. Arrow keys
 * move between the buttons, OK/Enter presses one, Back/Esc cancels.
 */
export function ConfirmDialog({ title, body, actions, initialFocus = 0, onCancel }: ConfirmDialogProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // Latest cancel handler without re-running the setup below on every render
  // (the display re-renders when cards arrive; focus must not jump back).
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    buttons.current[initialFocus]?.focus({ focusVisible: true } as FocusOptions);

    const onKey = (e: KeyboardEvent) => {
      // Own every key while open so the page's shortcuts don't fire underneath.
      e.stopPropagation();
      if (isBackKey(e)) {
        e.preventDefault();
        cancelRef.current();
        return;
      }
      const list = buttons.current.filter(Boolean) as HTMLButtonElement[];
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const step =
        e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (step) {
        e.preventDefault();
        list[(Math.max(i, 0) + step + list.length) % list.length]?.focus();
      } else if (e.key === "Tab") {
        // keep focus inside the dialog
        e.preventDefault();
        list[(Math.max(i, 0) + (e.shiftKey ? -1 : 1) + list.length) % list.length]?.focus();
      }
      // Enter / OK falls through to the focused button's normal click.
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [initialFocus]);

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-body"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-body">{body}</p>
        <div className="dialog-actions">
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              className={a.tone === "primary" ? "" : a.tone === "danger" ? "secondary danger" : "secondary"}
              onClick={a.onSelect}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="dialog-hint muted">◀ ▶ to choose · OK to select · Back to cancel</p>
      </div>
    </div>
  );
}
