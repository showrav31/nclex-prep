/* Saved progress. Everything lives in localStorage under ONE key (KEY below).
   NEVER rename the key or drop fields: add a step to migrate() instead.

   Progress is saved by each item's fixed text ID from data/*.json
   (e.g. lv["pharm-dosage-calculation"] = 2). IDs never change, so content
   can be reordered, inserted or removed safely. Never reuse a deleted ID. */

const KEY = "nclexDash2";
const VERSION = 6;

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
  task: null,         // today's study task {d, topic, why, done}
  // v5: study tools
  cards: {},          // flashcard SRS state: cardId -> {due, ivl, ease, reps, lapses}
  fcNew: { d: "", n: 0 }, // new cards started today
  fcReviews: 0,       // total flashcard reviews (for badges)
  myCards: [],        // her own cards: {id, front, back, created}
  notes: {},          // topic notes: topicId -> {text, updated}
  freeNotes: [],      // free notes: {id, title, text, updated}
  mistakes: {},       // questionId -> {topic, stem, rationale, first, last, n, why, fixed}
  timer: { work: 25, brk: 5 },
  timerRun: null,     // running timer {mode, end, left, topic, work}
  study: {},          // timer minutes: "YYYY-MM-DD" -> {topicId|"general": minutes}
  badges: {},         // badgeId -> date earned
  theme: "auto",      // auto | light | dark
  textSize: 1,        // 1, 1.12, 1.25
  // v6: official 2026 syllabus
  points: {}          // learning points ticked: learningPointId -> true
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

/* FROZEN: old topic ids (schema v5 and earlier) -> official 2026 syllabus ids, for the v5 -> v6 migration.
   Generated from data/legacy-topic-map.json (tests/check-data.js checks they agree). Never edit it.
   topics: null = no matching topic. qfallback: where questions/mistakes of an unmatched topic go. */
const LEGACY_V5 = Object.freeze({
  cats: {
    "moc": "management-of-care",
    "safety": "safety-infection-control",
    "health": "health-promotion",
    "psych": "psychosocial-integrity",
    "basic": "basic-care-comfort",
    "pharm": "pharmacological-parenteral",
    "risk": "reduction-risk-potential",
    "phys": "physiological-adaptation"
  },
  topics: {
    "moc-advance-directives": "management-of-care--advance-directives-self-determination-life-planning",
    "moc-advocacy": "management-of-care--advocacy",
    "moc-delegation": "management-of-care--assignment-delegation-and-supervision",
    "moc-case-management": "management-of-care--case-management",
    "moc-confidentiality": "management-of-care--confidentiality-information-security",
    "moc-collaboration": "management-of-care--collaboration-with-multidisciplinary-team",
    "moc-leadership": "management-of-care--concepts-of-management",
    "moc-priorities": "management-of-care--establishing-priorities",
    "moc-ethics": "management-of-care--ethical-practice",
    "moc-informed-consent": "management-of-care--informed-consent",
    "moc-documentation": "management-of-care--information-technology",
    "moc-legal": "management-of-care--legal-rights-and-responsibilities",
    "moc-quality": "management-of-care--performance-improvement-quality-improvement",
    "moc-referrals": "management-of-care--referrals",
    "safety-injury-prevention": "safety-infection-control--accident-error-injury-prevention",
    "safety-emergency-triage": "safety-infection-control--emergency-response-plan",
    "safety-ergonomics": "safety-infection-control--ergonomic-principles",
    "safety-hazardous-materials": "safety-infection-control--handling-hazardous-and-infectious-materials",
    "safety-home": "safety-infection-control--home-safety",
    "safety-incident-reports": "safety-infection-control--reporting-of-incident-event-irregular-occurrence-variance",
    "safety-equipment": "safety-infection-control--safe-use-of-equipment",
    "safety-security": "safety-infection-control--security-plan",
    "safety-precautions": "safety-infection-control--standard-precautions-transmission-based-precautions-surgical-asepsis",
    "safety-surgical-asepsis": "safety-infection-control--standard-precautions-transmission-based-precautions-surgical-asepsis",
    "safety-restraints": "safety-infection-control--use-of-restraints-safety-devices",
    "health-aging": "health-promotion--aging-process",
    "health-maternal-newborn": "health-promotion--ante-intra-postpartum-and-newborn-care",
    "health-developmental-stages": "health-promotion--developmental-stages-and-transitions",
    "health-growth-development": "health-promotion--developmental-stages-and-transitions",
    "health-prevention-immunizations": "health-promotion--health-promotion-disease-prevention",
    "health-screening": "health-promotion--health-screening",
    "health-high-risk-behaviours": "health-promotion--high-risk-behaviors",
    "health-lifestyle": "health-promotion--lifestyle-choices",
    "health-self-care": "health-promotion--self-care",
    "health-physical-assessment": "health-promotion--techniques-of-physical-assessment",
    "psych-abuse-neglect": "psychosocial-integrity--abuse-or-neglect",
    "psych-behavioural-interventions": "psychosocial-integrity--behavioral-interventions",
    "psych-substance-use": "psychosocial-integrity--chemical-and-other-dependencies-substance-use-disorder",
    "psych-coping": "psychosocial-integrity--coping-mechanisms",
    "psych-crisis": "psychosocial-integrity--crisis-intervention",
    "psych-culture-spirituality": "psychosocial-integrity--cultural-awareness-cultural-influences-on-health",
    "psych-end-of-life": "psychosocial-integrity--end-of-life-care",
    "psych-family-dynamics": "psychosocial-integrity--family-dynamics",
    "psych-mental-health": "psychosocial-integrity--mental-health-concepts",
    "psych-sensory-perceptual": "psychosocial-integrity--sensory-perceptual-alterations",
    "psych-stress": "psychosocial-integrity--stress-management",
    "psych-support-systems": "psychosocial-integrity--support-systems",
    "psych-therapeutic-communication": "psychosocial-integrity--therapeutic-communication",
    "psych-therapeutic-environment": "psychosocial-integrity--therapeutic-environment",
    "basic-assistive-devices": "basic-care-comfort--assistive-devices",
    "basic-elimination": "basic-care-comfort--elimination",
    "basic-mobility": "basic-care-comfort--mobility-immobility",
    "basic-comfort": "basic-care-comfort--nonpharmacological-comfort-interventions",
    "basic-nutrition": "basic-care-comfort--nutrition-and-oral-hydration",
    "basic-hygiene": "basic-care-comfort--personal-hygiene",
    "basic-rest-sleep": "basic-care-comfort--rest-and-sleep",
    "pharm-adverse-effects": "pharmacological-parenteral--adverse-effects-contraindications-side-effects-interactions",
    "pharm-blood-products": "pharmacological-parenteral--blood-and-blood-products",
    "pharm-central-lines": "pharmacological-parenteral--central-venous-access-devices",
    "pharm-dosage-calculation": "pharmacological-parenteral--dosage-calculations",
    "pharm-expected-actions": "pharmacological-parenteral--expected-actions-outcomes",
    "pharm-med-administration": "pharmacological-parenteral--medication-administration",
    "pharm-iv-therapy": "pharmacological-parenteral--parenteral-intravenous-therapies",
    "pharm-pain-management": "pharmacological-parenteral--pharmacological-pain-management",
    "pharm-tpn": "pharmacological-parenteral--total-parenteral-nutrition",
    "pharm-high-alert": "pharmacological-parenteral--medication-administration",
    "risk-vital-signs": "reduction-risk-potential--changes-abnormalities-in-vital-signs",
    "risk-diagnostic-tests": "reduction-risk-potential--diagnostic-tests",
    "risk-lab-values": "reduction-risk-potential--laboratory-values",
    "risk-body-system-alterations": "reduction-risk-potential--potential-for-alterations-in-body-systems",
    "risk-procedure-complications": "reduction-risk-potential--potential-for-complications-of-diagnostic-tests-treatments-procedures",
    "risk-system-assessments": "reduction-risk-potential--system-specific-assessments",
    "risk-therapeutic-procedures": "reduction-risk-potential--therapeutic-procedures",
    "phys-body-system-alterations": "physiological-adaptation--alterations-in-body-systems",
    "phys-fluid-electrolytes": "physiological-adaptation--fluid-and-electrolyte-imbalances",
    "phys-acid-base": null,
    "phys-hemodynamics": "physiological-adaptation--hemodynamics",
    "phys-illness-management": "physiological-adaptation--illness-management",
    "phys-medical-emergencies": "physiological-adaptation--medical-emergencies",
    "phys-pathophysiology": "physiological-adaptation--pathophysiology",
    "phys-unexpected-response": "physiological-adaptation--unexpected-response-to-therapies"
  },
  names: {
    "moc-advance-directives": "Advance directives & client rights",
    "moc-advocacy": "Advocacy",
    "moc-delegation": "Assignment, delegation & supervision",
    "moc-case-management": "Case management & continuity of care",
    "moc-confidentiality": "Client confidentiality / privacy",
    "moc-collaboration": "Collaboration with the interprofessional team",
    "moc-leadership": "Concepts of management & leadership",
    "moc-priorities": "Establishing priorities",
    "moc-ethics": "Ethical practice",
    "moc-informed-consent": "Informed consent",
    "moc-documentation": "Information technology & documentation",
    "moc-legal": "Legal rights & responsibilities",
    "moc-quality": "Performance improvement (quality)",
    "moc-referrals": "Referrals",
    "safety-injury-prevention": "Accident, error & injury prevention",
    "safety-emergency-triage": "Emergency response plan & triage",
    "safety-ergonomics": "Ergonomic principles & safe handling",
    "safety-hazardous-materials": "Handling hazardous & infectious materials",
    "safety-home": "Home safety",
    "safety-incident-reports": "Reporting incidents",
    "safety-equipment": "Safe use of equipment",
    "safety-security": "Security plan",
    "safety-precautions": "Standard & transmission-based precautions",
    "safety-surgical-asepsis": "Surgical asepsis",
    "safety-restraints": "Restraints & safety devices",
    "health-aging": "Aging process",
    "health-maternal-newborn": "Ante / intra / postpartum & newborn care",
    "health-developmental-stages": "Developmental stages & transitions",
    "health-growth-development": "Growth & development (paediatrics)",
    "health-prevention-immunizations": "Health promotion, disease prevention & immunizations",
    "health-screening": "Health screening",
    "health-high-risk-behaviours": "High-risk behaviours",
    "health-lifestyle": "Lifestyle choices",
    "health-self-care": "Self-care",
    "health-physical-assessment": "Physical assessment techniques",
    "psych-abuse-neglect": "Abuse / neglect",
    "psych-behavioural-interventions": "Behavioural interventions",
    "psych-substance-use": "Substance use disorders & withdrawal",
    "psych-coping": "Coping mechanisms",
    "psych-crisis": "Crisis intervention",
    "psych-culture-spirituality": "Cultural awareness & spirituality",
    "psych-end-of-life": "End-of-life & grief",
    "psych-family-dynamics": "Family dynamics",
    "psych-mental-health": "Mental health concepts",
    "psych-sensory-perceptual": "Sensory / perceptual alterations",
    "psych-stress": "Stress management",
    "psych-support-systems": "Support systems",
    "psych-therapeutic-communication": "Therapeutic communication",
    "psych-therapeutic-environment": "Therapeutic environment",
    "basic-assistive-devices": "Assistive devices",
    "basic-elimination": "Elimination",
    "basic-mobility": "Mobility / immobility",
    "basic-comfort": "Non-pharmacological comfort",
    "basic-nutrition": "Nutrition & oral hydration",
    "basic-hygiene": "Personal hygiene",
    "basic-rest-sleep": "Rest & sleep",
    "pharm-adverse-effects": "Adverse effects / contraindications / interactions",
    "pharm-blood-products": "Blood & blood products",
    "pharm-central-lines": "Central venous access devices",
    "pharm-dosage-calculation": "Dosage calculation",
    "pharm-expected-actions": "Expected actions / outcomes",
    "pharm-med-administration": "Medication administration",
    "pharm-iv-therapy": "Parenteral / IV therapies",
    "pharm-pain-management": "Pharmacological pain management",
    "pharm-tpn": "Total parenteral nutrition",
    "pharm-high-alert": "High-alert medications",
    "risk-vital-signs": "Changes in vital signs",
    "risk-diagnostic-tests": "Diagnostic tests",
    "risk-lab-values": "Laboratory values",
    "risk-body-system-alterations": "Potential for alterations in body systems",
    "risk-procedure-complications": "Complications of procedures / surgery",
    "risk-system-assessments": "System-specific assessments",
    "risk-therapeutic-procedures": "Therapeutic procedures",
    "phys-body-system-alterations": "Alterations in body systems",
    "phys-fluid-electrolytes": "Fluid & electrolyte imbalances",
    "phys-acid-base": "Acid–base / ABGs",
    "phys-hemodynamics": "Hemodynamics & dysrhythmias",
    "phys-illness-management": "Illness management",
    "phys-medical-emergencies": "Medical emergencies",
    "phys-pathophysiology": "Pathophysiology",
    "phys-unexpected-response": "Unexpected response to therapies"
  },
  qfallback: {
    "phys-acid-base": "physiological-adaptation--fluid-and-electrolyte-imbalances"
  }
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
  // v4 -> v5: study tools added. New fields get their defaults in loadState().
  if (x.v < 5) x.v = 5;
  // v5 -> v6: official 2026 syllabus. Old topic ids -> new ids (LEGACY_V5). Nothing is dropped:
  // whatever can't be matched is kept in x.unmapped.v6, and notes on unmatched topics become free notes.
  if (x.v < 6) {
    const L = LEGACY_V5, left = {};
    const keep = (kind, k, v) => { ((left[kind] = left[kind] || {})[k]) = v; };
    const obj = o => (o && typeof o === "object" && !Array.isArray(o) ? o : {});
    const when = (a, b) => ((a || "") > (b || "") ? a : b);
    const oldName = id => L.names[id] || id;

    // topic ratings: if two old topics became one, keep the LOWER rating (never overstate)
    const lv = {};
    Object.entries(obj(x.lv)).forEach(([k, v]) => {
      const to = L.topics[k];
      if (!to) return keep("lv", k, v);
      if (v) lv[to] = lv[to] ? Math.min(lv[to], v) : v;
    });
    x.lv = lv;

    // topic notes: joined if two old topics became one; notes on unmatched topics become free notes
    const groups = {}, free = Array.isArray(x.freeNotes) ? x.freeNotes : (x.freeNotes = []);
    Object.entries(obj(x.notes)).forEach(([k, n]) => {
      if (!n || !n.text) return;
      const to = L.topics[k];
      if (!to) {
        keep("notes", k, n);
        free.push({ id: "note-from-" + k, title: "From old topic: " + oldName(k), text: n.text, updated: n.updated || "" });
      } else (groups[to] = groups[to] || []).push([k, n]);
    });
    x.notes = {};
    Object.entries(groups).forEach(([to, g]) => {
      x.notes[to] = g.length === 1
        ? { text: g[0][1].text, updated: g[0][1].updated || "" }
        : { text: g.map(([k, n]) => "— from \"" + oldName(k) + "\" —\n" + n.text).join("\n\n"), updated: g.reduce((u, [, n]) => when(u, n.updated), "") };
    });

    // timer minutes per topic (unmatched ones are counted as general study)
    Object.entries(obj(x.study)).forEach(([day, per]) => {
      const out = {};
      Object.entries(obj(per)).forEach(([k, m]) => {
        const to = k === "general" ? "general" : L.topics[k];
        if (!to) keep("study", day + "/" + k, m);
        const key = to || "general";
        out[key] = (out[key] || 0) + m;
      });
      x.study[day] = out;
    });

    // mistakes: follow the question's topic (unmatched topics use the question fallback)
    Object.values(obj(x.mistakes)).forEach(m => { if (m && m.topic) m.topic = L.topics[m.topic] || L.qfallback[m.topic] || m.topic; });

    // today's task and a running timer
    if (x.task && x.task.topic) { const to = L.topics[x.task.topic]; x.task = to ? Object.assign({}, x.task, { topic: to }) : null; }
    if (x.timerRun && x.timerRun.topic && x.timerRun.topic !== "general") x.timerRun.topic = L.topics[x.timerRun.topic] || "general";

    // quiz stats per category, and the category of each past session
    const stat = {};
    Object.entries(obj(x.stat)).forEach(([k, v]) => { stat[L.cats[k] || k] = v; });
    x.stat = stat;
    (x.sessions || []).forEach(s => { if (s && L.cats[s.cid]) s.cid = L.cats[s.cid]; });

    x.points = obj(x.points);
    if (Object.keys(left).length) x.unmapped = Object.assign(obj(x.unmapped), { v6: left });
    x.v = 6;
  }
  // future: if (x.v < 7) { ...; x.v = 7; }
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
  const d = DEFAULTS();
  ["lv", "can", "plan", "stat", "days", "cards", "notes", "mistakes", "study", "badges", "timer", "fcNew", "points"].forEach(k => { if (!s[k] || typeof s[k] !== "object" || Array.isArray(s[k])) s[k] = d[k]; });
  ["sessions", "myCards", "freeNotes"].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
  return s;
}

let S = loadState();

let frozen = false; // set during restore/reset so nothing writes old data back before the reload
function persist() {
  if (frozen) return false;
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
