"use strict";

/* =========================================================
   MRS RACCOON 🦝 – uppgifter, pepp och kärleksnotiser

   Uppgifterna ligger i TASKS här nedanför. Lägg gärna till fler,
   det enda som krävs är ett unikt id, en emoji och en text.
   everyDays: 3 betyder rullande var tredje dag räknat från senaste
   gången uppgiften bockades av. days: [3, 6] betyder i stället bestämda
   veckodagar (0 = söndag, 1 = måndag ... 6 = lördag).
   ========================================================= */

const STORAGE_KEY = "mrs_raccoon_state_v1";
const MESSAGE_CACHE_KEY = "mrs_raccoon_messages_v1";

const PUSH_WORKER_URL = "https://mrs-raccoon-push.bella-sassibrass.workers.dev";

// Publika VAPID-nyckeln hämtas från workern, så den aldrig kan hamna i
// otakt med nyckeln som ligger som hemlighet där.
async function getVapidKey() {
  const res = await fetch(PUSH_WORKER_URL + "/vapid");
  const data = await res.json();
  if (!data.publicKey) throw new Error("workern saknar VAPID_PUBLIC_KEY");
  return data.publicKey;
}

const TASKS = [
  { id: "trakigt", emoji: "😤", text: "Gör något tråkigt som du inte vill göra", hint: "Tio minuter räcker. Fult och snabbt slår perfekt och aldrig." },
  { id: "gott", emoji: "🍫", text: "Unna dig något gott", hint: "Kaffe, kaka, bad, en halvtimme i soffan. Du bestämmer." },
  { id: "fru", emoji: "💌", text: "Skicka ett gulligt meddelande till din fru", hint: "En rad räcker. Hon sparar den hela dagen." },
  { id: "tankfru", emoji: "💭", text: "Tänk på din fru!", hint: "Tio sekunder. Minns något du gillar med henne, bara för dig själv." },
  { id: "tvatt-sortera", emoji: "🧺", text: "Sortera och lägg in en tvätt", hint: "Varannan dag. Vitt för sig, kulört för sig.", everyDays: 2 },
  { id: "tvatt-kor", emoji: "🌀", text: "Kör en maskin tvätt", hint: "Var tredje dag. Tryck på knappen, tvättbjörnen är personligt engagerad.", everyDays: 3 },
  { id: "dammsug", emoji: "🔌", text: "Dammsug 1 rum", hint: "Onsdagar och lördagar. Ett rum räcker.", days: [3, 6] },
  { id: "nedanvaning", emoji: "🧹", text: "Plocka undan 10 saker från nedanvåningen", hint: "Tio saker, inte mer. Räkna dem högt om du vill." },
  { id: "stada", emoji: "🧼", text: "Städa nåt!", hint: "Vad som helst. En yta, ett skåp, en hylla. Du väljer." },
  { id: "tradgard", emoji: "🌿", text: "Ta en runda i trädgården", hint: "Bara gå ut och titta. Räknas även om du inte gör något." },
  { id: "spring", emoji: "👟", text: "Spring en runda", hint: "Rullande var tredje dag. Långsamt räknas också.", everyDays: 3 }
];

/* ---------------- märkesdagar ----------------
   Visas som en rubrik i appen på dagen och dagarna innan.
   Samma dagar finns i workern, som skickar notiserna. */
const SPECIAL_DAYS = [
  { month: 9, day: 7, emoji: "💍", name: "er bröllopsdag", leadDays: 7 },
  { month: 2, day: 14, emoji: "❤️", name: "alla hjärtans dag", leadDays: 3 },
  { month: 10, day: 4, emoji: "🥐", name: "kanelbullens dag", leadDays: 1 }
];

function daysUntilSpecial(day) {
  const today = new Date(state.dateStr + "T12:00:00Z");
  let target = new Date(Date.UTC(today.getUTCFullYear(), day.month - 1, day.day, 12));
  if (target < today) target = new Date(Date.UTC(today.getUTCFullYear() + 1, day.month - 1, day.day, 12));
  return Math.round((target - today) / 86400000);
}

function renderSpecialBanner() {
  const box = document.getElementById("special-banner");
  for (const day of SPECIAL_DAYS) {
    const left = daysUntilSpecial(day);
    if (left === 0) {
      box.textContent = `${day.emoji} Idag är det ${day.name}!`;
      box.hidden = false;
      return;
    }
    if (left <= day.leadDays) {
      box.textContent = `${day.emoji} ${left === 1 ? "Imorgon" : "Om " + left + " dagar"} är det ${day.name}.`;
      box.hidden = false;
      return;
    }
  }
  box.hidden = true;
}

/* ---------------- tvättbjörnens poser ----------------
   Bilderna ligger i mappen raccoons och är utklippta ur de tre arken.
   Lägg till fler filer där och skriv in namnen i listorna nedan. */
const POSES = {
  idle: ["idle-stand", "idle-upright", "idle-sit", "idle-sit2", "idle-sit3", "idle-front"],
  happy: ["happy-hug", "happy-wave", "happy-walk", "happy-belly"],
  cheer: ["cheer-arms", "cheer-jump", "cheer-hang", "cheer-roll"],
  sleep: ["sleep-curl", "sleep-curl2", "sleep-lie", "sleep-lie2"],
  run: ["run-leap", "run-dash", "run-slide"],
  work: ["work-dig", "work-dig2", "work-crouch"]
};

// Kvällsläge: efter 21 lägger sig tvättbjörnen till ro.
function nightTime() {
  const h = new Date().getHours();
  return h >= 21 || h < 7;
}

// Vilket vilo-läge som gäller just nu: sovande på kvällen, löparpose när
// löprundan är aktuell, sysslo-pose när hemmagörat är kvar på eftermiddagen,
// annars vanligt lugnt läge.
function idleMood() {
  if (nightTime()) return "sleep";
  const runTask = TASKS.find((t) => t.everyDays);
  if (runTask && isTaskActive(runTask) && !state.done[runTask.id] && Math.random() < 0.5) return "run";
  const choreIds = ["tvatt-sortera", "tvatt-kor", "dammsug", "nedanvaning", "stada"];
  const choresLeft = TASKS.filter((t) => choreIds.includes(t.id))
    .some((t) => isTaskActive(t) && !state.done[t.id]);
  if (choresLeft && new Date().getHours() >= 17 && Math.random() < 0.4) return "work";
  return "idle";
}

function setPose(mood) {
  const list = POSES[mood] || POSES.idle;
  document.getElementById("raccoon").src = "raccoons/" + pick(list) + ".png";
}

/* --------- små pepptexter i appen om worker inte svarar --------- */
const FALLBACK_MESSAGES = [
  "Jag älskar dig, älskling. Det var allt. 🦝❤️",
  "Du fixar det här, snutt. Ett steg i taget.",
  "Snyggaste i huset är du, äcklis. 😏",
  "Herr tacos, jag är stolt över dig idag också.",
  "Gullis, du behöver inte prestera för att förtjäna kärlek. 💗",
  "Andas. Axlarna ner. Du har tid. ✨"
];

let messagePool = FALLBACK_MESSAGES.slice();

/* --------------------------- datum --------------------------- */

function todayStr() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T12:00:00Z").getTime();
  const b = new Date(toStr + "T12:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

/* --------------------------- state --------------------------- */

function defaultState() {
  const today = todayStr();
  const due = {};
  TASKS.filter((t) => t.everyDays).forEach((t) => {
    due[t.id] = today; // första gången är uppgiften aktuell direkt
  });
  return {
    version: 1,
    dateStr: today,
    done: {},
    due,
    prevDue: {},
    streak: 0,
    lastAllDoneDate: null,
    hearts: 0
  };
}

let state = defaultState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...defaultState(), ...JSON.parse(raw) };
  } catch (e) {
    state = defaultState();
  }
  rolloverDay();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* privat läge eller fullt utrymme, appen fungerar ändå */
  }
}

// Ny dag = tom kryssruta, och streaken bryts om gårdagen inte blev klar.
function rolloverDay() {
  const today = todayStr();
  if (state.dateStr !== today) {
    state.dateStr = today;
    state.done = {};
  }
  const last = state.lastAllDoneDate;
  if (!last || (last !== today && last !== addDays(today, -1))) {
    state.streak = 0;
  }
}

/* --------------------------- uppgifter --------------------------- */

function weekdayOf(dateStr) {
  return new Date(dateStr + "T12:00:00Z").getUTCDay(); // 0 = söndag
}

function isTaskActive(task) {
  // redan avbockad idag: ligger kvar i listan resten av dagen, annars
  // skulle uppgiften försvinna i samma stund den kryssades i
  if (state.done[task.id]) return true;
  if (task.days) return task.days.includes(weekdayOf(state.dateStr));
  if (!task.everyDays) return true;
  const due = state.due[task.id] || state.dateStr;
  return daysBetween(due, state.dateStr) >= 0; // förfallen eller exakt idag
}

// Sant om uppgiften står på dagens lista (rullande uppgifter bara när de förfallit).
function isTaskDueToday(id) {
  const task = TASKS.find((t) => t.id === id);
  return !!task && isTaskActive(task);
}

function activeTasks() {
  return TASKS.filter(isTaskActive);
}

function doneCount() {
  return activeTasks().filter((t) => state.done[t.id]).length;
}

function allDoneToday() {
  const active = activeTasks();
  return active.length > 0 && doneCount() === active.length;
}

function toggleTask(id) {
  const task = TASKS.find((t) => t.id === id);
  if (!task) return;

  const wasDone = !!state.done[id];
  state.done[id] = !wasDone;

  if (task.everyDays) {
    if (!wasDone) {
      // rullande: nästa gång räknas från idag
      state.prevDue[id] = state.due[id] || state.dateStr;
      state.due[id] = addDays(state.dateStr, task.everyDays);
    } else {
      state.due[id] = state.prevDue[id] || state.dateStr;
    }
  }

  if (!wasDone) {
    state.hearts += 5;
    showToast(pick([
      "Snyggt jobbat! 💪",
      "Där satt den, älskling!",
      "Bock! Jag är stolt över dig 🦝",
      "Ett steg till, snutt ✨"
    ]));
  }

  if (allDoneToday() && state.lastAllDoneDate !== state.dateStr) {
    const yesterday = addDays(state.dateStr, -1);
    state.streak = state.lastAllDoneDate === yesterday ? state.streak + 1 : 1;
    state.lastAllDoneDate = state.dateStr;
    state.hearts += 20;
    celebrate();
    setPose("cheer");
    clearTimeout(poseTimer);
    say("Allt klart idag! Du är dagens tvättbjörn, älskling 🏆");
  }

  saveState();
  render();
  syncToWorker();
}

/* --------------------------- rendering --------------------------- */

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function say(message) {
  document.getElementById("bubble").textContent = message;
}

function render() {
  const active = activeTasks();
  const done = doneCount();

  document.getElementById("streak-count").textContent = state.streak;
  document.getElementById("hearts-count").textContent = state.hearts;
  document.getElementById("progress-text").textContent = `${done} / ${active.length}`;
  document.getElementById("progress-fill").style.width =
    active.length ? `${(done / active.length) * 100}%` : "0%";

  const list = document.getElementById("task-list");
  list.innerHTML = "";
  active.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task" + (state.done[task.id] ? " done" : "");
    li.dataset.id = task.id;
    li.innerHTML = `
      <span class="task-check" aria-hidden="true">${state.done[task.id] ? "✓" : ""}</span>
      <span class="task-body">
        <span class="task-text"><span class="task-emoji">${task.emoji}</span>${task.text}</span>
        ${task.hint ? `<span class="task-hint">${task.hint}</span>` : ""}
      </span>`;
    list.appendChild(li);
  });

  renderRunInfo();
  renderSpecialBanner();
}

// Visar när de rullande uppgifterna är inbokade nästa gång.
function renderRunInfo() {
  const box = document.getElementById("run-info");
  const dagNamn = ["söndagar", "måndagar", "tisdagar", "onsdagar", "torsdagar", "fredagar", "lördagar"];
  const veckoRader = TASKS.filter((t) => t.days).map(
    (task) => `${task.emoji} ${task.text}: ${task.days.map((d) => dagNamn[d]).join(" och ")}.`
  );
  const rows = TASKS.filter((t) => t.everyDays).map((task) => {
    const due = state.due[task.id] || state.dateStr;
    const diff = daysBetween(state.dateStr, due);
    const namn = task.text.toLowerCase();
    if (diff <= 0) return `${task.emoji} ${task.text} är aktuellt idag.`;
    if (diff === 1) return `${task.emoji} Nästa gång för ${namn}: imorgon.`;
    return `${task.emoji} Nästa gång för ${namn}: om ${diff} dagar (${due}).`;
  });
  box.innerHTML = rows.concat(veckoRader).map((r) => `<div>${r}</div>`).join("");
}

function showToast(message) {
  const layer = document.getElementById("toast-layer");
  // håll högst två i taget, annars täcker de halva skärmen när han
  // bockar av flera uppgifter snabbt efter varandra
  while (layer.children.length >= 2) layer.firstChild.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  layer.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 2200);
}

function celebrate() {
  const layer = document.getElementById("confetti-layer");
  const emojis = ["🦝", "💖", "🎉", "✨", "🏆", "🍫"];
  for (let i = 0; i < 26; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti";
    bit.textContent = pick(emojis);
    bit.style.left = Math.random() * 100 + "vw";
    bit.style.animationDelay = Math.random() * 0.6 + "s";
    bit.style.fontSize = 18 + Math.random() * 18 + "px";
    layer.appendChild(bit);
    setTimeout(() => bit.remove(), 3200);
  }
}

/* --------------------------- push --------------------------- */

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function getPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function enablePush() {
  if (!("Notification" in window) || !("PushManager" in window)) {
    alert("Den här webbläsaren stödjer tyvärr inte push-notiser. På iPhone: lägg till appen på hemskärmen först.");
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  let vapidKey;
  try {
    vapidKey = await getVapidKey();
  } catch (e) {
    alert("Kunde inte hämta nyckeln från servern. Försök igen om en stund.");
    return false;
  }

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey)
  });

  await fetch(PUSH_WORKER_URL + "/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription)
  }).catch(() => {});

  return true;
}

async function disablePush() {
  const sub = await getPushSubscription();
  if (sub) await sub.unsubscribe();
  await fetch(PUSH_WORKER_URL + "/unsubscribe", { method: "POST" }).catch(() => {});
}

async function refreshNotifButton() {
  const btn = document.getElementById("notif-btn");
  const sub = await getPushSubscription();
  btn.textContent = sub ? "🔔" : "🔕";
  btn.title = sub ? "Notiser är på" : "Slå på notiser";
  btn.classList.toggle("active", !!sub);
}

function syncToWorker() {
  const runTask = TASKS.find((t) => t.everyDays);
  fetch(PUSH_WORKER_URL + "/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      boringDone: !!state.done.trakigt,
      treatDone: !!state.done.gott,
      wifeDone: !!state.done.fru,
      thinkDone: !!state.done.tankfru,
      laundrySortDone: !isTaskDueToday("tvatt-sortera") || !!state.done["tvatt-sortera"],
      laundryRunDone: !isTaskDueToday("tvatt-kor") || !!state.done["tvatt-kor"],
      vacuumDone: !isTaskDueToday("dammsug") || !!state.done.dammsug,
      gardenDone: !!state.done.tradgard,
      tidyDone: !!state.done.nedanvaning,
      cleanDone: !!state.done.stada,
      runDone: !!state.done.spring,
      runDueToday: runTask ? isTaskActive(runTask) : false,
      allDoneToday: allDoneToday(),
      streak: state.streak
    })
  }).catch(() => {});
}

/* --------------------- meddelanden till bubblan --------------------- */

async function loadMessages() {
  try {
    const cached = localStorage.getItem(MESSAGE_CACHE_KEY);
    if (cached) messagePool = JSON.parse(cached);
  } catch (e) {
    /* strunt i det, vi har fallback */
  }

  try {
    const res = await fetch(PUSH_WORKER_URL + "/messages");
    const data = await res.json();
    const all = [].concat(data.love || [], data.pep || [], data.bus || [], data.fanigt || []);
    if (all.length) {
      messagePool = all;
      localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(all));
    }
  } catch (e) {
    /* offline, då gäller cachen eller fallback */
  }
}

/* --------------------------- start --------------------------- */

let poseTimer = null;

function init() {
  loadState();
  render();
  setPose(allDoneToday() ? "cheer" : idleMood());
  say(pick(messagePool));

  document.getElementById("task-list").addEventListener("click", (e) => {
    const li = e.target.closest(".task");
    if (li) toggleTask(li.dataset.id);
  });

  const raccoon = document.getElementById("raccoon-wrap");
  raccoon.addEventListener("click", () => {
    state.hearts += 1;
    saveState();
    document.getElementById("hearts-count").textContent = state.hearts;
    raccoon.classList.remove("bounce");
    void raccoon.offsetWidth; // tvinga om animationen
    raccoon.classList.add("bounce");
    say(pick(messagePool));
    if (!allDoneToday()) {
      setPose("happy");
      clearTimeout(poseTimer);
      poseTimer = setTimeout(() => setPose(idleMood()), 3000);
    }
  });

  document.getElementById("notif-btn").addEventListener("click", async () => {
    const sub = await getPushSubscription();
    if (sub) {
      await disablePush();
      showToast("Notiser avstängda 🔕");
    } else {
      const ok = await enablePush();
      showToast(ok ? "Notiser på! Nu blir du överöst 💌" : "Notiser blev inte påslagna");
      if (ok) syncToWorker();
    }
    refreshNotifButton();
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    if (!confirm("Nollställ allt i appen? Streak och hjärtan försvinner.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    saveState();
    render();
  });

  // Dagen kan byta medan appen ligger öppen i bakgrunden.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    rolloverDay();
    saveState();
    render();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(refreshNotifButton).catch(() => {});
  }

  loadMessages().then(() => say(pick(messagePool)));
  syncToWorker();
}

document.addEventListener("DOMContentLoaded", init);
