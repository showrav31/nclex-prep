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

const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const files = JSON.parse(sw.match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
files.filter(f => f !== "./").forEach(f => { if (!fs.existsSync(path.join(root, f))) errors.push(`sw.js caches missing file ${f}`); });

if (errors.length) { console.error("✘ " + errors.join("\n✘ ")); process.exit(1); }
console.log(`✔ data ok: ${counts.areas} areas, ${counts.categories} categories, ${counts.topics} topics, ${counts.learningPoints} learning points, ${counts.activityStatements} activity statements, ${counts.integratedProcesses} integrated processes, ${counts.clinicalJudgmentSteps} judgment steps; ${seen.size} unique ids; sw caches ${files.length} files`);
