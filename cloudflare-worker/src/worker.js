/* =========================================================
   Mrs Raccoon – push-server (Cloudflare Worker)

   Fristående worker med egen KV, egna VAPID-nycklar och egna
   meddelanden. Cron kör var 15:e minut, workern filtrerar själv på
   svensk lokaltid och skickar aldrig något mellan 23.45 och 06.15.
   ========================================================= */

import { buildPushPayload } from "@block65/webcrypto-web-push";
import { handlePanelRequest, mergeSyncedTasks } from "./panel.js";
import { maybeSendDailySheet } from "./sheets.js";
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
  TASK_KAFFE,
  TASK_SPRING,
  SPECIAL_DAYS,
  SPICY,
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
const EXTRA_PREFIX = "extra:"; // engångsuppgifter som föräldrapanelen lägger till

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
async function buildSummary(env, url, request) {
  const now = new Date();
  const { dateStr } = stockholmParts(now);
  const subRaw = await env.PUSH_KV.get(SUB_KEY);
  const stateRaw = await env.PUSH_KV.get(STATE_KEY);
  const state = stateRaw ? JSON.parse(stateRaw) : null;
  const scheduleRaw = await env.PUSH_KV.get(SCHEDULE_PREFIX + dateStr);
  const slots = scheduleRaw ? JSON.parse(scheduleRaw) : [];

  // Dagens lista läses ur dagsposten, inte ur den senaste rapporten: posten
  // är den som skyddas mot tomma rapporter och innehåller dina rättningar.
  const dagRaw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
  const dag = dagRaw ? JSON.parse(dagRaw) : null;
  const lista = dag && Array.isArray(dag.tasks) && dag.tasks.length
    ? dag.tasks
    : state && state.dateStr === dateStr
      ? state.tasks || []
      : [];
  const tasks = lista.map((t) => ({ id: t.id, text: t.text || t.id, done: !!t.done }));

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

  // Länkar så att föräldrapanelen kan lägga en knapp rakt in i dagsvyn.
  // Nyckeln följer med om anroparen använde en, annars behövs ingen.
  const key = (url ? url.searchParams.get("key") : null) || (request ? request.headers.get("X-Admin-Key") : null);
  const lank = (path) => (url ? url.origin + path + (key ? "?key=" + encodeURIComponent(key) : "") : null);

  return {
    app: "mrs-raccoon",
    title: "Mrs Raccoon",
    child: "Emil",
    panelUrl: lank("/panel"),
    links: [
      { label: "Panel", url: lank("/panel") },
      { label: "Status", url: lank("/admin/status") },
      { label: "Skicka hälsning", url: lank("/admin/send") }
    ],
    now: now.toISOString(),
    dateStr,
    notifications: !!subRaw,
    lastSyncAt: state ? state.updatedAt : null,
    lastNagAt: null,
    allDoneToday: tasks.length > 0 && tasks.every((t) => t.done),
    hunger: null,
    happiness: null,
    level: null,
    streak: state && typeof state.streak === "number" ? state.streak : null,
    petName: null,
    doneToday: tasks.filter((t) => t.done).length,
    totalToday: tasks.length,
    tasks,
    remindersSentToday: slots.filter((s) => s.sent).map((s) => s.message || "notis"),
    supportsExtra: true,
    extra: await readExtras(env, dateStr),
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
  kaffe: TASK_KAFFE,
  tradgard: TASK_TRADGARD,
  spring: TASK_SPRING
};

// Sysslor han bara hinner med när han är hemma.
const HOME_TASKS = ["tvatt-sortera", "tvatt-kor", "dammsug", "nedanvaning", "stada", "kaffe", "tradgard", "spring"];

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

/* ------------------- kvällens hetare hälsning -------------------

   En per dygn på slumpad tid mellan 20.30 och 23.30, utanför de vanliga
   fem notiserna. Vill du stänga av den: töm listan SPICY i messages.js,
   eller sätt SPICY_ENABLED till false här.
   ----------------------------------------------------------------- */
const SPICY_ENABLED = true;
// Fast tid varje kväll. Sätt den till null om du hellre vill ha en slumpad
// tid inom fönstret nedan.
const SPICY_FIXED_MIN = 21 * 60 + 25; // 21.25
const SPICY_START_MIN = 20 * 60 + 30; // 20.30, används bara vid slumpad tid
const SPICY_END_MIN = 23 * 60 + 30; // 23.30
const SPICY_PREFIX = "spicy:";

async function maybeSendSpicy(env, dateStr, minutesOfDay) {
  if (!SPICY_ENABLED || !SPICY.length) return false;
  const tidigast = SPICY_FIXED_MIN === null ? SPICY_START_MIN : SPICY_FIXED_MIN;
  if (minutesOfDay < tidigast || minutesOfDay >= SPICY_END_MIN) return false;

  const key = SPICY_PREFIX + dateStr;
  const raw = await env.PUSH_KV.get(key);
  const post = raw ? JSON.parse(raw) : null;
  if (post && post.sent) return false;

  // fast tid, eller lottad en gång per dygn om SPICY_FIXED_MIN är null
  const slot =
    SPICY_FIXED_MIN !== null
      ? SPICY_FIXED_MIN
      : post
        ? post.at
        : SPICY_START_MIN + Math.floor(Math.random() * (SPICY_END_MIN - SPICY_START_MIN));
  if (!post) await env.PUSH_KV.put(key, JSON.stringify({ at: slot, sent: false }), { expirationTtl: 60 * 60 * 48 });
  if (minutesOfDay < slot) return false;

  const recent = await getRecent(env);
  const message = pickFresh(SPICY, recent);
  const delivered = await sendPush(env, message);
  if (!delivered) return false;

  await env.PUSH_KV.put(key, JSON.stringify({ at: slot, sent: true, message }), { expirationTtl: 60 * 60 * 48 });
  await rememberSent(env, message);
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

async function readExtras(env, dateStr) {
  const raw = await env.PUSH_KV.get(EXTRA_PREFIX + dateStr);
  const list = raw ? JSON.parse(raw) : [];
  return Array.isArray(list) ? list : [];
}

async function writeExtras(env, dateStr, list) {
  await env.PUSH_KV.put(EXTRA_PREFIX + dateStr, JSON.stringify(list), { expirationTtl: 60 * 60 * 24 * 60 });
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

  // dagens rad till kalkylarket, strax före midnatt
  const stateForSheet = await env.PUSH_KV.get(STATE_KEY);
  await maybeSendDailySheet(env, {
    app: "mrs-raccoon",
    title: "Mrs Raccoon",
    dateStr,
    minutesOfDay,
    historyPrefix: HISTORY_PREFIX,
    streak: stateForSheet ? JSON.parse(stateForSheet).streak ?? null : null
  });

  // Tyst natt. Ingenting lottas eller skickas utanför fönstret.
  if (minutesOfDay < WINDOW_START_MIN || minutesOfDay >= WINDOW_END_MIN) return;

  const hasSub = !!(await env.PUSH_KV.get(SUB_KEY));
  if (!hasSub) return;

  // Märkesdagar går före allt annat och ligger utanför dagens lottade tider.
  if (await sendSpecialIfDue(env, dateStr, minutesOfDay)) return;

  // Kvällens hetare hälsning, också utanför de fem vanliga.
  if (await maybeSendSpicy(env, dateStr, minutesOfDay)) return;

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


// En äldre version av appen skickade namngivna flaggor i stället för en
// lista. Telefoner kan ha den kvar i cachen ett tag, så vi översätter.
//
// Tvätt- och dammsugningsflaggorna i den versionen sattes till "klar" även
// de dagar uppgiften inte stod på listan, för att slippa knuffar om dem.
// De går alltså inte att lita på och tas inte med här, annars hamnar bockar
// i historiken som han aldrig satt.
const LEGACY_FLAGS = [
  ["boringDone", "trakigt", "😤", "Gör något tråkigt som du inte vill göra"],
  ["treatDone", "gott", "🍫", "Unna dig något gott"],
  ["wifeDone", "fru", "💌", "Skicka ett gulligt meddelande till din fru"],
  ["thinkDone", "tankfru", "💭", "Tänk på din fru!"],
  ["tidyDone", "nedanvaning", "🧹", "Plocka undan 10 saker från nedanvåningen"],
  ["cleanDone", "stada", "🧼", "Städa nåt!"],
  ["gardenDone", "tradgard", "🌿", "Ta en runda i trädgården"],
  ["runDone", "spring", "👟", "Spring en runda"]
];

function tasksFromLegacyFlags(body) {
  const any = LEGACY_FLAGS.some(([flagg]) => flagg in body);
  if (!any) return [];
  return LEGACY_FLAGS
    .filter(([, id]) => (id === "spring" ? !!body.runDueToday : true))
    .map(([flagg, id, emoji, text]) => ({ id, emoji, text, done: !!body[flagg] }));
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
    const tasks = Array.isArray(body.tasks) ? body.tasks : tasksFromLegacyFlags(body);
    const state = {
      dateStr,
      updatedAt: new Date().toISOString(),
      allDoneToday: !!body.allDoneToday,
      streak: Number(body.streak) || 0,
      hearts: Number(body.hearts) || 0,
      tasks
    };
    await env.PUSH_KV.put(STATE_KEY, JSON.stringify(state));

    // Rättningar i panelen vinner, och en tom rapport från en ny enhet får
    // inte nolla en dag som redan har bockar.
    const raw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
    const tidigare = raw ? JSON.parse(raw) : {};
    const sammanslagna = mergeSyncedTasks(tidigare, tasks);

    await mergeHistory(env, dateStr, {
      tasks: sammanslagna,
      streak: state.streak,
      hearts: state.hearts,
      allDoneToday: sammanslagna.every((t) => t.done),
      updatedAt: state.updatedAt
    });
    return json({ ok: true });
  }

  // Dagens sparade läge, så appen kan hämta tillbaka bockar som telefonen
  // tappat (ny installation, rensad webbläsare, byte av enhet).
  if (path === "/state" && request.method === "GET") {
    const { dateStr } = stockholmParts(new Date());
    const raw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
    const post = raw ? JSON.parse(raw) : null;
    return json({ dateStr, tasks: post && Array.isArray(post.tasks) ? post.tasks : [] });
  }

  // Appen hämtar den publika VAPID-nyckeln härifrån i stället för att ha
  // den inskriven i koden, så den aldrig kan hamna i otakt med workern.
  // Publika nyckeln är just publik, den är ofarlig att lämna ut.
  // Appen frågar efter dagens extrauppgifter. Öppen, precis som /sync.
  if (path === "/extra" && request.method === "GET") {
    const dateStr = url.searchParams.get("date") || stockholmParts(new Date()).dateStr;
    return json({ date: dateStr, tasks: await readExtras(env, dateStr) });
  }

  if (path === "/vapid" && request.method === "GET") {
    return json({ publicKey: env.VAPID_PUBLIC_KEY || null });
  }

  // Appen hämtar samma meddelanden som pushas, för pratbubblan i appen.
  if (path === "/messages" && request.method === "GET") {
    return json({ love: LOVE, pep: PEP, bus: BUS, fanigt: FANIGT });
  }

  const panelRes = await handlePanelRequest(request, env, url, {
    title: "Mrs Raccoon 🦝",
    historyPrefix: HISTORY_PREFIX,
    authorized: adminKeyOk,
    corsHeaders: CORS_HEADERS
  });
  if (panelRes) return panelRes;

  if (path.startsWith("/admin") && !adminKeyOk(request, url, env)) return denied();

  // Föräldrapanelen lägger till eller tar bort en engångsuppgift.
  if (path === "/admin/extra" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const text = (body.text || "").trim();
    if (!text) return json({ ok: false, error: "ingen text" }, 400);
    const dateStr = body.date || stockholmParts(new Date()).dateStr;
    const list = await readExtras(env, dateStr);
    const task = {
      id: "extra-" + dateStr + "-" + Math.random().toString(36).slice(2, 8),
      emoji: (body.emoji || "⭐").slice(0, 4),
      text: text.slice(0, 80),
      date: dateStr
    };
    list.push(task);
    await writeExtras(env, dateStr, list);
    return json({ ok: true, task, tasks: list });
  }

  if (path === "/admin/extra/delete" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const dateStr = body.date || stockholmParts(new Date()).dateStr;
    const list = (await readExtras(env, dateStr)).filter((t) => t.id !== body.id);
    await writeExtras(env, dateStr, list);
    return json({ ok: true, tasks: list });
  }

  if (path === "/admin/summary" && request.method === "GET") {
    return json(await buildSummary(env, url, request));
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
      `Kvällens hälsning: ${await (async () => {
        const raw = await env.PUSH_KV.get(SPICY_PREFIX + dateStr);
        if (!raw) return "inte lottad än";
        const p = JSON.parse(raw);
        return p.sent ? `skickad ${hhmm(p.at)}` : `lottad till ${hhmm(p.at)}`;
      })()}`,
      "",
      "Märkesdagar:",
      ...SPECIAL_DAYS.map((d) => `  ${d.id}: om ${daysUntil(dateStr, d.month, d.day)} dagar`)
    ];
    return text(lines.join("\n"));
  }

  // Skickar kvällens hälsning direkt, för att testa den utan att vänta.
  if (path === "/admin/spicy-now" && request.method === "GET") {
    const recent = await getRecent(env);
    const message = pickFresh(SPICY, recent);
    const ok = await sendPush(env, message);
    if (ok) await rememberSent(env, message);
    return text(ok ? `Skickad! 💌\n\n${message}` : "Misslyckades, troligen finns ingen aktiv prenumeration just nu.");
  }

  // Skriver dagens rad till kalkylarket direkt, för att testa kopplingen.
  if (path === "/admin/sheet-now" && request.method === "GET") {
    const { dateStr, minutesOfDay } = stockholmParts(new Date());
    const stateRaw = await env.PUSH_KV.get(STATE_KEY);
    const res = await maybeSendDailySheet(env, {
      app: "mrs-raccoon",
      title: "Mrs Raccoon",
      dateStr,
      minutesOfDay,
      historyPrefix: HISTORY_PREFIX,
      streak: stateRaw ? JSON.parse(stateRaw).streak ?? null : null,
      force: true
    });
    return text(res.ok ? `Skrivet till arket ✅\n${res.date}: ${res.done} av ${res.total} klara` : `Gick inte: ${res.reason}`);
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
