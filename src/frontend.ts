import type { RunMeta } from "./run";
import { CANARY_DATE, TARGET_DATE } from "./config";

export function renderPage(meta: RunMeta | null): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rows =
    meta?.targetPerfs
      ?.map(
        (p) =>
          `<tr><td>${esc(p.theater)}</td><td>${p.localDate}</td><td>${p.localTime}</td><td>${esc(p.format)}</td><td>${p.soldOut ? "SOLD OUT" : `<a href="${esc(p.buyUrl)}" target="_blank">Buy</a>`}</td></tr>`
      )
      .join("") ?? "";
  const errs = meta?.errors?.map((e) => `<li>${esc(e.source)}: ${esc(e.message)}</li>`).join("") ?? "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dune: Part Three IMAX 70mm Watcher</title>
<style>body{font-family:system-ui;max-width:720px;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #444;padding:6px 10px;text-align:left}
button{font-size:1rem;padding:.5rem 1.2rem;cursor:pointer;background:#e4002b;color:#fff;border:0;border-radius:6px}
.muted{color:#999}a{color:#7cf}</style></head><body>
<h1>🎬 Dune: Part Three IMAX 70mm Watcher</h1>
<p>Watching for new IMAX 70mm showtimes on/after <strong>${TARGET_DATE}</strong> (PT) at AMC Metreon 16 &amp; Regal Hacienda Crossings — additions to the listed Dec 17–20 previews and the unannounced Dec 21+ block.</p>
<p class="muted">Last run: ${meta ? esc(meta.ts) : "never"} · fetched: ${meta ? esc(JSON.stringify(meta.perTheaterCounts)) : "—"} · canary (${CANARY_DATE}): ${meta ? `${meta.canaryCount} ${meta.canaryCount > 0 ? "✅" : "⚠️ pipeline may be broken"}` : "—"}</p>
<button id="r">Refresh now</button> <span id="s" class="muted"></span>
<h2>Known ${TARGET_DATE}+ showtimes (${meta?.targetPerfs?.length ?? 0})</h2>
${rows ? `<table><tr><th>Theater</th><th>Date</th><th>Time</th><th>Format</th><th></th></tr>${rows}</table>` : "<p class='muted'>None yet — that's what we're waiting for.</p>"}
${errs ? `<h2>Errors (last run)</h2><ul class="muted">${errs}</ul>` : ""}
<script>
document.getElementById('r').onclick=async()=>{const s=document.getElementById('s');s.textContent='running…';
try{const r=await fetch('/api/refresh',{method:'POST'});const j=await r.json();
s.textContent=r.ok?('done — '+(j.newCount??0)+' new'):(j.error||r.status);if(r.ok)setTimeout(()=>location.reload(),800);}
catch(e){s.textContent='failed: '+e}};
</script></body></html>`;
}
