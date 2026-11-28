// Content checks. Run: node tests/check-data.js
// Every item needs a unique, fixed text ID; questions must point to an existing topic;
// every file the service worker caches must exist.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const errors = [];
const ID = /^[a-z0-9]+(-{1,2}[a-z0-9]+)*$/; // the official syllabus ids use "--" between category, topic and point

const seen = new Set();
function id(kind, x) {
  if (!x || !ID.test(x)) errors.push(`${kind}: bad id "${x}" (use lowercase-words-with-dashes)`);
  else if (seen.has(x)) errors.push(`${kind}: duplicate id "${x}"`);
  seen.add(x);
}

// ---- official syllabus: data/syllabus.json must be an exact copy of source/nclex-2026-syllabus.json
const srcBytes = fs.readFileSync(path.join(root, "source/nclex-2026-syllabus.json")), dataBytes = fs.readFileSync(path.join(root, "data/syllabus.json"));
if (!srcBytes.equals(dataBytes)) errors.push("data/syllabus.json is not identical to source/nclex-2026-syllabus.json (never edit the source; copy it over)");
const syl = read("data/syllabus.json"), topics = new Set(), points = new Set();
const counts = { areas: syl.areas.length, categories: syl.categories.length, topics: 0, learningPoints: 0, activityStatements: 0, integratedProcesses: syl.integratedProcesses.length, clinicalJudgmentSteps: syl.clinicalJudgmentSteps.length };
const EXPECT = { areas: 4, categories: 8, topics: 82, learningPoints: 511, activityStatements: 149, integratedProcesses: 6, clinicalJudgmentSteps: 6 };
syl.areas.forEach(a => id("area", a.id));
syl.integratedProcesses.forEach(p => id("integrated process", p.id));
syl.clinicalJudgmentSteps.forEach(s => id("clinical judgment step", s.id));
syl.categories.forEach(c => {
  id("category", c.id);
  if (!syl.areas.some(a => a.id === c.areaId)) errors.push(`category ${c.id}: unknown area "${c.areaId}"`);
  if (!(c.weightMin <= c.weightMid && c.weightMid <= c.weightMax) || !c.weightRange) errors.push(`category ${c.id}: bad weights`);
  c.topics.forEach(t => {
    id("topic", t.id); topics.add(t.id); counts.topics++;
    if (!t.name) errors.push(`topic ${t.id}: no name`);
    if (!t.learningPoints.length) errors.push(`topic ${t.id}: no learning points`);
    t.learningPoints.forEach(p => { id("learning point", p.id); points.add(p.id); counts.learningPoints++; if (!p.text || typeof p.isActivityStatement !== "boolean") errors.push(`learning point ${p.id}: bad text/flag`); });
  });
  c.activityStatements.forEach(a => {
    id("activity statement", a.id); counts.activityStatements++;
    if (!a.text || !a.topicIds.length) errors.push(`activity statement ${a.id}: no text or no topics`);
    a.topicIds.forEach(t => { if (!c.topics.some(x => x.id === t)) errors.push(`activity statement ${a.id}: links to topic "${t}" which is not a topic of ${c.id}`); });
  });
});
Object.keys(EXPECT).forEach(k => { if (counts[k] !== EXPECT[k]) errors.push(`syllabus: expected ${EXPECT[k]} ${k}, found ${counts[k]}`); });
if (syl.categories.reduce((n, c) => n + c.weightMid, 0) !== 100) errors.push("syllabus: the category weightMid values should add up to 100");
const shortSrc = fs.readFileSync(path.join(root, "js/syllabus.js"), "utf8");
syl.categories.forEach(c => { if (!shortSrc.includes(`"${c.id}":`)) errors.push(`js/syllabus.js: CAT_SHORT has no label for category ${c.id}`); });

// ---- old -> new topic map (data/legacy-topic-map.json) and the frozen copy inside js/store.js
const lmap = read("data/legacy-topic-map.json");
Object.entries(lmap.topics).forEach(([o, m]) => {
  if (m.new !== null && !topics.has(m.new)) errors.push(`legacy map: ${o} -> unknown topic ${m.new}`);
  if (m.new === null && !topics.has(m.questionsGoTo)) errors.push(`legacy map: unmatched ${o} has no valid questionsGoTo`);
  (m.alsoCovers || []).forEach(a => { if (!topics.has(a.id)) errors.push(`legacy map: ${o} alsoCovers unknown topic ${a.id}`); });
});
Object.values(lmap.categories).forEach(c => { if (!syl.categories.some(x => x.id === c.new)) errors.push(`legacy map: unknown category ${c.new}`); });
{
  const vm = require("vm");
  const src = fs.readFileSync(path.join(root, "js/store.js"), "utf8");
  const L = vm.runInNewContext(src + "\n;LEGACY_V5", { localStorage: { getItem: () => null, setItem() {} } });
  const want = {
    cats: Object.fromEntries(Object.entries(lmap.categories).map(([k, v]) => [k, v.new])),
    topics: Object.fromEntries(Object.entries(lmap.topics).map(([k, v]) => [k, v.new])),
    names: Object.fromEntries(Object.entries(lmap.topics).map(([k, v]) => [k, v.oldName])),
    qfallback: Object.fromEntries(Object.entries(lmap.topics).filter(([, v]) => v.questionsGoTo).map(([k, v]) => [k, v.questionsGoTo]))
  };
  if (JSON.stringify(L) !== JSON.stringify(want)) errors.push("js/store.js LEGACY_V5 does not match data/legacy-topic-map.json (regenerate it)");
}
read("data/plan.json").phases.forEach(p => { id("phase", p.id); p.tasks.forEach(t => id("plan task", t.id)); });
read("data/canada.json").steps.forEach(s => id("canada step", s.id));
read("data/questions.json").questions.forEach(q => {
  id("question", q.id);
  if (!topics.has(q.topic)) errors.push(`question ${q.id}: unknown topic "${q.topic}"`);
  if (!["mcq", "sata", "matrix"].includes(q.type)) errors.push(`question ${q.id}: unknown type "${q.type}"`);
  if (q.type === "matrix" ? !(q.rows && q.cols) : !(q.options && q.answer && q.answer.every(a => a < q.options.length))) errors.push(`question ${q.id}: answer doesn't match options`);
  if (!q.rationale) errors.push(`question ${q.id}: no rationale`);
});
// flashcard items: their ids are the card ids
const ref = read("data/reference.json"), guide = read("data/exam-guide.json");
["labs", "drugs", "isolation", "highAlert", "vitals"].forEach(k => (ref[k] || (errors.push(`reference.json: missing ${k}`), [])).forEach(x => id("card " + k, x.id)));
guide.priority.forEach(x => id("card priority", x.id));
[...seen].filter(x => /^(my|note)-/.test(x)).forEach(x => errors.push(`id "${x}" uses a prefix reserved for her own cards/notes`));

// ---- question banks: data/questions/<categoryId>.json (new format, all question types)
const NGN_TYPES = new Set(["matrix", "dropdown", "highlight", "dragdrop", "bowtie", "trend"]);
const ALL_TYPES = new Set(["mcq", "sata", "numeric", ...NGN_TYPES]); // numeric (calculation) is not a Next Gen type
const calc = require("./calc");
const interpret = require("./interpret");
const refRanges = require("./reference-ranges"); // age-based ranges and growth / development facts
const cjIds = new Set(syl.clinicalJudgmentSteps.map(s => s.id)), ipIds = new Set(syl.integratedProcesses.map(p => p.id));
const topicCat = {}, pointTopic = {};
syl.categories.forEach(c => c.topics.forEach(t => { topicCat[t.id] = c.id; t.learningPoints.forEach(p => pointTopic[p.id] = t.id); }));
const nonEmpty = x => typeof x === "string" && x.trim().length > 0;
const isIdx = (n, len) => Number.isInteger(n) && n >= 0 && n < len;
const bankFiles = fs.existsSync(path.join(root, "data/questions")) ? fs.readdirSync(path.join(root, "data/questions")).filter(f => f.endsWith(".json")).sort() : [];
const stems = new Map(), needsReview = [];
let bankTotal = 0, numericCount = 0;

function checkTypeFields(q, E) {
  const opts = (arr, what) => Array.isArray(arr) && arr.length >= 2 && arr.every(nonEmpty) && new Set(arr).size === arr.length ? true : (E(`${what} must be 2+ different non-empty strings`), false);
  const rationales = (arr, n, what) => { if (!Array.isArray(arr) || arr.length !== n || !arr.every(r => nonEmpty(r) && r.length >= 15)) E(`${what} needs one real explanation per option`); };
  switch (q.type) {
    case "mcq":
      if (opts(q.options, "options") && q.options.length >= 3) { if (!isIdx(q.key, q.options.length)) E("key is not a valid option index"); rationales(q.optionRationales, q.options.length, "optionRationales"); }
      break;
    case "sata":
      if (opts(q.options, "options") && q.options.length >= 4) {
        if (!Array.isArray(q.key) || new Set(q.key).size !== q.key.length || q.key.length < 2 || q.key.length >= q.options.length || !q.key.every(k => isIdx(k, q.options.length))) E("key must be 2+ different option indexes, but not all options");
        rationales(q.optionRationales, q.options.length, "optionRationales");
      }
      break;
    case "matrix": case "trend":
      if (opts(q.cols, "cols") && Array.isArray(q.rows) && q.rows.length >= 3) q.rows.forEach((r, i) => { if (!nonEmpty(r.text) || !isIdx(r.key, q.cols.length) || !nonEmpty(r.why) || r.why.length < 15) E(`row ${i + 1}: needs text, a valid key column and a why`); });
      else E("rows must be 3 or more");
      if (q.type === "trend" && !(q.exhibit && Array.isArray(q.exhibit.rows) && q.exhibit.rows.length >= 2)) E("a trend question needs an exhibit table with data over time");
      break;
    case "dropdown": {
      if (!nonEmpty(q.template) || !Array.isArray(q.blanks) || !q.blanks.length) return E("needs a template and blanks");
      q.blanks.forEach((b, i) => {
        if ((q.template.match(new RegExp(`\\{${i + 1}\\}`, "g")) || []).length !== 1) E(`template must contain {${i + 1}} exactly once`);
        if (!opts(b.options, `blank ${i + 1} options`) || !isIdx(b.key, b.options.length)) E(`blank ${i + 1}: bad options or key`);
        if (!nonEmpty(b.why) || b.why.length < 15) E(`blank ${i + 1}: needs a why`);
      });
      if ((q.template.match(/\{\d+\}/g) || []).length !== q.blanks.length) E("template has a different number of {n} than blanks");
      break;
    }
    case "highlight": {
      const sel = Array.isArray(q.segments) ? q.segments.filter(s => s.key !== undefined) : [];
      if (!Array.isArray(q.segments) || !q.segments.every(s => typeof s.text === "string" && s.text.length > 0 && (s.key === undefined || nonEmpty(s.text)))) return E("segments need text (plain separators may be a space)");
      if (sel.length < 4 || !sel.some(s => s.key === true) || !sel.some(s => s.key === false) || !sel.every(s => typeof s.key === "boolean")) E("needs 4+ selectable segments with both key and non-key ones");
      sel.forEach((s, i) => { if (!nonEmpty(s.why) || s.why.length < 15) E(`selectable segment ${i + 1}: needs a why`); });
      break;
    }
    case "dragdrop":
      if (q.mode === "order") {
        if (!Array.isArray(q.items) || q.items.length < 3 || !q.items.every(i => nonEmpty(i.text) && nonEmpty(i.why))) return E("order items need text and why (3+)");
        const n = q.items.length;
        if (!Array.isArray(q.key) || q.key.length !== n || [...q.key].sort((a, b) => a - b).some((v, i) => v !== i)) E("key must list every item index once, in the correct order");
        else if (q.key.every((v, i) => v === i)) E("items are shown already in the correct order");
      } else if (q.mode === "sort") {
        if (!opts(q.bins, "bins") || !Array.isArray(q.items) || q.items.length < 3) return E("sort needs bins and 3+ items");
        q.items.forEach((it, i) => { if (!nonEmpty(it.text) || !isIdx(it.key, q.bins.length) || !nonEmpty(it.why)) E(`item ${i + 1}: needs text, a valid bin key and a why`); });
        q.bins.forEach((b, bi) => { if (!q.items.some(it => it.key === bi)) E(`bin "${b}" is never the answer`); });
      } else E(`unknown dragdrop mode "${q.mode}"`);
      break;
    case "numeric": {
      numericCount++;
      if (!nonEmpty(q.unit)) E("needs a unit");
      const r = q.rounding;
      if (!r || !Number.isInteger(r.decimals) || r.decimals < 0 || r.decimals > 3 || !nonEmpty(r.rule)) return E("rounding needs decimals (0 to 3) and a rule sentence");
      if (!q.stem.includes(r.rule)) E("the stem must contain the rounding rule sentence exactly, so the student sees it");
      if (typeof q.key !== "number" || !Number.isFinite(q.key)) return E("key must be a number");
      const c = q.calc;
      if (!c || !nonEmpty(c.formula) || !c.inputs || !Array.isArray(c.steps) || !c.steps.length || !nonEmpty(c.result)) return E("needs calc: formula, inputs, steps and result");
      if (!Object.values(c.inputs).every(v => typeof v === "number" && Number.isFinite(v))) E("calc.inputs must all be numbers");
      let run;
      try { run = calc.runCalc(c); } catch (e) { return E("calc cannot be computed: " + e.message); }
      c.steps.forEach((st, i) => {
        if (!nonEmpty(st.label) || !/^[A-Za-z_]\w*$/.test(st.name || "")) E(`calc step ${i + 1}: needs a name and a label`);
        const got = run.steps[i];
        if (typeof st.value !== "number" || Math.abs(st.value - got.value) > 1e-9 * Math.max(1, Math.abs(got.value))) E(`calc step "${st.name}": stored value ${st.value} but recomputed ${got.value}`);
        if (st.show !== got.show) E(`calc step "${st.name}": the working text "${st.show}" should be "${got.show}"`);
      });
      if (calc.onBoundary(run.exact, r.decimals)) E(`the exact answer ${run.exact} sits on a rounding boundary, so rounding is ambiguous`);
      const want = calc.roundTo(run.exact, r.decimals);
      if (Math.abs(want - q.key) > 1e-9) E(`KEY IS WRONG: the calculation gives ${run.exact}, which rounds to ${want}, but the key is ${q.key}`);
      if (!Array.isArray(q.commonErrors) || !q.commonErrors.length) E("needs at least one commonErrors entry (a typical wrong answer and why)");
      const seenVals = new Set();
      (q.commonErrors || []).forEach((e, i) => {
        let v; try { v = calc.evalExpr(e.expr, run.scope); } catch (err) { return E(`commonErrors ${i + 1}: ${err.message}`); }
        if (Math.abs(v - e.value) > 1e-6 * Math.max(1, Math.abs(v))) E(`commonErrors ${i + 1}: stored value ${e.value} but recomputed ${v}`);
        const rv = calc.roundTo(v, r.decimals);
        if (Math.abs(rv - q.key) < 1e-9) E(`commonErrors ${i + 1}: gives the same answer as the key`);
        if (seenVals.has(rv)) E(`commonErrors ${i + 1}: same answer as another common error`); seenVals.add(rv);
        if (!nonEmpty(e.why) || e.why.length < 15) E(`commonErrors ${i + 1}: needs a why`);
      });
      break;
    }
    case "bowtie":
      [["condition", 1], ["actions", 2], ["parameters", 2]].forEach(([part, n]) => {
        const p = q[part];
        if (!p || !nonEmpty(p.prompt) || !opts(p.options, `${part}.options`)) return E(`${part}: needs a prompt and options`);
        const keys = part === "condition" ? [p.key] : p.keys;
        if (!Array.isArray(keys) || keys.length !== n || new Set(keys).size !== n || !keys.every(k => isIdx(k, p.options.length))) E(`${part}: needs exactly ${n} valid key(s)`);
        if (p.options.length <= n + 1) E(`${part}: needs at least ${n + 2} options`);
        rationales(p.optionRationales, p.options.length, `${part}.optionRationales`);
      });
      break;
  }
}

// ---- unit pairs written in the text must agree: glucose mmol/L [mg/dL], temperature °C [°F], digoxin ng/mL [nmol/L], hemoglobin g/L [g/dL], potassium mmol/L [mEq/L]
function allText(x, out = []) { if (typeof x === "string") out.push(x); else if (Array.isArray(x)) x.forEach(v => allText(v, out)); else if (x && typeof x === "object") Object.values(x).forEach(v => allText(v, out)); return out; }
const NUM = "(\\d+(?:\\.\\d+)?)";
const UNIT_PAIRS = [
  { name: "glucose / calcium / magnesium mmol/L [mg/dL]", re: new RegExp(NUM + " mmol\\/L \\[" + NUM + " mg\\/dL\\]", "g"),
    ok: (a, b, before) => /calcium/i.test(before) ? Math.abs(a * 4.008 - b) <= 0.06 : /magnesium/i.test(before) ? Math.abs(a * 2.431 - b) <= 0.06 : /urea|BUN/i.test(before) ? Math.abs(a * 2.801 - b) <= 0.6 : Math.abs(a * 18 - b) <= 1 },
  { name: "temperature °C [°F]", re: new RegExp(NUM + " °C \\[" + NUM + " °F\\]", "g"), ok: (a, b) => Math.abs(a * 1.8 + 32 - b) <= 0.06 },
  { name: "digoxin ng/mL [nmol/L]", re: new RegExp(NUM + " ng\\/mL \\[" + NUM + " nmol\\/L\\]", "g"), ok: (a, b) => Math.abs(a * 1.281 - b) <= 0.06 },
  { name: "hemoglobin g/L [g/dL]", re: new RegExp(NUM + " g\\/L \\[" + NUM + " g\\/dL\\]", "g"), ok: (a, b) => Math.abs(a / 10 - b) <= 0.051 },
  { name: "potassium / sodium mmol/L [mEq/L]", re: new RegExp(NUM + " mmol\\/L \\[" + NUM + " mEq\\/L\\]", "g"), ok: (a, b) => a === b },
  { name: "pressure mmHg [kPa]", re: new RegExp(NUM + " mmHg \\[" + NUM + " kPa\\]", "g"), ok: (a, b) => Math.abs(a / 7.5 - b) <= 0.06 },
  { name: "creatinine µmol/L [mg/dL]", re: new RegExp(NUM + " µmol\\/L \\[" + NUM + " mg\\/dL\\]", "g"), ok: (a, b, before) => /bilirubin/i.test(before) ? Math.abs(a / 17.1 - b) <= 0.06 : Math.abs(a / 88.4 - b) <= 0.06 },
  { name: "HbA1c % [mmol/mol]", re: new RegExp(NUM + "% \\[" + NUM + " mmol\\/mol\\]", "g"), ok: (a, b) => Math.abs((a - 2.15) * 10.929 - b) <= 1 },
  { name: "weight kg [lb]", re: new RegExp(NUM + " kg \\[" + NUM + " lb\\]", "g"), ok: (a, b) => Math.abs(a * 2.205 - b) <= 0.6 },
  { name: "length cm [in]", re: new RegExp(NUM + " cm \\[" + NUM + " in\\]", "g"), ok: (a, b) => Math.abs(a / 2.54 - b) <= 0.6 }
];
let unitPairs = 0;
/* Compact table cells: a row labelled "PaCO₂, mmHg [kPa]" with a cell "78 [10.4]" means "78 mmHg [10.4 kPa]". */
function compactTexts(q) {
  const out = [], e = q.exhibit && Array.isArray(q.exhibit.rows) ? q.exhibit : null;
  if (!e) return out;
  e.rows.forEach(r => r.forEach((c, i) => {
    const lab = i === 0 ? null : /(\S+) \[([^\]\d][^\]]*)\]/.exec(r[0]), cell = lab && /^(-?\d+(?:\.\d+)?) \[(\d+(?:\.\d+)?)\]$/.exec(c);
    if (cell) out.push({ text: `${cell[1]} ${lab[1]} [${cell[2]} ${lab[2]}]`, ctx: r[0] });
    const one = i === 0 ? null : /\(([^\s,()]+)\)\s*$/.exec(r[0]); // label "HCO₃⁻ (mmol/L)" with a plain number cell "33" means "33 mmol/L"
    if (one && /^-?\d+(?:\.\d+)?$/.test(c)) out.push({ text: `${c} ${one[1]}`, ctx: r[0], single: true });
  }));
  return out;
}
function checkUnitPairs(q) {
  // table cells are checked with their row label as context ("Total calcium" | "1.90 mmol/L [7.6 mg/dL]")
  const e = q.exhibit && Array.isArray(q.exhibit.rows) ? q.exhibit : null;
  const entries = allText(e ? { ...q, exhibit: { ...q.exhibit, rows: undefined } } : q).map(t => [t, ""]);
  if (e) e.rows.forEach(r => r.forEach((c, i) => entries.push([c, i ? r[0] : ""])));
  compactTexts(q).filter(c => !c.single).forEach(c => {
    if (!UNIT_PAIRS.some(u => new RegExp(u.re.source).test(c.text))) errors.push(`question ${q.id}: "${c.text}" (from the table row "${c.ctx}") is not a known unit pair`);
    entries.push([c.text, c.ctx]);
  });
  entries.forEach(([t, ctx]) => UNIT_PAIRS.forEach(u => { for (const m of t.matchAll(u.re)) { unitPairs++; if (!u.ok(+m[1], +m[2], ctx + " " + t.slice(Math.max(0, m.index - 40), m.index))) errors.push(`question ${q.id}: ${u.name} pair "${m[0]}" does not match`); } }));
}

// ---- interpretation checks: ABGs, lab flags and ECG rhythms are verified by small lookups (tests/interpret.js)
const cjByOrder = Object.fromEntries(syl.clinicalJudgmentSteps.map(c => [c.order, c.id]));
const ecgOk = e => e && typeof e === "object" && !!interpret.RHYTHM_NAME[e.rhythm] && Number.isFinite(e.rate) && e.rate >= 0 && e.rate <= 300;
function refText(q, ref) { // the text of the keyed answer that a check points to
  let m;
  if (ref === "key") return q.options && q.options[q.key];
  if ((m = /^rows\.(\d+)$/.exec(ref))) { const r = q.rows && q.rows[+m[1]]; return r && q.cols[r.key]; }
  if ((m = /^blanks\.(\d+)$/.exec(ref))) { const b = q.blanks && q.blanks[+m[1]]; return b && b.options[b.key]; }
  if ((m = /^items\.(\d+)$/.exec(ref))) { const it = q.items && q.items[+m[1]]; return it && q.bins && q.bins[it.key]; }
  return undefined;
}
let interpretChecks = 0;
function checkChecks(q, E) {
  const checks = q.checks === undefined ? [] : q.checks;
  if (!Array.isArray(checks)) return E("checks must be a list");
  const text = allText({ ...q, checks: undefined }).concat(compactTexts(q).map(c => c.text)).join(" \n ");
  checks.forEach((c, i) => {
    interpretChecks++;
    const W = m => E(`checks[${i}] (${c.kind}): ${m}`);
    const ans = c.ref !== undefined ? refText(q, c.ref) : undefined;
    if (c.ref !== undefined && typeof ans !== "string") return W(`ref "${c.ref}" does not point to an answer`);
    const a = ans === undefined ? "" : ans.toLowerCase();
    if (c.kind === "abg") {
      if (![c.pH, c.paco2, c.hco3].every(Number.isFinite)) return W("needs pH, paco2 and hco3 numbers");
      const r = interpret.abgInterpret({ pH: c.pH, paco2: c.paco2, hco3: c.hco3 });
      if (r.invalid) return W(r.invalid);
      if (r.primary !== c.primary) W(`the lookup gives "${r.primary}" but the check says "${c.primary}"`);
      if (c.compensation !== undefined && r.compensation !== c.compensation) W(`the lookup gives "${r.compensation || "(none)"}" but the check says "${c.compensation}"`);
      [c.pH.toFixed(2), `${c.paco2} mmHg`, `${c.hco3} mmol/L`].forEach(t => { if (!text.includes(t)) W(`the question text does not show "${t}"`); });
      if (ans !== undefined) {
        if (!a.includes(r.primary)) W(`the keyed answer "${ans}" does not say "${r.primary}"`);
        if (/compensat/.test(a) && r.compensation && !a.includes(r.compensation)) W(`the keyed answer "${ans}" does not say "${r.compensation}"`);
      }
    } else if (c.kind === "lab") {
      const f = interpret.labFlag(c.name, c.value);
      if (f.invalid) return W(f.invalid);
      if (f.flag !== c.flag) W(`the lookup says ${c.name} ${c.value} is ${f.flag}, the check says ${c.flag}`);
      if (!text.includes(String(c.value))) W(`the question text does not show "${c.value}"`);
      if (ans !== undefined && !a.includes(c.flag)) W(`the keyed answer "${ans}" does not say "${c.flag}"`);
    } else if (c.kind === "vital") {
      const f = interpret.vitalFlag(c.name, c.value);
      if (f.invalid) return W(f.invalid);
      if (f.flag !== c.flag) W(`the lookup says ${c.name} ${c.value} is ${f.flag}, the check says ${c.flag}`);
      if (!text.includes(String(c.value))) W(`the question text does not show "${c.value}"`);
      if (ans !== undefined && !a.includes(c.flag)) W(`the keyed answer "${ans}" does not say "${c.flag}"`);
    } else if (c.kind === "gcs") {
      const g = interpret.gcs(c.e, c.v, c.m);
      if (g.invalid) return W(g.invalid);
      if (g.total !== c.total) W(`eye ${c.e} + verbal ${c.v} + motor ${c.m} = ${g.total}, but the check says ${c.total}`);
      if (c.severity !== undefined && g.severity !== c.severity) W(`a GCS of ${g.total} is ${g.severity}, but the check says ${c.severity}`);
      [`E${c.e}`, `V${c.v}`, `M${c.m}`].forEach(t => { if (!text.includes(t)) W(`the question text does not show "${t}"`); });
      if (ans !== undefined && !a.includes(c.what === "severity" ? g.severity : String(g.total))) W(`the keyed answer "${ans}" does not say "${c.what === "severity" ? g.severity : g.total}"`);
    } else if (c.kind === "ecg") {
      if (!interpret.RHYTHM_NAME[c.rhythm] || ans === undefined) return W("needs a known rhythm and a ref");
      if (!a.includes(interpret.RHYTHM_NAME[c.rhythm])) W(`the keyed answer "${ans}" does not name the rhythm shown on the strip ("${interpret.RHYTHM_NAME[c.rhythm]}")`);
    } else if (c.kind === "ecg-action") {
      const want = interpret.RHYTHM_ACTION[c.rhythm + ":" + c.context];
      if (!want || ans === undefined) return W("needs a known rhythm, a context (pulseless / symptomatic / stable) and a ref");
      if (!want.test(ans)) W(`for ${c.rhythm} (${c.context}) the keyed answer "${ans}" should match ${want}`);
    } else if (refRanges.KINDS.includes(c.kind)) {
      refRanges.verify(c, { text, ans, a }).forEach(W);
    } else W("unknown kind");
  });
  // A question that gives a child's vital signs, or a birth-weight milestone, must carry a check that ties it to tests/reference-ranges.js.
  const qText = allText({ ...q, checks: undefined, id: undefined, categoryId: undefined, topicId: undefined, secondaryTopicIds: undefined, learningPointIds: undefined }).join(" \n "); // question text only (the ids contain words such as "newborn")
  const childAge = /(\d+(?:\.\d+)?)[- ](day|week|month|year)s?[- ]old/gi;
  let isChild = /\b(newborn|infant|toddler|preschooler|school-age child|adolescent)\b/i.test(qText);
  for (const m of qText.matchAll(childAge)) { const n = +m[1], mo = /day/i.test(m[2]) ? 0 : /week/i.test(m[2]) ? 0 : /month/i.test(m[2]) ? n : n * 12; if (mo < 216) isChild = true; }
  if (isChild && /(heart rate|pulse|respiratory rate|respirations|blood pressure)[^.;]{0,50}?\d/i.test(qText) && !checks.some(c => c.kind === "peds-vital"))
    E("the question gives a child's vital signs, so it needs a peds-vital check (tests/reference-ranges.js)");
  if (/birth weight/i.test(qText) && /(doubl|tripl)/i.test(qText) && !checks.some(c => c.kind === "weight-milestone")) E("the question mentions doubling or tripling the birth weight, so it needs a weight-milestone check");
  const strips = [];
  if (q.exhibit && q.exhibit.ecg) strips.push({ rhythm: q.exhibit.ecg.rhythm, ref: null });
  (q.rows || []).forEach((r, i) => r.ecg && strips.push({ rhythm: r.ecg.rhythm, ref: `rows.${i}` }));
  (q.items || []).forEach((r, i) => r.ecg && strips.push({ rhythm: r.ecg.rhythm, ref: `items.${i}` }));
  strips.forEach(st => { if (!checks.some(c => (c.kind === "ecg" || c.kind === "ecg-action") && c.rhythm === st.rhythm && (st.ref === null || c.ref === st.ref))) E(`the ECG strip (${st.rhythm}${st.ref ? " at " + st.ref : ""}) has no ecg check tying it to the keyed answer`); });
}

bankFiles.forEach(f => {
  const file = read("data/questions/" + f), cat = syl.categories.find(c => c.id === file.categoryId);
  if (!cat || f !== file.categoryId + ".json") { errors.push(`data/questions/${f}: categoryId "${file.categoryId}" must be a real category and match the file name`); return; }
  const perTopic = {}, firstPoints = {};
  file.questions.forEach(q => {
    const E = msg => errors.push(`question ${q.id || "(no id)"}: ${msg}`);
    bankTotal++;
    checkUnitPairs(q);
    id("question", q.id);
    if (q.categoryId !== file.categoryId) E(`categoryId should be ${file.categoryId}`);
    if (topicCat[q.topicId] !== file.categoryId) E(`topicId "${q.topicId}" is not a topic of ${file.categoryId}`);
    if (!Array.isArray(q.secondaryTopicIds) || q.secondaryTopicIds.some(t => !topicCat[t] || t === q.topicId)) E("secondaryTopicIds must be real topics, different from topicId");
    const allowed = new Set([q.topicId, ...(q.secondaryTopicIds || [])]);
    if (!Array.isArray(q.learningPointIds) || !q.learningPointIds.length || new Set(q.learningPointIds).size !== q.learningPointIds.length) E("needs 1+ different learningPointIds");
    else q.learningPointIds.forEach(p => { if (!pointTopic[p]) E(`learning point "${p}" does not exist`); else if (!allowed.has(pointTopic[p])) E(`learning point "${p}" belongs to another topic`); });
    if (q.cjStep !== null && !cjIds.has(q.cjStep)) E(`cjStep "${q.cjStep}" is not null or a clinical judgment step`);
    if (!ipIds.has(q.integratedProcess)) E(`integratedProcess "${q.integratedProcess}" does not exist`);
    if (!ALL_TYPES.has(q.type)) E(`unknown type "${q.type}"`);
    if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) E("difficulty must be 1 to 5");
    if (!nonEmpty(q.stem) || q.stem.length < 20) E("needs a stem");
    if (!nonEmpty(q.rationale) || q.rationale.length < 30) E("needs a rationale");
    if (typeof q.needsReview !== "boolean") E("needsReview must be true or false");
    if (q.needsReview) {
      needsReview.push(q.id);
      if (!nonEmpty(q.reviewNote)) E("needsReview questions need a reviewNote saying what to check");
      if (q.reviewKind !== "clinical" && q.reviewKind !== "regional") E(`reviewKind must be "clinical" (real doubt about the clinical answer) or "regional" (provincial / regional practice may differ)`);
      if (q.reviewKind === "regional" && !/provinc|territor|Canad|U\.?S\.?\b|regional|jurisdiction/i.test(q.rationale || "")) E("regional questions must explain the difference in the rationale (mention provincial, Canadian or US practice)");
    } else if (q.reviewKind !== undefined || q.reviewNote !== undefined) E("reviewKind / reviewNote only belong on needsReview questions");
    if (q.exhibit) {
      const e = q.exhibit, table = Array.isArray(e.columns) && Array.isArray(e.rows) && e.rows.every(r => Array.isArray(r) && r.length === e.columns.length);
      if (!(nonEmpty(e.text) || table || e.ecg)) E("exhibit needs text, a table (columns and rows of the same width) or an ecg strip");
      if ((e.columns || e.rows) && !table) E("exhibit table: every row must be as wide as the columns");
      if (e.ecg !== undefined && !ecgOk(e.ecg)) E("exhibit.ecg needs a known rhythm and a rate from 0 to 300");
    }
    (q.rows || []).concat(q.items || []).forEach((r, i) => { if (r.ecg !== undefined && !ecgOk(r.ecg)) E(`row/item ${i + 1}: ecg needs a known rhythm and a rate from 0 to 300`); });
    if (q.caseStudy !== undefined) {
      const cs = q.caseStudy;
      if (!cs || !/^cs-[a-z0-9]+(-[a-z0-9]+)*$/.test(cs.id) || !Number.isInteger(cs.step) || cs.step < 1 || cs.step > 6) E(`caseStudy needs {id: "cs-…", step: 1 to 6}`);
      else if (q.cjStep !== cjByOrder[cs.step]) E(`caseStudy step ${cs.step} must use cjStep "${cjByOrder[cs.step]}"`);
    }
    checkChecks(q, E);
    const norm = String(q.stem).toLowerCase().replace(/\W+/g, " ").trim();
    if (stems.has(norm)) E(`same stem as ${stems.get(norm)}`); else stems.set(norm, q.id);
    if (ALL_TYPES.has(q.type)) checkTypeFields(q, E);
    perTopic[q.topicId] = (perTopic[q.topicId] || 0) + 1;
    (firstPoints[q.topicId] = firstPoints[q.topicId] || new Set()).add((q.learningPointIds || [])[0]);
  });
  // Per-topic quota: 4 by default. A bank file may carry "quotas": {topicId: n} (n may be 0) when the request asked for a different number for some topics.
  const quotas = file.quotas || {};
  Object.keys(quotas).forEach(k => {
    if (!cat.topics.some(t => t.id === k)) errors.push(`${f}: quotas names unknown topic ${k}`);
    else if (!Number.isInteger(quotas[k]) || quotas[k] < 0) errors.push(`${f}: quota for ${k} must be a whole number, 0 or more`);
  });
  cat.topics.forEach(t => {
    const quota = quotas[t.id] !== undefined ? quotas[t.id] : 4, have = perTopic[t.id] || 0;
    if (have < quota) errors.push(`${f}: topic ${t.id} has ${have} questions, needs ${quota}`);
    if (file.quotas && have > quota) errors.push(`${f}: topic ${t.id} has ${have} questions but its quota is ${quota}`);
    const want = file.minFirstPoints && file.minFirstPoints[t.id] !== undefined ? file.minFirstPoints[t.id] : Math.min(quota, t.learningPoints.length), got = (firstPoints[t.id] || new Set()).size;
    if (got < want) errors.push(`${f}: topic ${t.id} covers only ${got} different learning points (first learningPointId of each question), needs ${want}`);
  });
  const ngn = file.questions.filter(q => NGN_TYPES.has(q.type)).length;
  if (ngn / file.questions.length < 0.4) errors.push(`${f}: only ${ngn} of ${file.questions.length} questions are Next Gen types, needs at least 40%`);
  // the file must be loaded by the app and cached by the service worker
  if (!fs.readFileSync(path.join(root, "js/app.js"), "utf8").includes(`"questions/${file.categoryId}"`)) errors.push(`js/app.js QUESTION_FILES does not list questions/${file.categoryId}`);
  if (!fs.readFileSync(path.join(root, "sw.js"), "utf8").includes(`"data/questions/${f}"`)) errors.push(`sw.js FILES does not list data/questions/${f}`);
});

const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
files.filter(f => f !== "./").forEach(f => { if (!fs.existsSync(path.join(root, f))) errors.push(`sw.js caches missing file ${f}`); });

if (errors.length) { console.error("✘ " + errors.join("\n✘ ")); process.exit(1); }
console.log(`✔ data ok: ${counts.areas} areas, ${counts.categories} categories, ${counts.topics} topics, ${counts.learningPoints} learning points, ${counts.activityStatements} activity statements, ${counts.integratedProcesses} integrated processes, ${counts.clinicalJudgmentSteps} judgment steps; ${seen.size} unique ids; sw caches ${files.length} files; question banks: ${bankTotal} questions (${unitPairs} unit pairs, ${numericCount} calculations and ${interpretChecks} ABG / lab / ECG answers re-checked), ${needsReview.length} flagged needsReview`);
