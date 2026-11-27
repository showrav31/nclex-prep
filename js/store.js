/* Saved progress. Everything lives in localStorage under ONE key (KEY below).
   NEVER rename the key or drop fields: add a step to migrate() instead.

   Progress is saved by each item's fixed text ID from data/*.json
   (e.g. lv["pharm-dosage-calculation"] = 2). IDs never change, so content
   can be reordered, inserted or removed safely. Never reuse a deleted ID. */

const KEY = "nclexDash2";
const VERSION = 4;

const DEFAULTS = () => ({
  v: VERSION,
  exam: "2028-07-01", // target exam date (YYYY-MM-DD)
  lv: {},             // topic ratings: topicId -> 1 Weak, 2 OK, 3 Confident
  can: {},            // Canada roadmap: stepId -> true
  plan: {},           // study plan: taskId -> true
  stat: {},           // per category: catId -> {n: answered, c: correct}
  sessions: [],       // practice sessions: {d, q, c, cat (label), cid (catId)}
  name: "",
  minutes: 30,        // daily study time in minutes
  setup: false,       // first-time setup finished
  days: {},           // "YYYY-MM-DD" -> number of study actions that day
  task: null          // today's study task {d, topic, why, done}
});

/* FROZEN: the content order used by versions 1–3, which saved progress by
   position ("category-topic"). Only the v3 -> v4 migration uses this.
   Never edit it, even when the JSON content changes. */
const LEGACY_V3 = Object.freeze({
  cats: ["moc","safety","health","psych","basic","pharm","risk","phys"],
  catLabels: ["MoC","Safety","Health Promo","Psychosocial","Basic Care","Pharm","Risk Reduction","Phys Adaptation"],
  topics: [
    ["moc-advance-directives","moc-advocacy","moc-delegation","moc-case-management","moc-confidentiality","moc-collaboration","moc-leadership","moc-priorities","moc-ethics","moc-informed-consent","moc-documentation","moc-legal","moc-quality","moc-referrals"],
    ["safety-injury-prevention","safety-emergency-triage","safety-ergonomics","safety-hazardous-materials","safety-home","safety-incident-reports","safety-equipment","safety-security","safety-precautions","safety-surgical-asepsis","safety-restraints"],
    ["health-aging","health-maternal-newborn","health-developmental-stages","health-growth-development","health-prevention-immunizations","health-screening","health-high-risk-behaviours","health-lifestyle","health-self-care","health-physical-assessment"],
    ["psych-abuse-neglect","psych-behavioural-interventions","psych-substance-use","psych-coping","psych-crisis","psych-culture-spirituality","psych-end-of-life","psych-family-dynamics","psych-mental-health","psych-sensory-perceptual","psych-stress","psych-support-systems","psych-therapeutic-communication","psych-therapeutic-environment"],
    ["basic-assistive-devices","basic-elimination","basic-mobility","basic-comfort","basic-nutrition","basic-hygiene","basic-rest-sleep"],
    ["pharm-adverse-effects","pharm-blood-products","pharm-central-lines","pharm-dosage-calculation","pharm-expected-actions","pharm-med-administration","pharm-iv-therapy","pharm-pain-management","pharm-tpn","pharm-high-alert"],
    ["risk-vital-signs","risk-diagnostic-tests","risk-lab-values","risk-body-system-alterations","risk-procedure-complications","risk-system-assessments","risk-therapeutic-procedures"],
    ["phys-body-system-alterations","phys-fluid-electrolytes","phys-acid-base","phys-hemodynamics","phys-illness-management","phys-medical-emergencies","phys-pathophysiology","phys-unexpected-response"]],
  plan: [
    ["plan-get-test-plan","plan-flashcards","plan-study-moc-safety","plan-study-pharm","plan-study-phys-risk","plan-study-health-psych-basic","plan-daily-questions","plan-learn-cjm","plan-start-english"],
    ["plan-mixed-questions","plan-ngn-types","plan-weekly-case-study","plan-restudy-weak","plan-book-english-test","plan-start-nnas"],
    ["plan-qbank","plan-timed-questions","plan-weekly-mock","plan-error-notebook","plan-nclex-eligibility"],
    ["plan-readiness","plan-final-review","plan-book-pearson","plan-exam-day-practice","plan-rest","plan-sit-nclex"]],
  canada: ["can-bnmc","can-documents","can-english-test","can-nnas","can-regulator","can-competence","can-nclex-booking","can-pass-nclex","can-registration-jobs","can-immigration"]
});

/* Local calendar date (not UTC: Bangladesh is UTC+6). */
function dayKey(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

/* Re-key an object; anything that can't be mapped is kept in `left`, never dropped. */
function rekey(obj, toId, left) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    const id = toId(k);
    if (id) out[id] = v; else left[k] = v;
  });
  return out;
}

function migrate(x, raw) {
  const from = x.v || 2;
  try { // keep an untouched copy of the data as it was before this migration
    if (raw && from < VERSION && !localStorage.getItem(KEY + "_backup_v" + from)) localStorage.setItem(KEY + "_backup_v" + from, raw);
  } catch (e) {}

  // v1/v2 (single-file dashboard) -> v3: add streak days from past sessions.
  if (from < 3) {
    x.days = x.days || {};
    (x.sessions || []).forEach(s => { if (s.d) x.days[s.d] = (x.days[s.d] || 0) + 1; });
    x.v = 3;
  }

  // v3 -> v4: position keys -> fixed IDs.
  if (x.v < 4) {
    const L = LEGACY_V3, pos = k => String(k).split("-").map(Number);
    const left = { lv: {}, plan: {}, can: {}, stat: {} };
    x.lv = rekey(x.lv, k => { const [c, t] = pos(k); return L.topics[c] && L.topics[c][t]; }, left.lv);
    x.plan = rekey(x.plan, k => { const [p, t] = pos(k); return L.plan[p] && L.plan[p][t]; }, left.plan);
    x.can = rekey(x.can, k => L.canada[+k], left.can);
    x.stat = rekey(x.stat, k => L.cats[+k], left.stat);
    const t = x.task;
    x.task = t && L.topics[t.c] && L.topics[t.c][t.tp] ? { d: t.d, topic: L.topics[t.c][t.tp], why: t.why, done: !!t.done } : null;
    (x.sessions || []).forEach(s => { const i = L.catLabels.indexOf(s.cat); if (i >= 0) s.cid = L.cats[i]; });
    if (Object.values(left).some(o => Object.keys(o).length)) x.unmapped = left;
    x.v = 4;
  }
  // future: if (x.v < 5) { ...; x.v = 5; }
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
