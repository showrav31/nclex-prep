// Content checks. Run: node tests/check-data.js
// Every item needs a unique, fixed text ID; questions must point to an existing topic;
// every file the service worker caches must exist.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const errors = [];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const seen = new Set();
function id(kind, x) {
  if (!x || !ID.test(x)) errors.push(`${kind}: bad id "${x}" (use lowercase-words-with-dashes)`);
  else if (seen.has(x)) errors.push(`${kind}: duplicate id "${x}"`);
  seen.add(x);
}

const syl = read("data/syllabus.json"), topics = new Set();
syl.categories.forEach(c => { id("category", c.id); c.topics.forEach(t => { id("topic", t.id); topics.add(t.id); if (!t.name) errors.push(`topic ${t.id}: no name`); }); });
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
console.log(`✔ data ok: ${seen.size} ids, ${topics.size} topics, sw caches ${files.length} files`);
