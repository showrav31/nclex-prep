/* Saved progress. Everything lives in localStorage under ONE key (KEY below).
   NEVER rename the key or drop fields: add a step to migrate() instead.

   Keys that point into the data files use array positions, e.g. lv["2-5"] =
   category 2, topic 5. So never reorder or delete topics, plan tasks or Canada
   steps in data/*.json; only append. */

const KEY = "nclexDash2";
const VERSION = 3;

const DEFAULTS = () => ({
  v: VERSION,
  exam: "2028-07-01", // target exam date (YYYY-MM-DD)
  lv: {},             // topic ratings: "cat-topic" -> 1 Weak, 2 OK, 3 Confident
  can: {},            // Canada roadmap: step index -> true
  plan: {},           // study plan: "phase-task" -> true
  stat: {},           // per category: {n: answered, c: correct}
  sessions: [],       // practice sessions: {d, q, c, cat}
  name: "",           // added in v3
  minutes: 30,        // daily study time in minutes (v3)
  setup: false,       // first-time setup finished (v3)
  days: {},           // "YYYY-MM-DD" -> number of study actions that day (v3)
  task: null          // today's study task {d, c, tp, done} (v3)
});

/* Local calendar date (not UTC: Bangladesh is UTC+6). */
function dayKey(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function migrate(x, raw) {
  // v1/v2 (single-file dashboard): no version field, no name/streak.
  if (!x.v || x.v < 3) {
    try { // keep an untouched copy of the old data, just in case
      if (raw && !localStorage.getItem(KEY + "_backup_v2")) localStorage.setItem(KEY + "_backup_v2", raw);
    } catch (e) {}
    x.days = x.days || {};
    (x.sessions || []).forEach(s => { if (s.d) x.days[s.d] = (x.days[s.d] || 0) + 1; });
    x.v = 3;
  }
  // future: if (x.v < 4) { ...; x.v = 4; }
  return x;
}

function loadState() {
  let raw = null, x = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (raw) {
    try { x = JSON.parse(raw); }
    catch (e) { // unreadable: park it rather than overwrite it
      try { localStorage.setItem(KEY + "_unreadable_" + Date.now(), raw); } catch (e2) {}
    }
  }
  const s = Object.assign(DEFAULTS(), x && typeof x === "object" ? migrate(x, raw) : {});
  ["lv", "can", "plan", "stat", "days"].forEach(k => { if (!s[k] || typeof s[k] !== "object") s[k] = {}; });
  if (!Array.isArray(s.sessions)) s.sessions = [];
  return s;
}

let S = loadState();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
  catch (e) { return false; }
}

/* Record that she studied today (feeds the streak). */
function markActive() {
  const d = dayKey();
  S.days[d] = (S.days[d] || 0) + 1;
}

/* Consecutive study days ending today, or yesterday if today isn't done yet. */
function streak() {
  const d = new Date();
  if (!S.days[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (S.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
