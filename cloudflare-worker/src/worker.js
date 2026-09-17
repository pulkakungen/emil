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
  LOVE,
  PEP,
  BUS,
  FANIGT
} from "./messages.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
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

// Ibland blir notisen en knuff till en uppgift i stället för ren pepp,
// men bara om uppgiften faktiskt är kvar att göra och bara ungefär var
// tredje notis. Resten av tiden är det kärlek och pepp, som det ska vara.
const NUDGE_CHANCE = 0.3;

function chooseMessage(state, minutesOfDay, weekday, recent) {
  if (!state || !state.dateStr) return pickWeighted(recent);

  const homeOk = homeTaskAllowed(minutesOfDay, weekday);
  const candidates = [];

  // Uppgifter han kan göra var som helst, när som helst.
  if (!state.boringDone && minutesOfDay < 15 * 60) candidates.push(TASK_TRAKIGT);
  if (!state.treatDone && minutesOfDay >= 15 * 60) candidates.push(TASK_GOTT);
  if (!state.wifeDone && minutesOfDay >= 11 * 60) candidates.push(TASK_FRU);
  if (!state.thinkDone) candidates.push(TASK_TANK);

  // Hemmasysslorna, bara när han rimligen är hemma.
  if (homeOk) {
    if (!state.laundrySortDone) candidates.push(TASK_SORTERA);
    if (!state.laundryRunDone) candidates.push(TASK_TVATT);
    if (!state.vacuumDone) candidates.push(TASK_DAMMSUG);
    if (!state.tidyDone) candidates.push(TASK_NEDANVANING);
    if (!state.cleanDone) candidates.push(TASK_STADA);
    if (!state.gardenDone) candidates.push(TASK_TRADGARD);
    if (state.runDueToday && !state.runDone) candidates.push(TASK_SPRING);
  }

  if (candidates.length && Math.random() < NUDGE_CHANCE) {
    return pickFresh(pick(candidates), recent);
  }
  return pickWeighted(recent);
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
    expirationTtl: 60 * 60 * 24 * 120
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
    const state = {
      dateStr,
      updatedAt: new Date().toISOString(),
      boringDone: !!body.boringDone,
      treatDone: !!body.treatDone,
      wifeDone: !!body.wifeDone,
      thinkDone: !!body.thinkDone,
      laundrySortDone: !!body.laundrySortDone,
      laundryRunDone: !!body.laundryRunDone,
      vacuumDone: !!body.vacuumDone,
      gardenDone: !!body.gardenDone,
      tidyDone: !!body.tidyDone,
      cleanDone: !!body.cleanDone,
      runDone: !!body.runDone,
      runDueToday: !!body.runDueToday,
      allDoneToday: !!body.allDoneToday,
      streak: Number(body.streak) || 0
    };
    await env.PUSH_KV.put(STATE_KEY, JSON.stringify(state));
    await mergeHistory(env, dateStr, {
      boringDone: state.boringDone,
      treatDone: state.treatDone,
      wifeDone: state.wifeDone,
      thinkDone: state.thinkDone,
      laundrySortDone: state.laundrySortDone,
      laundryRunDone: state.laundryRunDone,
      vacuumDone: state.vacuumDone,
      gardenDone: state.gardenDone,
      tidyDone: state.tidyDone,
      cleanDone: state.cleanDone,
      runDone: state.runDone,
      runDueToday: state.runDueToday,
      allDoneToday: state.allDoneToday
    });
    return json({ ok: true });
  }

  // Appen hämtar samma meddelanden som pushas, för pratbubblan i appen.
  if (path === "/messages" && request.method === "GET") {
    return json({ love: LOVE, pep: PEP, bus: BUS, fanigt: FANIGT });
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
      `App-status: ${stateRaw || "appen har aldrig synkat"}`
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
