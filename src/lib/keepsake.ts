/**
 * Keepsake export: a single self-contained HTML page of the revealed wishes,
 * styled as cards and printable to PDF. Built in the browser — nothing is
 * uploaded anywhere.
 */

export interface Wish {
  no?: number; // reveal number (#N)
  message: string;
  from?: string;
}

export interface KeepsakeData {
  title: string;
  date: string; // ISO timestamp of the export
  wishes: Wish[];
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const prettyDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export function keepsakeFilename(d: KeepsakeData, ext: "html" | "txt" = "html") {
  return `christmas-wishes-${d.date.slice(0, 10)}.${ext}`;
}

export function keepsakeText(d: KeepsakeData): string {
  const lines = [`${d.title} — ${prettyDate(d.date)}`, ""];
  for (const w of d.wishes) {
    lines.push(`${w.no !== undefined ? `#${w.no} ` : ""}${w.message}`);
    lines.push(`   — ${w.from || "Secret Santa"}`, "");
  }
  return lines.join("\n");
}

export function keepsakeHtml(d: KeepsakeData): string {
  const cards = d.wishes
    .map(
      (w) => `
    <article class="card">
      ${w.no !== undefined ? `<span class="no">#${w.no}</span>` : ""}
      <p class="msg">${esc(w.message)}</p>
      <p class="from">— ${esc(w.from || "Secret Santa")}</p>
    </article>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)} — ${esc(prettyDate(d.date))}</title>
<style>
  :root { --bg: #0f2a1d; --card: #fffaf0; --ink: #2a1f14; --muted: #7a5c3a; --red: #b0412f; --gold: #e8c26a; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--card); font-family: Georgia, "Times New Roman", serif; padding: 2.5rem 1rem 4rem; }
  header { text-align: center; margin-bottom: 2rem; }
  h1 { font-size: clamp(1.8rem, 5vw, 2.8rem); font-weight: normal; }
  .sub { color: var(--gold); margin-top: 0.4rem; font-style: italic; }
  .grid { max-width: 64rem; margin: 0 auto; display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); }
  .card { position: relative; background: var(--card); color: var(--ink); border-radius: 14px; padding: 2.2rem 1.4rem 1.4rem; box-shadow: 0 8px 24px #0006; border-top: 6px solid var(--red); break-inside: avoid; }
  .no { position: absolute; top: 0.7rem; left: 1rem; color: var(--red); font-weight: bold; font-family: system-ui, sans-serif; font-size: 0.9rem; }
  .msg { font-size: 1.2rem; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  .from { margin-top: 1rem; color: var(--muted); font-style: italic; }
  footer { text-align: center; color: #b9c4bb; margin-top: 2.5rem; font-family: system-ui, sans-serif; font-size: 0.85rem; }
  @media print {
    body { background: #fff; color: var(--ink); padding: 0; }
    .sub { color: var(--muted); }
    .card { box-shadow: none; border: 1px solid #ddd; border-top: 6px solid var(--red); }
    footer { color: #888; }
  }
</style>
</head>
<body>
  <header>
    <h1>🎄 ${esc(d.title)}</h1>
    <p class="sub">${esc(prettyDate(d.date))} · ${d.wishes.length} ${d.wishes.length === 1 ? "wish" : "wishes"}</p>
  </header>
  <main class="grid">${cards}
  </main>
  <footer>Saved from Secret Christmas Cards · Print or “Save as PDF” to keep a paper copy</footer>
</body>
</html>
`;
}

/** Save a file from the browser (laptop download / phone "Download"). */
export function downloadFile(name: string, content: string, type = "text/html") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
