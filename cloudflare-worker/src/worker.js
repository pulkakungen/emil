/* =========================================================
   Mrs Raccoon – push-server (Cloudflare Worker)

   Fristående worker med egen KV, egna VAPID-nycklar och egna
   meddelanden. Cron kör var 15:e minut, workern filtrerar själv på
   svensk lokaltid och skickar aldrig något mellan 23.45 och 06.15.
   ========================================================= */

import { buildPushPayload } from "@block65/webcrypto-web-push";
import {
  RANDOM_POOL,
  TASK_TRAKIGT,
  TASK_GOTT,
  TASK_FRU,
  TASK_TANK,
  TASK_TVATT,
  TASK_SORTERA,
  TASK_DAMMSUG,
  TASK_TRADGARD,
  TASK_NEDANVANING,
  TASK_STADA,
  TASK_SPRING,
  SPECIAL_DAYS,
  LOVE,
  PEP,
  BUS,
  FANIGT
} from "./messages.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key"
};

const APP_TITLE = "Mrs Raccoon 🦝";

const SUB_KEY = "subscription";
const STATE_KEY = "state";
const RECENT_KEY = "recent";
const SCHEDULE_PREFIX = "schedule:";
const HISTORY_PREFIX = "history:";

// Hur många kärleksnotiser som slumpas ut per dygn. Ändra siffran här.
const PUSHES_PER_DAY = 5;

// Tyst period: inga notiser mellan 23.45 och 06.15.
const WINDOW_START_MIN = 6 * 60 + 15; // 06:15
const WINDOW_END_MIN = 23 * 60 + 45; // 23:45

// Minsta avstånd mellan två notiser, så de inte klumpar ihop sig.
const MIN_GAP_MIN = 45;

// Hur länge en missad tid får skickas i efterhand (t.ex. om cron hackar).
const SLOT_GRACE_MIN = 60;

// Så många senast skickade meddelanden undviks vid nästa slumpning.
const RECENT_MEMORY = 25;

// Hemmasysslorna (tvätt, städ, trädgård, löprunda) hinner han inte med
// mitt i veckan förrän han är hemma, så de knuffarna skickas bara efter
// 17.00 på vardagar. På helgerna gäller hela dygnets fönster.
const HOME_TASK_WEEKDAY_START_MIN = 17 * 60;

function homeTaskAllowed(minutesOfDay, weekday) {
  const isWeekend = weekday === 0 || weekday === 6;
  return isWeekend || minutesOfDay >= HOME_TASK_WEEKDAY_START_MIN;
}

/* --------------------------- hjälpare --------------------------- */

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Allt under /admin kräver nyckeln som sätts med
// `wrangler secret put ADMIN_TOKEN`. Appens egna anrop (/subscribe, /sync,
// /vapid, /messages) är fortsatt öppna, de bär ingen hemlighet.
function adminKeyOk(request, url, env) {
  if (!env.ADMIN_TOKEN) return true; // ingen nyckel satt än, lås inte ute någon
  const given = request.headers.get("X-Admin-Key") || url.searchParams.get("key") || "";
  return given === env.ADMIN_TOKEN;
}

function denied() {
  return new Response("Fel eller saknad nyckel. Lägg till ?key=... i adressen.", {
    status: 401,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" }
  });
}

// Normaliserad lägesbild för föräldrapanelen, samma form som de andra
// apparna lämnar, så panelen slipper veta hur den här är byggd inuti.
async function buildSummary(env) {
  const now = new Date();
  const { dateStr } = stockholmParts(now);
  const subRaw = await env.PUSH_KV.get(SUB_KEY);
  const stateRaw = await env.PUSH_KV.get(STATE_KEY);
  const state = stateRaw ? JSON.parse(stateRaw) : null;
  const scheduleRaw = await env.PUSH_KV.get(SCHEDULE_PREFIX + dateStr);
  const slots = scheduleRaw ? JSON.parse(scheduleRaw) : [];

  const tasks = (state && state.dateStr === dateStr ? state.tasks || [] : []).map((t) => ({
    id: t.id,
    text: t.text || t.id,
    done: !!t.done
  }));

  const history = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dag = stockholmParts(d).dateStr;
    const raw = await env.PUSH_KV.get(HISTORY_PREFIX + dag);
    const rec = raw ? JSON.parse(raw) : null;
    const list = rec && Array.isArray(rec.tasks) ? rec.tasks : [];
    history.push({
      date: dag,
      done: list.filter((t) => t.done).length,
      total: list.length,
      allDone: !!(rec && rec.allDoneToday)
    });
  }

  return {
    app: "mrs-raccoon",
    title: "Mrs Raccoon",
    child: "Emil",
    now: now.toISOString(),
    dateStr,
    notifications: !!subRaw,
    lastSyncAt: state ? state.updatedAt : null,
    lastNagAt: null,
    allDoneToday: !!(state && state.allDoneToday),
    hunger: null,
    happiness: null,
    level: null,
    streak: state && typeof state.streak === "number" ? state.streak : null,
    petName: null,
    doneToday: tasks.filter((t) => t.done).length,
    totalToday: tasks.length,
    tasks,
    remindersSentToday: slots.filter((s) => s.sent).map((s) => s.message || "notis"),
    affirmation: null,
    history
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" }
  });
}

function stockholmParts(date) {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    dateStr,
    minutesOfDay: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10),
    weekday: new Date(dateStr + "T12:00:00Z").getUTCDay() // 0=söndag ... 6=lördag
  };
}

function hhmm(minutesOfDay) {
  return (
    String(Math.floor(minutesOfDay / 60)).padStart(2, "0") +
    ":" +
    String(minutesOfDay % 60).padStart(2, "0")
  );
}

/* --------------------------- push --------------------------- */

async function sendPush(env, message) {
  const subRaw = await env.PUSH_KV.get(SUB_KEY);
  if (!subRaw) return false;

  try {
    const subscription = JSON.parse(subRaw);
    const vapid = {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY
    };

    const payload = await buildPushPayload(
      { data: JSON.stringify({ title: APP_TITLE, body: message }), options: { ttl: 3600 } },
      subscription,
      vapid
    );

    const res = await fetch(subscription.endpoint, payload);
    if (res.status === 404 || res.status === 410) {
      await env.PUSH_KV.delete(SUB_KEY);
    }
    if (!res.ok) {
      console.error("raccoon sendPush misslyckades", res.status, await res.text().catch(() => ""));
    }
    return res.ok;
  } catch (err) {
    console.error("raccoon sendPush kastade fel", err && err.message);
    return false;
  }
}

/* --------------------- val av meddelande --------------------- */

async function getRecent(env) {
  const raw = await env.PUSH_KV.get(RECENT_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function rememberSent(env, message) {
  const recent = await getRecent(env);
  recent.push(message);
  while (recent.length > RECENT_MEMORY) recent.shift();
  await env.PUSH_KV.put(RECENT_KEY, JSON.stringify(recent));
}

// Slumpar ur en lista men undviker de senast skickade meddelandena.
function pickFresh(list, recent) {
  const fresh = list.filter((m) => !recent.includes(m));
  return pick(fresh.length ? fresh : list);
}

function pickWeighted(recent) {
  const total = RANDOM_POOL.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const entry of RANDOM_POOL) {
    roll -= entry.weight;
    if (roll <= 0) return pickFresh(entry.list, recent);
  }
  return pickFresh(RANDOM_POOL[0].list, recent);
}

// Vilken meddelandehög som hör till vilken uppgift i appen.
const TASK_POOLS = {
  trakigt: TASK_TRAKIGT,
  gott: TASK_GOTT,
  fru: TASK_FRU,
  tankfru: TASK_TANK,
  "tvatt-sortera": TASK_SORTERA,
  "tvatt-kor": TASK_TVATT,
  dammsug: TASK_DAMMSUG,
  nedanvaning: TASK_NEDANVANING,
  stada: TASK_STADA,
  tradgard: TASK_TRADGARD,
  spring: TASK_SPRING
};

// Sysslor han bara hinner med när han är hemma.
const HOME_TASKS = ["tvatt-sortera", "tvatt-kor", "dammsug", "nedanvaning", "stada", "tradgard", "spring"];

// Uppgifter som passar bäst under en viss del av dagen.
const TIME_WINDOWS = { trakigt: [0, 15 * 60], gott: [15 * 60, 24 * 60], fru: [11 * 60, 24 * 60] };

// Ibland blir notisen en knuff till en uppgift i stället för ren pepp,
// men bara om uppgiften är kvar att göra och bara ungefär var tredje notis.
// Resten av tiden är det kärlek och pepp, som det ska vara.
const NUDGE_CHANCE = 0.3;

function chooseMessage(state, minutesOfDay, weekday, recent) {
  if (!state || !Array.isArray(state.tasks)) return pickWeighted(recent);

  const homeOk = homeTaskAllowed(minutesOfDay, weekday);
  const candidates = [];

  for (const task of state.tasks) {
    if (task.done) continue;
    const pool = TASK_POOLS[task.id];
    if (!pool) continue;
    if (HOME_TASKS.includes(task.id) && !homeOk) continue;
    const window = TIME_WINDOWS[task.id];
    if (window && (minutesOfDay < window[0] || minutesOfDay >= window[1])) continue;
    candidates.push(pool);
  }

  if (candidates.length && Math.random() < NUDGE_CHANCE) {
    return pickFresh(pick(candidates), recent);
  }
  return pickWeighted(recent);
}

/* --------------------------- märkesdagar --------------------------- */

// Skickas en gång, strax efter att tysta natten tagit slut.
const SPECIAL_HOUR_MIN = 7 * 60 + 30; // 07:30
const SPECIAL_PREFIX = "special:";

function daysUntil(dateStr, month, day) {
  const today = new Date(dateStr + "T12:00:00Z");
  let target = new Date(Date.UTC(today.getUTCFullYear(), month - 1, day, 12));
  if (target < today) target = new Date(Date.UTC(today.getUTCFullYear() + 1, month - 1, day, 12));
  return Math.round((target - today) / 86400000);
}

// Returnerar dagens märkesdagsmeddelande, eller null om inget ska skickas.
function specialMessageFor(dateStr) {
  for (const day of SPECIAL_DAYS) {
    const left = daysUntil(dateStr, day.month, day.day);
    if (left === 0) return { id: day.id + ":dag", text: pick(day.dayMessages) };
    if (day.leadDays.includes(left)) {
      const när = left === 1 ? "imorgon" : `om ${left} dagar`;
      const text = pick(day.leadMessages)
        .replace("{när}", när)
        .replace("{När}", när.charAt(0).toUpperCase() + när.slice(1));
      return { id: day.id + ":" + left, text };
    }
  }
  return null;
}

async function sendSpecialIfDue(env, dateStr, minutesOfDay) {
  if (minutesOfDay < SPECIAL_HOUR_MIN) return false;
  const special = specialMessageFor(dateStr);
  if (!special) return false;

  const key = SPECIAL_PREFIX + special.id.split(":")[0] + ":" + dateStr;
  if (await env.PUSH_KV.get(key)) return false;

  const delivered = await sendPush(env, special.text);
  if (!delivered) return false;
  await env.PUSH_KV.put(key, special.text, { expirationTtl: 60 * 60 * 72 });
  await rememberSent(env, special.text);
  return true;
}

/* --------------------- dagens slumpade tider --------------------- */

// Lottar fram dagens notistider en gång per dygn och sparar dem i KV,
// så att varje cron-körning bara behöver kolla vad som är moget att skicka.
function drawSlots(fromMinute) {
  const start = Math.max(WINDOW_START_MIN, fromMinute);
  const span = WINDOW_END_MIN - start;
  if (span <= 0) return [];

  // Så många notiser får plats med respektavstånd i den tid som är kvar.
  const maxSlots = Math.max(1, Math.floor(span / MIN_GAP_MIN) + 1);
  const count = Math.min(PUSHES_PER_DAY, maxSlots);

  // Dela upp fönstret i lika stora block och slumpa en tid inom varje block.
  // Det ger spridning över dygnet utan att tiderna hamnar på varandra.
  const block = span / count;
  const times = [];
  for (let i = 0; i < count; i++) {
    const blockStart = start + i * block;
    const candidate = Math.round(blockStart + Math.random() * block);
    const clamped = Math.min(WINDOW_END_MIN - 1, Math.max(start, candidate));
    const previous = times.length ? times[times.length - 1] : null;
    times.push(previous !== null ? Math.max(clamped, previous + MIN_GAP_MIN) : clamped);
  }

  return times.filter((t) => t < WINDOW_END_MIN).map((t) => ({ at: t, sent: false }));
}

async function getSchedule(env, dateStr, minutesOfDay) {
  const key = SCHEDULE_PREFIX + dateStr;
  const raw = await env.PUSH_KV.get(key);
  if (raw) return JSON.parse(raw);

  const slots = drawSlots(minutesOfDay);
  await env.PUSH_KV.put(key, JSON.stringify(slots), { expirationTtl: 60 * 60 * 48 });
  return slots;
}

async function saveSchedule(env, dateStr, slots) {
  await env.PUSH_KV.put(SCHEDULE_PREFIX + dateStr, JSON.stringify(slots), {
    expirationTtl: 60 * 60 * 48
  });
}

async function mergeHistory(env, dateStr, patch) {
  const raw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
  const existing = raw ? JSON.parse(raw) : {};
  const merged = { ...existing, ...patch };
  await env.PUSH_KV.put(HISTORY_PREFIX + dateStr, JSON.stringify(merged), {
    expirationTtl: 60 * 60 * 24 * 730
  });
  return merged;
}

/* --------------------------- cron --------------------------- */

async function runSchedule(env) {
  const now = new Date();
  const { dateStr, minutesOfDay, weekday } = stockholmParts(now);

  // Tyst natt. Ingenting lottas eller skickas utanför fönstret.
  if (minutesOfDay < WINDOW_START_MIN || minutesOfDay >= WINDOW_END_MIN) return;

  const hasSub = !!(await env.PUSH_KV.get(SUB_KEY));
  if (!hasSub) return;

  // Märkesdagar går före allt annat och ligger utanför dagens lottade tider.
  if (await sendSpecialIfDue(env, dateStr, minutesOfDay)) return;

  const slots = await getSchedule(env, dateStr, minutesOfDay);
  const due = slots.find(
    (s) => !s.sent && minutesOfDay >= s.at && minutesOfDay < s.at + SLOT_GRACE_MIN
  );
  if (!due) return;

  const stateRaw = await env.PUSH_KV.get(STATE_KEY);
  const state = stateRaw ? JSON.parse(stateRaw) : null;
  const recent = await getRecent(env);
  const message = chooseMessage(state && state.dateStr === dateStr ? state : null, minutesOfDay, weekday, recent);

  const delivered = await sendPush(env, message);
  if (!delivered) return; // försök igen vid nästa körning inom respitfönstret

  due.sent = true;
  due.sentAt = hhmm(minutesOfDay);
  due.message = message;
  await saveSchedule(env, dateStr, slots);
  await rememberSent(env, message);
  await mergeHistory(env, dateStr, { pushes: slots.filter((s) => s.sent).map((s) => ({ at: s.sentAt, message: s.message })) });
}


/* --------------------------- panelvy ---------------------------

   En enkel sida för Bella: en rad per dag, en kolumn per uppgift.
   Klicka i en ruta för att rätta, rättningen vinner över telefonen.
   Skyddas av samma nyckel som allt under /admin:
     npx wrangler secret put ADMIN_TOKEN
   och lägg sedan till ?key=DIN_NYCKEL i adressen.
   --------------------------------------------------------------- */

// Kolumnordningen speglar uppgifterna i appen. Uppgifter som dyker upp i
// historiken men saknas här hamnar sist, så inget tappas bort.
const TASK_ORDER = [
  { id: "trakigt", emoji: "😤", label: "Tråkig grej" },
  { id: "gott", emoji: "🍫", label: "Unna sig" },
  { id: "fru", emoji: "💌", label: "Meddelande till frun" },
  { id: "tankfru", emoji: "💭", label: "Tänka på frun" },
  { id: "tvatt-sortera", emoji: "🧺", label: "Sortera tvätt" },
  { id: "tvatt-kor", emoji: "🌀", label: "Köra maskin" },
  { id: "dammsug", emoji: "🔌", label: "Dammsuga" },
  { id: "nedanvaning", emoji: "🧹", label: "10 saker" },
  { id: "stada", emoji: "🧼", label: "Städa nåt" },
  { id: "tradgard", emoji: "🌿", label: "Trädgårdsrunda" },
  { id: "spring", emoji: "👟", label: "Springa" }
];

async function readHistory(env, dagar = 60) {
  const idag = stockholmParts(new Date()).dateStr;
  const datum = [];
  for (let i = 0; i < dagar; i++) {
    const d = new Date(idag + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - i);
    datum.push(d.toISOString().slice(0, 10));
  }
  const poster = [];
  for (const dateStr of datum) {
    const raw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
    if (raw) poster.push({ dateStr, ...JSON.parse(raw) });
  }
  return poster;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function panelHtml(poster, key) {
  const veckodagar = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];

  // extra uppgifter som finns i historiken men inte i den fasta ordningen
  const kanda = new Set(TASK_ORDER.map((t) => t.id));
  const extra = [];
  for (const post of poster) {
    for (const t of post.tasks || []) {
      if (!kanda.has(t.id)) {
        kanda.add(t.id);
        extra.push({ id: t.id, emoji: t.emoji || "", label: t.text || t.id });
      }
    }
  }
  const kolumner = TASK_ORDER.concat(extra);

  const rader = poster.map((post) => {
    const karta = Object.fromEntries((post.tasks || []).map((t) => [t.id, t]));
    const antalKlara = (post.tasks || []).filter((t) => t.done).length;
    const antal = (post.tasks || []).length;
    const weekday = veckodagar[new Date(post.dateStr + "T12:00:00Z").getUTCDay()];
    const celler = kolumner.map((kol) => {
      const t = karta[kol.id];
      if (!t) return '<td class="cell empty" title="stod inte på listan den dagen">·</td>';
      const rattad = post.corrected && kol.id in post.corrected ? " rattad" : "";
      return `<td class="cell${t.done ? " klar" : " oklar"}${rattad}" data-date="${post.dateStr}" data-id="${kol.id}" data-done="${t.done ? 1 : 0}" title="Klicka för att rätta">${t.done ? "✓" : ""}</td>`;
    }).join("");
    const puffar = (post.pushes || []).length;
    return `<tr><th class="dag"><span>${post.dateStr}</span><small>${weekday}</small></th>${celler}<td class="summa">${antalKlara}/${antal}</td><td class="summa notiser">${puffar}</td></tr>`;
  }).join("");

  const rubriker = kolumner.map((kol) => `<th class="kol"><span>${kol.emoji}</span><small>${escapeHtml(kol.label)}</small></th>`).join("");

  return `<!DOCTYPE html>
<html lang="sv"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mrs Raccoon · panel</title>
<style>
  :root { --gron: #85b84d; --morkgron: #20320f; --klar: #2f7d24; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px 16px 60px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
         background: #f4f8ec; color: var(--morkgron); }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.info { margin: 0 0 18px; color: #4e6b32; font-size: 14px; }
  .wrap { overflow-x: auto; border: 1px solid rgba(37,66,18,0.18); border-radius: 16px; background: #fff; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border-bottom: 1px solid rgba(37,66,18,0.1); padding: 8px 6px; text-align: center; }
  thead th { position: sticky; top: 0; background: var(--gron); color: #fff; font-size: 12px; }
  .kol span { font-size: 16px; display: block; }
  .kol small { font-weight: 600; display: block; max-width: 74px; line-height: 1.2; overflow-wrap: anywhere; }
  th.dag { text-align: left; white-space: nowrap; background: #f4f8ec; position: sticky; left: 0; }
  th.dag small { display: block; font-weight: 500; color: #4e6b32; }
  .cell { cursor: pointer; font-weight: 800; min-width: 44px; user-select: none; }
  .cell.klar { background: rgba(47,125,36,0.16); color: var(--klar); }
  .cell.oklar:hover { background: rgba(47,125,36,0.07); }
  .cell.empty { color: #b9c9a6; cursor: default; }
  .cell.rattad::after { content: "•"; color: #e2622c; font-size: 11px; vertical-align: super; }
  .summa { font-weight: 700; white-space: nowrap; }
  .notiser { color: #4e6b32; font-weight: 500; }
  .tom { padding: 30px; text-align: center; color: #4e6b32; }
</style></head>
<body>
  <h1>Mrs Raccoon 🦝</h1>
  <p class="info">En rad per dag. Klicka i en ruta för att rätta, en orange prick visar att du ändrat.
     Punkt betyder att uppgiften inte stod på listan den dagen. Sista kolumnerna är klara uppgifter och antal notiser.</p>
  <div class="wrap">
  ${poster.length ? `<table><thead><tr><th class="dag">Dag</th>${rubriker}<th class="kol"><span>✅</span><small>Klart</small></th><th class="kol"><span>💌</span><small>Notiser</small></th></tr></thead><tbody>${rader}</tbody></table>` : '<div class="tom">Ingen historik än. Den fylls på när han öppnar appen.</div>'}
  </div>
<script>
  const key = ${JSON.stringify(key || "")};
  document.addEventListener("click", async (e) => {
    const cell = e.target.closest(".cell");
    if (!cell || cell.classList.contains("empty")) return;
    const done = cell.dataset.done === "1" ? false : true;
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
    cell.classList.toggle("klar", done);
    cell.classList.toggle("oklar", !done);
    cell.classList.add("rattad");
  });
</script>
</body></html>`;
}

/* --------------------------- routes --------------------------- */

async function handleRequest(request, env, url) {
  const path = url.pathname;

  if (path === "/subscribe" && request.method === "POST") {
    const subscription = await request.json();
    await env.PUSH_KV.put(SUB_KEY, JSON.stringify(subscription));
    return json({ ok: true });
  }

  if (path === "/unsubscribe" && request.method === "POST") {
    await env.PUSH_KV.delete(SUB_KEY);
    return json({ ok: true });
  }

  if (path === "/sync" && request.method === "POST") {
    const body = await request.json();
    const { dateStr } = stockholmParts(new Date());
    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    const state = {
      dateStr,
      updatedAt: new Date().toISOString(),
      allDoneToday: !!body.allDoneToday,
      streak: Number(body.streak) || 0,
      hearts: Number(body.hearts) || 0,
      tasks
    };
    await env.PUSH_KV.put(STATE_KEY, JSON.stringify(state));

    // Rättningar i panelen ska inte skrivas över av en senare synk från
    // telefonen, så de bockarna vinner när de finns.
    const raw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
    const tidigare = raw ? JSON.parse(raw) : {};
    const rattat = tidigare.corrected || {};
    const sammanslagna = tasks.map((t) => (t.id in rattat ? { ...t, done: rattat[t.id] } : t));

    await mergeHistory(env, dateStr, {
      tasks: sammanslagna,
      streak: state.streak,
      hearts: state.hearts,
      allDoneToday: sammanslagna.every((t) => t.done),
      updatedAt: state.updatedAt
    });
    return json({ ok: true });
  }

  // Appen hämtar den publika VAPID-nyckeln härifrån i stället för att ha
  // den inskriven i koden, så den aldrig kan hamna i otakt med workern.
  // Publika nyckeln är just publik, den är ofarlig att lämna ut.
  if (path === "/vapid" && request.method === "GET") {
    return json({ publicKey: env.VAPID_PUBLIC_KEY || null });
  }

  // Appen hämtar samma meddelanden som pushas, för pratbubblan i appen.
  if (path === "/messages" && request.method === "GET") {
    return json({ love: LOVE, pep: PEP, bus: BUS, fanigt: FANIGT });
  }

  if (path === "/panel" && request.method === "GET") {
    if (!adminKeyOk(request, url, env)) return denied();
    const poster = await readHistory(env);
    return new Response(panelHtml(poster, url.searchParams.get("key")), {
      headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" }
    });
  }

  if (path === "/panel/toggle" && request.method === "POST") {
    if (!adminKeyOk(request, url, env)) return json({ error: "fel nyckel" }, 401);
    const body = await request.json();
    if (!body.date || !body.id) return json({ error: "date och id krävs" }, 400);

    const raw = await env.PUSH_KV.get(HISTORY_PREFIX + body.date);
    if (!raw) return json({ error: "ingen dag att rätta" }, 404);
    const post = JSON.parse(raw);
    const tasks = (post.tasks || []).map((t) => (t.id === body.id ? { ...t, done: !!body.done } : t));
    const corrected = { ...(post.corrected || {}), [body.id]: !!body.done };

    await mergeHistory(env, body.date, {
      tasks,
      corrected,
      allDoneToday: tasks.length > 0 && tasks.every((t) => t.done)
    });
    return json({ ok: true });
  }

  if (path.startsWith("/admin") && !adminKeyOk(request, url, env)) return denied();

  if (path === "/admin/summary" && request.method === "GET") {
    return json(await buildSummary(env));
  }

  if (path === "/admin/status" && request.method === "GET") {
    const { dateStr, minutesOfDay } = stockholmParts(new Date());
    const subRaw = await env.PUSH_KV.get(SUB_KEY);
    const scheduleRaw = await env.PUSH_KV.get(SCHEDULE_PREFIX + dateStr);
    const stateRaw = await env.PUSH_KV.get(STATE_KEY);
    const slots = scheduleRaw ? JSON.parse(scheduleRaw) : [];

    const lines = [
      "=== Mrs Raccoon push-status 🦝 ===",
      "",
      `Prenumeration finns: ${subRaw ? "JA ✅" : "NEJ ❌ (klockan 🔔 är inte påslagen på hans telefon)"}`,
      `Svensk lokaltid nu: ${hhmm(minutesOfDay)} (${dateStr})`,
      `Tyst period: ${hhmm(WINDOW_END_MIN)} till ${hhmm(WINDOW_START_MIN)}`,
      "",
      "Dagens lottade tider:",
      ...(slots.length
        ? slots.map((s) => `  ${hhmm(s.at)}  ${s.sent ? "skickad ✅ " + (s.message || "") : "väntar"}`)
        : ["  (inga lottade än idag)"]),
      "",
      `App-status: ${stateRaw || "appen har aldrig synkat"}`,
      "",
      "Märkesdagar:",
      ...SPECIAL_DAYS.map((d) => `  ${d.id}: om ${daysUntil(dateStr, d.month, d.day)} dagar`)
    ];
    return text(lines.join("\n"));
  }

  if (path === "/admin/send-test" && request.method === "GET") {
    const ok = await sendPush(env, "Testnotis från tvättbjörnen! Ser du den här funkar allt 🦝✅");
    return text(ok ? "Skickad! Kolla telefonen 📬" : "Misslyckades, troligen finns ingen aktiv prenumeration.");
  }

  // Egen hälsning på direkten: /admin/send?text=Hej älskling
  if (path === "/admin/send" && request.method === "GET") {
    const message = url.searchParams.get("text");
    if (!message) return text("Lägg till ?text=... i adressen med det du vill skicka.", 400);
    const ok = await sendPush(env, message);
    if (ok) await rememberSent(env, message);
    return text(ok ? `Skickad! 💌\n\n${message}` : "Misslyckades, troligen finns ingen aktiv prenumeration.");
  }

  // Lottar om dagens tider, t.ex. om du ändrat antal notiser per dag.
  if (path === "/admin/reroll" && request.method === "GET") {
    const { dateStr, minutesOfDay } = stockholmParts(new Date());
    const slots = drawSlots(minutesOfDay);
    await saveSchedule(env, dateStr, slots);
    return text("Nya tider för idag:\n" + slots.map((s) => "  " + hhmm(s.at)).join("\n"));
  }

  if (path === "/" || path === "") {
    return text("Mrs Raccoon push worker is running 🦝");
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    return handleRequest(request, env, url);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      runSchedule(env).catch((err) => console.error("runSchedule kastade fel", err && err.stack))
    );
  }
};
