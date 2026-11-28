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
const UNIT_PAIRS = [
  { name: "glucose mmol/L [mg/dL]", re: /(\d+(?:\.\d+)?) mmol\/L \[(\d+(?:\.\d+)?) mg\/dL\]/g, ok: (a, b) => Math.abs(a * 18 - b) <= 1 },
  { name: "temperature °C [°F]", re: /(\d+(?:\.\d+)?) °C \[(\d+(?:\.\d+)?) °F\]/g, ok: (a, b) => Math.abs(a * 1.8 + 32 - b) <= 0.06 },
  { name: "digoxin ng/mL [nmol/L]", re: /(\d+(?:\.\d+)?) ng\/mL \[(\d+(?:\.\d+)?) nmol\/L\]/g, ok: (a, b) => Math.abs(a * 1.281 - b) <= 0.06 },
  { name: "hemoglobin g/L [g/dL]", re: /(\d+(?:\.\d+)?) g\/L \[(\d+(?:\.\d+)?) g\/dL\]/g, ok: (a, b) => Math.abs(a / 10 - b) <= 0.051 },
  { name: "potassium mmol/L [mEq/L]", re: /(\d+(?:\.\d+)?) mmol\/L \[(\d+(?:\.\d+)?) mEq\/L\]/g, ok: (a, b) => a === b }
];
let unitPairs = 0;
function checkUnitPairs(q) {
  allText(q).forEach(t => UNIT_PAIRS.forEach(u => { for (const m of t.matchAll(u.re)) { unitPairs++; if (!u.ok(+m[1], +m[2])) errors.push(`question ${q.id}: ${u.name} pair "${m[0]}" does not match`); } }));
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
    if (q.exhibit && !(nonEmpty(q.exhibit.text) || (Array.isArray(q.exhibit.columns) && Array.isArray(q.exhibit.rows) && q.exhibit.rows.every(r => r.length === q.exhibit.columns.length)))) E("exhibit needs text, or columns and rows of the same width");
    const norm = String(q.stem).toLowerCase().replace(/\W+/g, " ").trim();
    if (stems.has(norm)) E(`same stem as ${stems.get(norm)}`); else stems.set(norm, q.id);
    if (ALL_TYPES.has(q.type)) checkTypeFields(q, E);
    perTopic[q.topicId] = (perTopic[q.topicId] || 0) + 1;
    (firstPoints[q.topicId] = firstPoints[q.topicId] || new Set()).add((q.learningPointIds || [])[0]);
  });
  cat.topics.forEach(t => {
    if ((perTopic[t.id] || 0) < 4) errors.push(`${f}: topic ${t.id} has ${perTopic[t.id] || 0} questions, needs at least 4`);
    const want = Math.min(4, t.learningPoints.length), got = (firstPoints[t.id] || new Set()).size;
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
console.log(`✔ data ok: ${counts.areas} areas, ${counts.categories} categories, ${counts.topics} topics, ${counts.learningPoints} learning points, ${counts.activityStatements} activity statements, ${counts.integratedProcesses} integrated processes, ${counts.clinicalJudgmentSteps} judgment steps; ${seen.size} unique ids; sw caches ${files.length} files; question banks: ${bankTotal} questions (${unitPairs} unit pairs and ${numericCount} calculations recomputed), ${needsReview.length} flagged needsReview`);
