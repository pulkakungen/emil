/* =========================================================
   Dagsloggen till kalkylarket

   Skickar dagens rad till Apps Script-webbappen strax före midnatt.
   Gör ingenting alls om SHEET_URL saknas, så appen fungerar precis som
   förut tills du satt hemligheterna:
     npx wrangler secret put SHEET_URL
     npx wrangler secret put SHEET_TOKEN
   ========================================================= */

// Skickas när svensk lokaltid passerat 23.50, alltså på 23.58-körningen.
const SEND_AFTER_MIN = 23 * 60 + 50;
const SENT_PREFIX = "sheet:";

const VECKODAGAR = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

export async function maybeSendDailySheet(env, opts) {
  const { app, title, dateStr, minutesOfDay, historyPrefix, streak = null, force = false } = opts;
  if (!env.SHEET_URL) return { ok: false, reason: "SHEET_URL saknas" };
  if (!force && minutesOfDay < SEND_AFTER_MIN) return { ok: false, reason: "för tidigt på dygnet" };

  const flagga = SENT_PREFIX + dateStr;
  if (!force && (await env.PUSH_KV.get(flagga))) return { ok: false, reason: "redan skickad idag" };

  const raw = await env.PUSH_KV.get(historyPrefix + dateStr);
  const post = raw ? JSON.parse(raw) : null;
  const tasks = post && Array.isArray(post.tasks) ? post.tasks : [];

  const payload = {
    token: env.SHEET_TOKEN || "",
    app,
    title,
    date: dateStr,
    weekday: VECKODAGAR[new Date(dateStr + "T12:00:00Z").getUTCDay()],
    done: tasks.filter((t) => t.done).length,
    total: tasks.length,
    streak,
    tasks: tasks.map((t) => ({ id: t.id, text: t.text || t.id, done: !!t.done }))
  };

  try {
    const res = await fetch(env.SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow" // Apps Script svarar med en omdirigering
    });
    const text = await res.text();
    if (!res.ok || text.includes('"ok":false')) {
      console.error("dagsloggen nekades", res.status, text.slice(0, 200));
      return { ok: false, reason: "arket svarade " + res.status + ": " + text.slice(0, 120) };
    }
  } catch (err) {
    console.error("dagsloggen kunde inte skickas", err && err.message);
    return { ok: false, reason: "kunde inte nå arket: " + (err && err.message) };
  }

  // markera dagen som skickad, men bara ett par dygn framåt
  await env.PUSH_KV.put(flagga, new Date().toISOString(), { expirationTtl: 60 * 60 * 72 });
  return { ok: true, date: dateStr, done: payload.done, total: payload.total };
}
