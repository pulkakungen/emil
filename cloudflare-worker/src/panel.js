/* =========================================================
   Dagsvyn ("Rätta dagar")

   Samma modul i alla barnens workers. En rad per dag, en kolumn per
   uppgift, klicka i en ruta för att rätta. Rättningar sparas separat och
   skrivs inte över när appen synkar igen.

   Kolumnerna räknas fram ur historiken, så appen kan byta uppgifter utan
   att den här filen behöver ändras.
   ========================================================= */

const DAGAR_BAKAT = 60;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function stockholmDateStr(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

async function readHistory(env, prefix) {
  const idag = stockholmDateStr(new Date());
  const poster = [];
  for (let i = 0; i < DAGAR_BAKAT; i++) {
    const d = new Date(idag + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const raw = await env.PUSH_KV.get(prefix + dateStr);
    if (raw) poster.push({ dateStr, ...JSON.parse(raw) });
  }
  return poster;
}

// Kolumnerna: alla uppgifter som förekommit, i den ordning de står i den
// senaste dagen som har dem. Uppgifter som tagits bort ur appen hamnar sist.
function kolumnerFran(poster) {
  const sedda = new Map();
  for (const post of poster) {
    (post.tasks || []).forEach((t) => {
      if (!sedda.has(t.id)) sedda.set(t.id, { id: t.id, emoji: t.emoji || "", label: t.text || t.id });
    });
  }
  return [...sedda.values()];
}

function panelHtml(titel, poster, key) {
  const veckodagar = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
  const kolumner = kolumnerFran(poster);

  const rader = poster
    .map((post) => {
      const karta = Object.fromEntries((post.tasks || []).map((t) => [t.id, t]));
      const klara = (post.tasks || []).filter((t) => t.done).length;
      const antal = (post.tasks || []).length;
      const weekday = veckodagar[new Date(post.dateStr + "T12:00:00Z").getUTCDay()];
      const celler = kolumner
        .map((kol) => {
          const t = karta[kol.id];
          const rattad = post.corrected && kol.id in post.corrected ? " rattad" : "";
          if (!t) {
            return `<td class="cell saknas" data-date="${post.dateStr}" data-id="${kol.id}" data-done="0" title="Stod inte på listan den dagen. Klicka för att lägga till den som gjord.">·</td>`;
          }
          return `<td class="cell${t.done ? " klar" : " oklar"}${rattad}" data-date="${post.dateStr}" data-id="${kol.id}" data-done="${t.done ? 1 : 0}" title="Klicka för att rätta">${t.done ? "✓" : ""}</td>`;
        })
        .join("");
      return `<tr><th class="dag"><span>${post.dateStr}</span><small>${weekday}</small></th>${celler}<td class="summa">${klara}/${antal}</td></tr>`;
    })
    .join("");

  const rubriker = kolumner
    .map((kol) => `<th class="kol"><span>${escapeHtml(kol.emoji)}</span><small>${escapeHtml(kol.label)}</small></th>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="sv"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(titel)} · rätta dagar</title>
<style>
  :root { --gron: #6f9f3f; --morkgron: #20320f; --klar: #2f7d24; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px 16px 60px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
         background: #f5f7f1; color: var(--morkgron); }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.info { margin: 0 0 18px; color: #4e6b32; font-size: 14px; max-width: 70ch; }
  .wrap { overflow-x: auto; border: 1px solid rgba(37,66,18,0.18); border-radius: 16px; background: #fff; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border-bottom: 1px solid rgba(37,66,18,0.1); padding: 8px 6px; text-align: center; }
  thead th { position: sticky; top: 0; background: var(--gron); color: #fff; font-size: 12px; }
  .kol span { font-size: 16px; display: block; }
  .kol small { font-weight: 600; display: block; width: 72px; line-height: 1.2; overflow-wrap: anywhere; }
  th.dag { text-align: left; white-space: nowrap; background: #f5f7f1; position: sticky; left: 0; z-index: 1; }
  th.dag small { display: block; font-weight: 500; color: #4e6b32; }
  .cell { cursor: pointer; font-weight: 800; min-width: 44px; user-select: none; }
  .cell.klar { background: rgba(47,125,36,0.16); color: var(--klar); }
  .cell.oklar:hover, .cell.saknas:hover { background: rgba(47,125,36,0.07); }
  .cell.saknas { color: #b9c9a6; }
  .cell.rattad::after { content: "•"; color: #e2622c; font-size: 11px; vertical-align: super; }
  .summa { font-weight: 700; white-space: nowrap; }
  .tom { padding: 30px; text-align: center; color: #4e6b32; }
</style></head>
<body>
  <h1>${escapeHtml(titel)}</h1>
  <p class="info">En rad per dag. Klicka i en ruta för att rätta, en orange prick visar att du ändrat.
     Punkt betyder att uppgiften inte stod på listan den dagen, klickar du i den läggs den till som gjord.
     Rättningar ligger kvar även när appen synkar igen.</p>
  <div class="wrap">
  ${
    poster.length
      ? `<table><thead><tr><th class="dag">Dag</th>${rubriker}<th class="kol"><span>✅</span><small>Klart</small></th></tr></thead><tbody>${rader}</tbody></table>`
      : '<div class="tom">Ingen historik än. Den fylls på när appen används.</div>'
  }
  </div>
<script>
  const key = ${JSON.stringify(key || "")};
  document.addEventListener("click", async (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    const done = cell.dataset.done !== "1";
    cell.style.opacity = "0.4";
    const res = await fetch("/panel/toggle" + (key ? "?key=" + encodeURIComponent(key) : ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: cell.dataset.date, id: cell.dataset.id, done })
    });
    cell.style.opacity = "1";
    if (!res.ok) { alert("Kunde inte spara ändringen."); return; }
    cell.dataset.done = done ? "1" : "0";
    cell.textContent = done ? "✓" : "";
    cell.classList.remove("saknas");
    cell.classList.toggle("klar", done);
    cell.classList.toggle("oklar", !done);
    cell.classList.add("rattad");
  });
</script>
</body></html>`;
}

/* Hanterar /panel och /panel/toggle. Returnerar null för andra adresser.
   opts: { title, historyPrefix, authorized(request, url, env), corsHeaders } */
export async function handlePanelRequest(request, env, url, opts) {
  const { title, historyPrefix, authorized, corsHeaders = {} } = opts;
  const path = url.pathname;
  if (path !== "/panel" && path !== "/panel/toggle") return null;

  if (authorized && !authorized(request, url, env)) {
    return new Response("Fel eller saknad nyckel. Lägg till ?key=... i adressen.", {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  if (path === "/panel" && request.method === "GET") {
    const poster = await readHistory(env, historyPrefix);
    return new Response(panelHtml(title, poster, url.searchParams.get("key")), {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
    });
  }

  if (path === "/panel/toggle" && request.method === "POST") {
    const body = await request.json();
    if (!body.date || !body.id) {
      return new Response(JSON.stringify({ error: "date och id krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const raw = await env.PUSH_KV.get(historyPrefix + body.date);
    const post = raw ? JSON.parse(raw) : {};
    const befintliga = post.tasks || [];
    const finns = befintliga.some((t) => t.id === body.id);

    // etikett från en annan dag, så en tillagd uppgift inte bara blir ett id
    let mall = null;
    if (!finns) {
      const poster = await readHistory(env, historyPrefix);
      for (const p of poster) {
        const träff = (p.tasks || []).find((t) => t.id === body.id);
        if (träff) {
          mall = träff;
          break;
        }
      }
    }

    const tasks = finns
      ? befintliga.map((t) => (t.id === body.id ? { ...t, done: !!body.done } : t))
      : befintliga.concat([
          { id: body.id, emoji: mall ? mall.emoji || "" : "", text: mall ? mall.text || body.id : body.id, done: !!body.done }
        ]);

    const uppdaterad = {
      ...post,
      tasks,
      corrected: { ...(post.corrected || {}), [body.id]: !!body.done },
      allDoneToday: tasks.length > 0 && tasks.every((t) => t.done)
    };
    await env.PUSH_KV.put(historyPrefix + body.date, JSON.stringify(uppdaterad), {
      expirationTtl: 60 * 60 * 24 * 730
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return null;
}

// Rättningar i panelen ska vinna över en senare synk från telefonen, och en
// helt tom rapport ska inte kunna nolla en dag som redan har bockar.
export function mergeSyncedTasks(tidigare, inkommande) {
  const rattat = (tidigare && tidigare.corrected) || {};
  // Bedöm rapporten som den kom in: en rättning i panelen får inte dölja att
  // telefonen rapporterade en helt tom dag.
  const rapportTom = !(inkommande || []).some((t) => t.done);
  let tasks = (inkommande || []).map((t) => (t.id in rattat ? { ...t, done: rattat[t.id] } : t));

  const tidigareKlara = ((tidigare && tidigare.tasks) || []).filter((t) => t.done);
  if (rapportTom && tidigareKlara.length) {
    const klaraId = new Set(tidigareKlara.map((t) => t.id));
    tasks = tasks.map((t) => (klaraId.has(t.id) ? { ...t, done: true } : t));
    for (const t of tidigareKlara) {
      if (!tasks.some((n) => n.id === t.id)) tasks.push(t);
    }
  }
  return tasks;
}
