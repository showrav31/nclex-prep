// Browser test at phone size. Run: node tests/browser-test.js [screenshotDir]
// Serves the repo under /nclex-prep/ (like GitHub Pages) and checks: no console errors,
// no sideways scroll at 360px, setup, Home, quiz, tabs, Back button, offline reload,
// and that progress saved by older versions migrates without loss.
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..");
const shots = process.argv[2];
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (!p.startsWith("/nclex-prep/")) { res.writeHead(404); return res.end(); }
  p = path.join(root, p.slice("/nclex-prep/".length) || "index.html");
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});

let failed = 0;
const check = (ok, msg) => { console.log((ok ? "✔ " : "✘ ") + msg); if (!ok) failed++; };

// Progress as saved by v1/v2 (single file, position keys, no version).
const V2 = { exam: "2028-06-15", lv: { "0-0": 3, "5-3": 1, "9-9": 2 }, can: { "0": true }, plan: { "0-0": true, "3-5": true }, stat: { "0": { n: 4, c: 3 } }, sessions: [{ d: "2026-11-20", q: 4, c: 3, cat: "MoC" }] };
// Progress as saved by v3 (split files, position keys).
const V3 = { ...V2, v: 3, name: "Test", minutes: 30, setup: true, days: { "2026-11-20": 1 }, task: { d: "2000-01-01", c: 5, tp: 3, why: "weak", done: false } };
// Progress as saved by v4 (fixed IDs, before the study tools).
const V4 = { v: 4, exam: "2028-07-01", name: "Four", minutes: 30, setup: true, lv: { "moc-advance-directives": 3, "pharm-dosage-calculation": 1 }, can: { "can-bnmc": true }, plan: { "plan-get-test-plan": true }, stat: { moc: { n: 4, c: 3 } }, sessions: [{ d: "2026-11-20", q: 4, c: 3, cat: "MoC", cid: "moc" }], days: { "2026-11-20": 1 }, task: null };
const LATEST = 6;
// Official syllabus ids used by the tests.
const T = {
  adv: "management-of-care--advance-directives-self-determination-life-planning", advocacy: "management-of-care--advocacy",
  delegation: "management-of-care--assignment-delegation-and-supervision",
  asepsis: "safety-infection-control--standard-precautions-transmission-based-precautions-surgical-asepsis",
  medAdmin: "pharmacological-parenteral--medication-administration", dose: "pharmacological-parenteral--dosage-calculations",
  dev: "health-promotion--developmental-stages-and-transitions", fluid: "physiological-adaptation--fluid-and-electrolyte-imbalances"
};
const BANK_FILES = ["management-of-care", "pharmacological-parenteral", "physiological-adaptation", "safety-infection-control", "reduction-risk-potential"]; // question banks in data/questions/
const BANK = BANK_FILES.flatMap(c => JSON.parse(fs.readFileSync(path.join(root, "data/questions/" + c + ".json"), "utf8")).questions);
// The first topic that has no questions in any bank yet (used to test the "no questions" messages; it changes as banks are added).
const HAS_Q = new Set([...JSON.parse(fs.readFileSync(path.join(root, "data/questions.json"), "utf8")).questions.map(q => q.topic), ...BANK.map(q => q.topicId)]);
const SYLL_ALL = JSON.parse(fs.readFileSync(path.join(root, "data/syllabus.json"), "utf8"));
const emptyCat = SYLL_ALL.categories.find(c => c.topics.some(t => !HAS_Q.has(t.id))), emptyTopic = emptyCat.topics.find(t => !HAS_Q.has(t.id));
// Answers one bank question correctly by tapping the screen (works for every question type).
async function tapRight(p, q) {
  if (q.type === "mcq") await p.click(`#quiz .opt >> nth=${q.key}`);
  else if (q.type === "sata") for (const k of q.key) await p.click(`#quiz .opt >> nth=${k}`);
  else if (q.type === "matrix" || q.type === "trend" || (q.type === "dragdrop" && q.mode === "sort")) { const rows = q.rows || q.items; for (let ri = 0; ri < rows.length; ri++) await p.click(`#quiz input[name=m${ri}] >> nth=${rows[ri].key}`); }
  else if (q.type === "dropdown") for (let bi = 0; bi < q.blanks.length; bi++) await p.click(`#quiz .bowpart >> nth=${bi} >> .opt >> nth=${q.blanks[bi].key}`);
  else if (q.type === "highlight") { const idx = q.segments.map((s, i) => s.key !== undefined ? i : -1).filter(i => i >= 0); for (const i of q.segments.map((s, i) => s.key === true ? i : -1).filter(i => i >= 0)) await p.click(`#quiz .hlw >> nth=${idx.indexOf(i)}`); }
  else if (q.type === "numeric") await p.fill("#numIn", String(q.key));
  else if (q.type === "dragdrop") for (const ii of q.key) await p.getByText(q.items[ii].text, { exact: true }).click();
  else if (q.type === "bowtie") { for (const k of q.actions.keys) await p.click(`#quiz .bowpart >> nth=0 >> .opt >> nth=${k}`); await p.click(`#quiz .bowpart >> nth=1 >> .opt >> nth=${q.condition.key}`); for (const k of q.parameters.keys) await p.click(`#quiz .bowpart >> nth=2 >> .opt >> nth=${k}`); }
}

const ACTS_FOR = (cat, id) => cat.activityStatements.filter(a => a.topicIds.includes(id)).length;
// Progress as saved by v5 (study tools, but still the OLD topic ids). Rich on purpose: merged and unmatched topics.
const V5 = {
  v: 5, setup: true, name: "Five", exam: "2028-07-01", minutes: 30,
  lv: { "safety-precautions": 3, "safety-surgical-asepsis": 1, "moc-advance-directives": 3, "pharm-high-alert": 2, "pharm-med-administration": 3, "phys-acid-base": 1, "health-growth-development": 3, "health-developmental-stages": 2 },
  notes: {
    "moc-delegation": { text: "UCP = routine, stable.", updated: "2026-11-20T10:00:00.000Z" },
    "safety-precautions": { text: "Airborne = N95", updated: "2026-11-20T11:00:00.000Z" },
    "safety-surgical-asepsis": { text: "Sterile field rules", updated: "2026-11-21T11:00:00.000Z" },
    "phys-acid-base": { text: "ROME", updated: "2026-11-22T11:00:00.000Z" }
  },
  freeNotes: [{ id: "note-1", title: "My own", text: "keep me", updated: "2026-11-20T00:00:00.000Z" }],
  mistakes: {
    "q-phys-abg-resp-acidosis": { topic: "phys-acid-base", stem: "ABG question", rationale: "why", first: "2026-11-20", last: "2026-11-20", n: 1, why: "misread", fixed: false },
    "q-pharm-digoxin-hold": { topic: "pharm-high-alert", stem: "Digoxin question", rationale: "why", first: "2026-11-20", last: "2026-11-20", n: 2, why: "", fixed: false }
  },
  study: { "2026-11-20": { "pharm-dosage-calculation": 25, "phys-acid-base": 10, general: 5 } },
  stat: { moc: { n: 4, c: 3 }, pharm: { n: 2, c: 1 } },
  sessions: [{ d: "2026-11-20", q: 4, c: 3, cat: "MoC", cid: "moc" }, { d: "2026-11-21", q: 2, c: 1, cat: "Pharm", cid: "pharm" }],
  task: { d: "2000-01-01", topic: "moc-delegation", why: "weak", done: false },
  timerRun: { mode: "work", end: null, left: 600000, topic: "phys-acid-base", work: 25 },
  cards: { "lab-sodium": { due: "2026-12-01", ivl: 3, ease: 2.5, reps: 2, lapses: 0 } }, myCards: [{ id: "my-1", front: "f", back: "b", created: "2026-11-20" }], fcReviews: 5,
  badges: { "first-question": "2026-11-20" }, days: { "2026-11-20": 1 }, can: { "can-bnmc": true }, plan: { "plan-get-test-plan": true }
};

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const U = `http://127.0.0.1:${server.address().port}/nclex-prep/`;
  const b = await chromium.launch();

  async function page(seed) {
    const ctx = await b.newContext({ viewport: { width: 360, height: 740 } });
    const p = await ctx.newPage();
    p.errs = [];
    p.on("pageerror", e => p.errs.push(e.message));
    p.on("console", m => m.type() === "error" && p.errs.push(m.text()));
    p.on("response", r => r.status() >= 400 && p.errs.push(`${r.status()} ${r.url()}`));
    await p.goto(U);
    if (seed) { await p.evaluate(s => localStorage.setItem("nclexDash2", JSON.stringify(s)), seed); await p.reload(); }
    await p.waitForSelector("#setup:not([hidden]), #app:not([hidden])");
    return { ctx, p };
  }
  const state = p => p.evaluate(() => JSON.parse(localStorage.getItem("nclexDash2")));
  const noSideScroll = async p => (await p.evaluate(() => document.documentElement.scrollWidth)) <= 360;

  // A. New user
  {
    const { ctx, p } = await page();
    check(await p.isVisible("#setup"), "new user sees setup");
    await p.click("#setNext");
    check(await p.isVisible('[data-step="0"]'), "setup needs a name");
    await p.fill("#setName", "Nusrat"); await p.click("#setNext"); await p.click("#setNext");
    await p.click('#setMinutes button:has-text("30 min")'); await p.click("#setNext");
    await p.waitForSelector("#home.on");
    check((await p.textContent("#helloName")).includes("Nusrat"), "Home greets by name");
    check(/^\d+$/.test(await p.textContent("#hDays")), "exam countdown shown");
    if (shots) await p.screenshot({ path: shots + "/home.png" });
    await p.click('#hTask .btn:has-text("Start practice")');
    await p.waitForSelector("#practice.on #quiz:not([hidden])");
    const n = await p.evaluate(() => QZ.list.length);
    for (let i = 0; i < n; i++) {
      const curId = await p.evaluate(() => QZ.list[QZ.i].id), bankQ = BANK.find(x => x.id === curId);
      if (bankQ && !["mcq", "matrix"].includes(bankQ.type)) await tapRight(p, bankQ);
      else if (await p.evaluate(() => QZ.list[QZ.i].type) === "matrix") {
        const r = await p.evaluate(() => QZ.list[QZ.i].rows.length);
        for (let k = 0; k < r; k++) await p.click(`input[name=m${k}] >> nth=0`);
      } else await p.click("#quiz .opt >> nth=0");
      await p.click('#quiz button:has-text("Submit")');
      await p.click('#quiz button:has-text("Next question"), #quiz button:has-text("See results")');
    }
    check(await p.isVisible("text=Today's task is done"), "finishing the task quiz completes today's task");
    const mk = (await state(p)).mistakes, mkIds = Object.keys(mk);
    check(mkIds.length > 0 && mkIds.every(id => mk[id].rationale && mk[id].stem && mk[id].n >= 1), "wrong answers saved to My mistakes with rationale");
    await p.goto(U + "#practice/mistakes");
    await p.waitForSelector("#mistakes.on .why");
    const firstMk = await p.getAttribute("#mkList .why", "data-why");
    await p.click("#mkList .why .chip >> nth=1");
    check((await state(p)).mistakes[firstMk].why === "misread", "can mark why a question was missed");
    await p.click("#mkRetry");
    await p.waitForSelector("#drill.on #quiz .stem");
    check(await p.evaluate(() => QZ.mode === "retry" && QZ.list.every(q => q.id in S.mistakes)), "Retry my mistakes quiz uses saved mistakes");
    await p.click("#tabbar [data-go=home]");
    const s = await state(p);
    check(s.v === LATEST && Object.keys(s.lv).every(k => /^[a-z]/.test(k)) && Object.keys(s.stat).every(k => /^[a-z]/.test(k)), "progress saved by ID");
    await p.click("#tabbar [data-go=home]");
    check(await p.textContent("#hStreak") === "1", "streak is 1 after studying");
    for (const t of ["learn", "practice", "progress", "more", "home"]) {
      await p.click(`#tabbar [data-go=${t}]`);
      check(await p.isVisible(`#${t}.on`) && await noSideScroll(p), `${t} tab opens, no sideways scroll at 360px`);
      if (shots) await p.screenshot({ path: `${shots}/${t}.png` });
    }
    await p.click("#tabbar [data-go=learn]"); await p.click("#learnTabs [data-sub=ngn]");
    check(await noSideScroll(p), "exam guide: no sideways scroll");
    await p.goBack();
    check(await p.evaluate(() => location.hash) === "#learn", "Back button returns to previous tab");
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); await ctx.setOffline(true); await p.reload();
    check(await p.waitForSelector(".screen.on", { timeout: 5000 }).then(() => true, () => false), "loads offline");
    check(p.errs.length === 0, "no console errors" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
    await ctx.close();
  }

  // B. Progress from v1/v2
  {
    const { ctx, p } = await page(V2);
    const s = await p.evaluate(() => S); // in memory: nothing is saved until setup is finished
    check(await p.isVisible("#setup"), "v2 user sees setup once");
    check(await p.inputValue("#setExam") === "2028-06-15", "v2 exam date kept");
    check(s.lv[T.adv] === 3 && s.lv[T.dose] === 1, "v2 topic ratings moved to the official topic IDs");
    check(s.plan["plan-get-test-plan"] && s.plan["plan-sit-nclex"] && s.can["can-bnmc"], "v2 plan + Canada ticks moved to IDs");
    check(s.stat["management-of-care"] && s.stat["management-of-care"].n === 4 && s.sessions.length === 1 && s.sessions[0].cid === "management-of-care", "v2 quiz stats + sessions kept (new category ids)");
    check(s.unmapped && s.unmapped.lv["9-9"] === 2, "unknown old keys kept, not dropped");
    check(JSON.parse(await p.evaluate(() => localStorage.getItem("nclexDash2_backup_v2"))).lv["0-0"] === 3, "v2 backup copy kept");
    check(p.errs.length === 0, "no console errors (v2)");
    await ctx.close();
  }

  // C. Progress from v3
  {
    const { ctx, p } = await page(V3);
    await p.waitForSelector("#home.on");
    const s = await state(p);
    check(s.v === LATEST && s.name === "Test" && s.lv[T.dose] === 1, "v3 progress moved to the official topic IDs, setup skipped");
    check(await p.textContent("#hTask .topicname") === "Dosage Calculations", "today's task picks the Weak topic");
    await p.click("#tabbar [data-go=learn]");
    check((await p.textContent("#p-management-of-care")).startsWith("1/16 confident"), "syllabus shows migrated rating");
    await p.click("#tabbar [data-go=progress]");
    check((await p.textContent("#ph-phase-foundation .pill")) === "1/9", "study plan shows migrated tick");
    check(!!(await p.evaluate(() => localStorage.getItem("nclexDash2_backup_v3"))), "v3 backup copy kept");
    await p.reload(); await p.waitForSelector(".screen.on");
    check(JSON.stringify(await state(p)) === JSON.stringify(s), "reload keeps progress unchanged");
    check(p.errs.length === 0, "no console errors (v3)");
    await ctx.close();
  }

  // D. Study tools (seeded with v4 progress)
  {
    const { ctx, p } = await page(V4);
    p.on("dialog", d => d.type() === "prompt" ? d.accept("RESET") : d.accept());
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(U).origin });
    await p.waitForSelector("#home.on");
    let s = await state(p);
    check(s.v === LATEST && s.lv[T.adv] === 3 && !!s.cards && !!s.notes && !!(await p.evaluate(() => localStorage.getItem("nclexDash2_backup_v4"))), "v4 progress kept, new fields added, v4 backup kept");
    check(+(await p.textContent("#hDue")) === 10, "Home shows cards due today (10 new a day)");

    // flashcards
    await p.click(".tile >> nth=0");
    await p.waitForSelector("#cards.on");
    await p.click('#fcStudy button:has-text("Study all due")');
    await p.click('#fcStudy button:has-text("Show answer")');
    await p.click("#fcStudy .grades .g3");
    s = await state(p);
    const graded = Object.entries(s.cards), today = await p.evaluate(() => dayKey());
    check(graded.length === 1 && graded[0][1].due > today && s.fcReviews === 1, "grading Good schedules the card for a later day");
    await p.click('#fcStudy button:has-text("Show answer")');
    await p.click("#fcStudy .grades .g1");
    check(await p.evaluate(() => FC.queue.length === 11), "Again shows the card again this session");
    await p.fill("#fcFront", "Normal urine output (adult)?"); await p.fill("#fcBack", "At least 30 mL/h");
    await p.click('button:has-text("Add card")');
    s = await state(p);
    check(s.myCards.length === 1 && s.myCards[0].id.startsWith("my-") && (await p.textContent("#fcDecks")).includes("My cards"), "can add own card");
    check(await noSideScroll(p), "cards: no sideways scroll");

    // topic note; Android Back closes the sheet
    await p.goto(U + "#learn/syllabus");
    await p.click("#c-management-of-care .head");
    await p.click('#c-management-of-care .tname:has-text("Advance Directives")');
    await p.fill("#noteText", "Competent adult's wishes come first.");
    await p.goBack();
    await p.waitForSelector("#sheet", { state: "hidden" });
    s = await state(p);
    check(!!s.notes[T.adv] && s.notes[T.adv].text.includes("wishes"), "topic note saved; Back closes the note");
    check(await p.isVisible("#learn.on"), "Back from a note stays on the same screen");
    // free note + search
    await p.click("#learnTabs [data-sub=notes]");
    await p.click('button:has-text("New note")');
    await p.fill("#fnTitle", "Mnemonics"); await p.fill("#fnText", "MUDPILES for anion gap");
    await p.click('#sheet button:has-text("Done")');
    await p.waitForSelector("#sheet", { state: "hidden" });
    await p.fill("#noteSearch", "mudpiles");
    check((await p.$$("#noteList .item")).length === 1 && (await p.textContent("#noteList")).includes("Mnemonics"), "free note saved and found by search");
    check(await noSideScroll(p), "notes: no sideways scroll");

    // timer
    await p.evaluate(t => openTimer(t), T.dose);
    await p.click('#tBtns button:has-text("Start")');
    check(await p.isVisible("#timebar"), "timer bar shows while timing");
    await p.evaluate(() => { S.timerRun.end = Date.now() - 1000; });
    await p.waitForFunction(() => S.timerRun && S.timerRun.mode === "break", null, { timeout: 4000 });
    check(await p.evaluate(t => S.study[dayKey()][t] === 25, T.dose), "finished timer logs 25 min to the topic");
    await p.click('#tBtns button:has-text("Skip break")');
    await p.click('#sheet button:has-text("Done")');
    await p.goto(U + "#progress");
    check((await p.textContent("#wkTopics")).includes("Dosage Calculations"), "weekly chart lists study time by topic");
    check(!!(await p.evaluate(() => S.badges["first-note"])) && (await p.$$("#badgeGrid .badge:not(.locked)")).length >= 1, "badges earned and shown");
    check(await noSideScroll(p), "progress: no sideways scroll");

    // settings
    await p.goto(U + "#more");
    await p.click('#optTheme button:has-text("Dark")');
    await p.click('#optText button:has-text("Large")');
    check(await p.evaluate(() => document.documentElement.dataset.theme === "dark" && document.documentElement.style.fontSize === "112%"), "dark mode and text size apply");
    check(await noSideScroll(p), "large text: no sideways scroll");
    if (shots) { await p.goto(U + "#home"); await p.screenshot({ path: shots + "/home-dark.png" }); await p.goto(U + "#more"); }
    await p.click('button:has-text("Copy backup")');
    const copied = JSON.parse(await p.evaluate(() => navigator.clipboard.readText()));
    check(copied.app === "nclex-prep" && !!copied.data.notes[T.adv] && copied.data.myCards.length === 1 && !!copied.data.cards && !!copied.data.study, "Copy backup includes notes, cards, timer and progress");
    copied.data.name = "Restored";
    await p.fill("#importText", JSON.stringify(copied));
    await Promise.all([p.waitForEvent("load"), p.click('button:has-text("Restore backup")')]);
    await p.waitForSelector("#home.on");
    check((await state(p)).name === "Restored" && !!(await p.evaluate(() => localStorage.getItem("nclexDash2_before_import"))), "restore replaces progress and keeps a safety copy");
    await p.goto(U + "#more");
    await p.fill("#importText", JSON.stringify(V2));
    await Promise.all([p.waitForEvent("load"), p.click('button:has-text("Restore backup")')]);
    await p.waitForSelector("#setup:not([hidden]), #app:not([hidden])");
    check(await p.evaluate(t => S.lv[t] === 3 && S.v === 6, T.adv), "restoring an old-version backup migrates it");
    await p.evaluate(() => { S.setup = true; persist(); });
    await p.goto(U + "#more"); await p.reload(); await p.waitForSelector("#more.on");
    await Promise.all([p.waitForEvent("load"), p.click('button:has-text("Reset all progress")')]);
    await p.waitForSelector("#setup:not([hidden])");
    check(!!(await p.evaluate(() => localStorage.getItem("nclexDash2_before_reset"))), "reset starts over and keeps a safety copy");
    check(p.errs.length === 0, "no console errors (study tools)" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
    await ctx.close();
  }

  // E. Migration from v5 (old topic ids) to the official syllabus ids
  {
    const { ctx, p } = await page(V5);
    await p.waitForSelector("#home.on");
    check(!!(await p.evaluate(() => localStorage.getItem("nclexDash2_backup_v5"))) && JSON.parse(await p.evaluate(() => localStorage.getItem("nclexDash2_backup_v5"))).lv["safety-precautions"] === 3, "v5 safety backup kept (untouched old data)");
    // the migration itself, on a copy (the app has already moved on and replaced today's task)
    const m = await p.evaluate(seed => migrate(JSON.parse(JSON.stringify(seed)), JSON.stringify(seed)), V5);
    check(m.v === LATEST, "migrated to schema v" + LATEST);
    check(m.lv[T.adv] === 3 && m.lv[T.asepsis] === 1 && m.lv[T.medAdmin] === 2 && m.lv[T.dev] === 2, "ratings moved; where two old topics became one, the lower rating wins");
    check(!("phys-acid-base" in m.lv) && m.unmapped.v6.lv["phys-acid-base"] === 1, "rating of the unmatched topic is kept in unmapped, not lost");
    check(m.notes[T.delegation].text === "UCP = routine, stable.", "a note on a matched topic moved as it was");
    check(m.notes[T.asepsis].text.includes("Airborne = N95") && m.notes[T.asepsis].text.includes("Sterile field rules") && m.notes[T.asepsis].updated.startsWith("2026-11-21"), "notes from two old topics are joined, nothing lost");
    check(m.freeNotes.length === 2 && m.freeNotes.some(n => n.id === "note-1") && m.freeNotes.some(n => n.title === "From old topic: Acid–base / ABGs" && n.text === "ROME"), "note on the unmatched topic became a free note; her own free note kept");
    check(m.mistakes["q-phys-abg-resp-acidosis"].topic === T.fluid && m.mistakes["q-pharm-digoxin-hold"].topic === T.medAdmin && m.mistakes["q-phys-abg-resp-acidosis"].why === "misread", "mistakes point to new topics, their 'why' kept");
    check(m.study["2026-11-20"][T.dose] === 25 && m.study["2026-11-20"].general === 15 && m.unmapped.v6.study["2026-11-20/phys-acid-base"] === 10, "timer minutes follow the topic; unmatched minutes count as general study (original kept)");
    check(m.stat["management-of-care"].n === 4 && m.stat["pharmacological-parenteral"].c === 1 && !m.stat.moc, "quiz stats moved to the new category ids");
    check(m.sessions[0].cid === "management-of-care" && m.sessions[1].cid === "pharmacological-parenteral" && m.sessions[0].cat === "MoC", "session history keeps its label and gets the new category id");
    check(m.task.topic === T.delegation && m.timerRun.topic === "general", "today's task and a paused timer follow the new ids");
    check(!!m.cards["lab-sodium"] && m.myCards.length === 1 && m.fcReviews === 5 && m.badges["first-question"] && m.plan["plan-get-test-plan"] && m.can["can-bnmc"] && m.days["2026-11-20"] === 1, "flashcards, own cards, badges, plan, Canada ticks, streak days untouched");
    check(JSON.stringify(await p.evaluate(s => migrate(JSON.parse(JSON.stringify(s)), null), m)) === JSON.stringify(m), "migrating again changes nothing");

    // what she sees
    await p.goto(U + "#learn/syllabus"); await p.waitForSelector("#syllabus.on #cats .card");
    const txt = id => p.textContent("#" + id);
    check((await txt("p-management-of-care")).startsWith("1/16 confident"), "syllabus shows the migrated rating");
    check((await txt("p-safety-infection-control")).includes("1 weak"), "merged topic shows as Weak (the lower rating)");
    await p.goto(U + "#practice/mistakes"); await p.waitForSelector("#mistakes.on .item");
    check((await txt("mkList")).includes("Fluid and Electrolyte Imbalances") && (await txt("mkList")).includes("Medication Administration"), "My mistakes shows the new topic names");
    await p.goto(U + "#learn/notes"); await p.waitForSelector("#notes.on");
    await p.fill("#noteSearch", "rome");
    check((await txt("noteList")).includes("From old topic"), "the note from the unmatched topic can be found in Notes");
    check((await p.evaluate(() => Q.length)) === 34 + BANK.length && (await p.evaluate(() => Q.every(q => TOPIC[q.topic]))), `all ${34 + BANK.length} questions (34 older + ${BANK.length} new) are in the bank and point to real topics`);
    check(p.errs.length === 0, "no console errors (v5)" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
    await ctx.close();
  }

  // F. The new syllabus screen
  {
    const SYLL = JSON.parse(fs.readFileSync(path.join(root, "data/syllabus.json"), "utf8"));
    const moc = SYLL.categories[0], adv = moc.topics[0], advocacy = moc.topics.find(t => t.id === T.advocacy);
    const basic = SYLL.categories.find(c => c.id === "basic-care-comfort");
    const seed = { v: LATEST, setup: true, name: "Six", exam: "2028-07-01", lv: {} };
    moc.topics.forEach(t => seed.lv[t.id] = 3);
    seed.lv[basic.topics[0].id] = 3;
    const { ctx, p } = await page(seed);
    await p.waitForSelector("#home.on");
    // expected overall progress, worked out here from the file (not by the app): sum(weightMid x share Confident) / sum(weightMid)
    const wSum = SYLL.categories.reduce((n, c) => n + c.weightMid, 0);
    const wDone = SYLL.categories.reduce((n, c) => n + c.weightMid * c.topics.filter(t => seed.lv[t.id] === 3).length / c.topics.length, 0);
    const expect = Math.round(wDone / wSum * 100) + "%";
    check(expect === "19%", "expected weighted progress is 19% (self-check of the test)");
    check((await p.textContent("#sSyl")) === expect, `Home: syllabus progress is weighted by weightMid (${expect}, not the plain topic count)`);
    await p.goto(U + "#learn/syllabus"); await p.waitForSelector("#syllabus.on #cats .card");
    check((await p.textContent("#synTop")).includes(expect), "Syllabus screen shows the same weighted progress");
    check((await p.$$("#cats .group")).length === 4 && (await p.$$("#cats > .card")).length === 8, "4 areas and 8 categories shown");
    check((await p.textContent("#c-management-of-care .pill")).includes("15–21%"), "category shows its weight range");
    await p.click("#c-management-of-care .head");
    check((await p.$$("#c-management-of-care .topic")).length === 16, "category opens to its 16 topics");
    check(await noSideScroll(p), "syllabus: no sideways scroll");

    // topic page
    await p.click(`#c-management-of-care .tname:has-text("Advance Directives")`);
    await p.waitForSelector("#sheet:not([hidden]) #tpPoints");
    check((await p.$$("#tpPoints .check")).length === adv.learningPoints.length, `topic page lists all ${adv.learningPoints.length} learning points as a checklist`);
    const acts = moc.activityStatements.filter(a => a.topicIds.includes(adv.id));
    check((await p.$$("#sheetBody .acts li")).length === acts.length && acts.length > 0, `topic page lists the ${acts.length} linked activity statements`);
    check((await p.textContent("#sheetBody")).includes(acts[0].text), "activity statement text is shown");
    await p.click("#tpPoints .check >> nth=0");
    await p.click("#tpPoints .check >> nth=1");
    check(Object.keys((await state(p)).points).length === 2 && (await p.textContent("#tpCount")).startsWith("2/"), "ticking learning points is saved by point id");
    await p.click('#tpLvl button:has-text("OK")');
    check((await state(p)).lv[adv.id] === 2, "rating can be changed on the topic page");
    await p.fill("#noteText", "Living will + health care proxy.");
    check(await noSideScroll(p), "topic page: no sideways scroll");
    await p.goBack();
    await p.waitForSelector("#sheet", { state: "hidden" });
    check((await state(p)).notes[adv.id].text.startsWith("Living will"), "topic note saved when the page closes");
    check((await p.textContent(`#c-management-of-care .tname:has-text("Advance Directives")`)).includes("2/3 points") && (await p.textContent("#p-management-of-care")).includes("2/"), "rows and category show points ticked");
    // practise this topic
    await p.click(`#c-management-of-care .tname:has-text("Advance Directives")`);
    await p.click('#sheetBody button:has-text("Practise this topic")');
    await p.waitForSelector("#drill.on #quiz .stem");
    check(await p.evaluate(t => QZ.topic === t && QZ.list.length === Q.filter(q => q.topic === t).length && QZ.list.every(q => q.topic === t), adv.id), "Practise this topic runs only that topic's questions");
    check(await p.evaluate(() => !document.getElementById("sheet").offsetParent) && await p.evaluate(() => location.hash) === "#practice/drill", "the topic page closed and the quiz opened");
    // a topic with no questions
    await p.goto(U + "#learn/syllabus");
    if (!(await p.isVisible(`#c-${emptyCat.id} .topic`))) await p.click(`#c-${emptyCat.id} .head`);
    await p.click(`#c-${emptyCat.id} .tname:has-text("${emptyTopic.name}")`);
    check((await p.textContent("#sheetBody")).includes("No practice questions on this topic yet") && (await p.$$("#sheetBody .acts li")).length === (ACTS_FOR(emptyCat, emptyTopic.id)), "topic without questions says so and offers the category instead");
    await p.goBack();
    // test plan overview + footer
    await p.waitForSelector("#sheet", { state: "hidden" });
    const info = await p.textContent("#planInfo");
    check(info.includes("85 to 150 items") && (await p.$$("#planInfo details")).length === 12, "test-plan overview shows exam rules, 6 integrated processes and 6 clinical judgment steps");
    check((await p.textContent("footer.credit")).includes("Portions copyrighted by the National Council of State Boards of Nursing, Inc. All rights reserved."), "footer shows the NCSBN copyright credit");
    check(p.errs.length === 0, "no console errors (syllabus)" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
    await ctx.close();
  }

  // G. Question types, scoring and the 64 Management of Care questions
  {
    // The right and a deliberately wrong answer for each question, worked out here from the keys (not by the app).
    const correctSel = q => ({
      mcq: () => [q.key], sata: () => [...q.key], matrix: () => q.rows.map(r => r.key), trend: () => q.rows.map(r => r.key),
      dropdown: () => q.blanks.map(b => b.key), highlight: () => q.segments.map((s, i) => s.key === true ? i : -1).filter(i => i >= 0),
      dragdrop: () => q.mode === "sort" ? q.items.map(i => i.key) : [...q.key],
      bowtie: () => ({ c: [q.condition.key], a: [...q.actions.keys], p: [...q.parameters.keys] }),
      numeric: () => [String(q.key)]
    })[q.type]();
    const wrongSel = q => ({
      mcq: () => [(q.key + 1) % q.options.length], sata: () => q.options.map((_, i) => i).filter(i => !q.key.includes(i)).slice(0, 2),
      matrix: () => q.rows.map(r => (r.key + 1) % q.cols.length), trend: () => q.rows.map(r => (r.key + 1) % q.cols.length),
      dropdown: () => q.blanks.map(b => (b.key + 1) % b.options.length), highlight: () => q.segments.map((s, i) => s.key === false ? i : -1).filter(i => i >= 0),
      dragdrop: () => q.mode === "sort" ? q.items.map(i => (i.key + 1) % q.bins.length) : [...q.key].reverse(),
      numeric: () => [String(q.key + 1)],
      bowtie: () => { const pick = (n, keys, len) => [...Array(len).keys()].filter(i => !keys.includes(i)).slice(0, n); return { c: pick(1, [q.condition.key], q.condition.options.length), a: pick(q.actions.keys.length, q.actions.keys, q.actions.options.length), p: pick(q.parameters.keys.length, q.parameters.keys, q.parameters.options.length) }; }
    })[q.type]();

    const { ctx, p } = await page({ v: LATEST, setup: true, name: "Quiz", exam: "2028-07-01" });
    await p.waitForSelector("#home.on");

    // 1. every question: the right answer earns full marks, a wrong answer does not
    const res = await p.evaluate(items => items.map(({ id, good, bad }) => { const q = Q.find(x => x.id === id); return { id, found: !!q, goodReady: isReady(q, good), badReady: isReady(q, bad), good: scoreQ(q, good), bad: scoreQ(q, bad) }; }),
      BANK.map(q => ({ id: q.id, good: correctSel(q), bad: wrongSel(q) })));
    check(res.every(r => r.found) && res.length === BANK.length, `all ${BANK.length} new questions are loaded by the app`);
    check(res.every(r => r.goodReady && r.badReady), "every right and wrong answer can be submitted (Submit becomes available)");
    check(res.every(r => r.good.got === r.good.max && r.good.max >= 1), "the right answer earns full marks for every question: " + (res.filter(r => r.good.got !== r.good.max).map(r => r.id).join(", ") || "ok"));
    check(res.every(r => r.bad.got < r.bad.max), "a wrong answer never earns full marks: " + (res.filter(r => r.bad.got >= r.bad.max).map(r => r.id).join(", ") || "ok"));

    // 2. partial credit rules, on small made-up questions
    const pc = await p.evaluate(() => {
      const O6 = ["a", "b", "c", "d", "e", "f"], sc = (q, s) => { const r = scoreQ(q, s); return r.got + "/" + r.max; };
      const sata = { type: "sata", options: O6, key: [0, 1, 2] };
      const hl = { type: "highlight", segments: [{ text: "x", key: true }, { text: "y", key: true }, { text: "z", key: true }, { text: "w", key: false }, { text: "v", key: false }] };
      const mx = { type: "matrix", cols: ["A", "B"], rows: [{ key: 0 }, { key: 1 }, { key: 0 }, { key: 1 }] };
      const dd = { type: "dropdown", blanks: [{ key: 0, options: ["a", "b"] }, { key: 1, options: ["a", "b"] }] };
      const ord = { type: "dragdrop", mode: "order", items: [{}, {}, {}, {}], key: [2, 0, 3, 1] };
      const srt = { type: "dragdrop", mode: "sort", bins: ["A", "B"], items: [{ key: 0 }, { key: 1 }, { key: 0 }, { key: 1 }, { key: 0 }, { key: 1 }] };
      const bow = { type: "bowtie", condition: { key: 1 }, actions: { keys: [0, 1] }, parameters: { keys: [2, 3] } };
      return {
        mcqWrong: sc({ type: "mcq", key: 1 }, [0]), mcqRight: sc({ type: "mcq", key: 1 }, [1]),
        sata2of3: sc(sata, [0, 1]), sataOneWrong: sc(sata, [0, 1, 3]), sataAllRightOneWrong: sc(sata, [0, 1, 2, 3]), sataOnlyWrong: sc(sata, [3, 4]), sataMoreWrongThanRight: sc(sata, [0, 3, 4, 5]),
        hlRightWithWrong: sc(hl, [0, 1, 3]), hlAll: sc(hl, [0, 1, 2]),
        matrix3of4: sc(mx, [0, 1, 0, 0]), dropdown1of2: sc(dd, [0, 0]),
        orderSwap: sc(ord, [2, 0, 1, 3]), orderRight: sc(ord, [2, 0, 3, 1]), sort5of6: sc(srt, [0, 1, 0, 1, 0, 0]),
        bowtie4of5: sc(bow, { c: [1], a: [0, 4], p: [2, 3] }), bowtieAll: sc(bow, { c: [1], a: [0, 1], p: [2, 3] }), bowtieNone: sc(bow, { c: [0], a: [4, 5], p: [0, 1] })
      };
    });
    check(pc.mcqRight === "1/1" && pc.mcqWrong === "0/1", "multiple choice: all or nothing");
    check(pc.sata2of3 === "2/3" && pc.sataOneWrong === "1/3" && pc.sataAllRightOneWrong === "2/3" && pc.sataOnlyWrong === "0/3" && pc.sataMoreWrongThanRight === "0/3", "select-all: +1 for each right choice, -1 for each wrong one, never below 0");
    check(pc.hlRightWithWrong === "1/3" && pc.hlAll === "3/3", "highlight: plus/minus scoring");
    check(pc.matrix3of4 === "3/4" && pc.dropdown1of2 === "1/2" && pc.sort5of6 === "5/6", "matrix, drop-down and sort: one point per row, box or item");
    check(pc.orderSwap === "2/4" && pc.orderRight === "4/4", "ordering: one point per item in the right place");
    check(pc.bowtie4of5 === "4/5" && pc.bowtieAll === "5/5" && pc.bowtieNone === "0/5", "bowtie: one point per right choice out of 5");

    // 3. every question draws without sideways scroll, before and after answering, and with no stray text
    const layout = await p.evaluate(items => items.map(({ id, good }) => {
      const q = Q.find(x => x.id === id); runQuiz([q], {}); QZ.selFor = 0; QZ.sel = good;
      const before = [document.documentElement.scrollWidth, document.getElementById("quiz").innerText];
      submitQ();
      return { id, w1: before[0], w2: document.documentElement.scrollWidth, bad: /undefined|\[object|NaN|\{\d\}/.test(before[1] + document.getElementById("quiz").innerText), why: !!document.querySelector("#quiz .whyall"), rationale: document.querySelector("#quiz .rat").innerText.length > 30 };
    }), BANK.map(q => ({ id: q.id, good: correctSel(q) })));
    check(layout.every(l => l.w1 <= 360 && l.w2 <= 360), `no sideways scroll at 360px for any of the ${BANK.length} questions: ` + (layout.filter(l => l.w1 > 360 || l.w2 > 360).map(l => l.id).join(", ") || "ok"));
    check(layout.every(l => !l.bad), "no 'undefined', '[object' or '{n}' text in any question");
    check(layout.every(l => l.why && l.rationale), "after answering, every question shows its rationale and the 'why each choice' list");

    // 4. one question of every type, answered by tapping the screen
    const byType = {}; BANK.forEach(q => { const k = q.type === "dragdrop" ? "dragdrop-" + q.mode : q.type; if (!byType[k]) byType[k] = q; });
    check(Object.keys(byType).length === 10, "the bank uses all 10 kinds of question: " + Object.keys(byType).join(", "));
    const fresh = async q => { await p.evaluate(id => { runQuiz([Q.find(x => x.id === id)], {}); }, q.id); await p.waitForSelector("#quiz .stem"); };
    const banner = async () => (await p.textContent("#quiz .rat b")).trim();
    for (const [kind, q] of Object.entries(byType)) {
      await fresh(q);
      const submit = '#quiz button:has-text("Submit")';
      check(await p.isDisabled(submit), `${kind}: Submit is off until the question is answered`);
      await tapRight(p, q);
      await p.click(submit);
      check((await banner()).includes("Correct"), `${kind}: answering correctly on screen shows "Correct"`);
    }
    // wrong answers: partial credit is shown and the mistake is saved with its rationale
    const sataQ = byType.sata; await fresh(sataQ);
    await p.click(`#quiz .opt >> nth=${sataQ.key[0]}`); await p.click(`#quiz .opt >> nth=${sataQ.key[1]}`); await p.click(`#quiz .opt >> nth=${sataQ.options.map((_, i) => i).find(i => !sataQ.key.includes(i))}`);
    await p.click('#quiz button:has-text("Submit")');
    check((await banner()).includes("Not quite") && (await banner()).includes("partial credit 1/"), "select-all with 2 right and 1 wrong shows partial credit");
    check((await p.$$("#quiz .whyall[open] .why1")).length === sataQ.options.length, "after a wrong answer the 'why each choice' list is open and covers every option");
    const ordQ = byType["dragdrop-order"]; await fresh(ordQ);
    for (const ii of [...ordQ.key].reverse()) await p.getByText(ordQ.items[ii].text, { exact: true }).click();
    await p.click('#quiz button:has-text("Submit")');
    check(await p.isVisible("#quiz .ord li.wrong"), "ordering: wrong positions are marked");
    const mk = await state(p);
    check(!!mk.mistakes[sataQ.id] && !!mk.mistakes[ordQ.id] && mk.mistakes[ordQ.id].rationale.length > 30 && mk.mistakes[ordQ.id].topic === ordQ.topicId, "wrong answers of the new types are saved to My mistakes with their rationale");
    await p.goto(U + "#practice/mistakes"); await p.waitForSelector("#mistakes.on .item");
    check((await p.textContent("#mkList")).includes(ordQ.stem.slice(0, 40)), "My mistakes shows the question text");
    await p.click("#mkRetry"); await p.waitForSelector("#drill.on #quiz .stem");
    check(await p.evaluate(() => QZ.mode === "retry" && QZ.list.every(q => q.id in S.mistakes)), "Retry my mistakes works with the new types");

    check(p.errs.length === 0, "no console errors (question types)" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
    await ctx.close();
  }

  // H. Practice screen: official topics as the filter, and "Practise this topic"
  {
    const SYLL = JSON.parse(fs.readFileSync(path.join(root, "data/syllabus.json"), "utf8")), moc = SYLL.categories.find(c => c.id === "management-of-care");
    const { ctx, p } = await page({ v: LATEST, setup: true, name: "Filter", exam: "2028-07-01" });
    await p.waitForSelector("#home.on");
    await p.goto(U + "#practice/drill"); await p.waitForSelector("#drill.on #qtopic");
    check((await p.$$("#qtopic optgroup")).length === 8 && (await p.$$("#qtopic option[value*='--']")).length === 82, "topic filter lists all 82 official topics in 8 category groups");
    const withQuestions = new Set([...JSON.parse(fs.readFileSync(path.join(root, "data/questions.json"), "utf8")).questions.map(q => q.topic), ...BANK.map(q => q.topicId)]);
    check((await p.$$("#qtopic option[disabled]")).length === 82 - withQuestions.size, `topics with no questions are greyed out (${82 - withQuestions.size} of 82 for now)`);
    await p.click('#qfilter .chip:has-text("MoC")');
    check((await p.$$("#qtopic optgroup")).length === 1 && (await p.$$("#qtopic option[value*='--']")).length === 16, "choosing a category narrows the topic list to its topics");
    const counts = await p.$$eval("#qtopic option[value*='--']", os => os.map(o => +o.textContent.match(/\((\d+)\)$/)[1]));
    check(counts.length === 16 && counts.every(n => n >= 4), "every Management of Care topic shows 4 or more questions: " + counts.join(","));
    const t = moc.topics.find(x => x.id.endsWith("--delegation-and-supervision") || x.id.endsWith("assignment-delegation-and-supervision"));
    await p.selectOption("#qtopic", t.id);
    const expectN = await p.evaluate(id => Q.filter(q => q.topic === id).length, t.id);
    check((await p.textContent("#bankInfo")).startsWith(expectN + " questions match"), "the screen says how many questions match the chosen topic");
    await p.selectOption("#qn", "5"); await p.click("#qstart");
    await p.waitForSelector("#quiz .stem");
    check(await p.evaluate(id => QZ.list.length > 0 && QZ.list.every(q => q.topic === id) && QZ.topic === id, t.id), "Start runs only questions of the chosen topic");
    // "Practise this topic" for each of the 16 topics
    let allWork = true, why = [];
    for (const topic of moc.topics) {
      await p.goto(U + "#learn/syllabus");
      await p.evaluate(id => openTopic(id), topic.id);
      await p.waitForSelector("#sheet:not([hidden]) #tpPoints");
      const btn = p.locator('#sheetBody button:has-text("Practise this topic")');
      if (!(await btn.count())) { allWork = false; why.push(topic.id + " (no button)"); await p.goBack(); continue; }
      await btn.click();
      await p.waitForSelector("#drill.on #quiz .stem");
      const ok = await p.evaluate(id => QZ.topic === id && QZ.list.length >= 4 && QZ.list.every(q => q.topic === id) && qt === id && document.getElementById("qtopic").value === id, topic.id);
      if (!ok) { allWork = false; why.push(topic.id); }
    }
    check(allWork, "'Practise this topic' works for all 16 Management of Care topics and updates the Practice filter" + (why.length ? ": " + why.join(", ") : ""));
    // a topic with nothing yet does not start an empty quiz
    await p.goto(U + "#practice/drill");
    await p.evaluate(c => { qf = c; qt = ""; renderFilter(); }, emptyCat.id);
    await p.evaluate(([c, t]) => { qf = c; qt = t; startQuiz(); }, [emptyCat.id, emptyTopic.id]);
    check(await p.isVisible("#toast") && (await p.textContent("#toast")).includes("No questions"), "choosing a topic with no questions gives a message instead of an empty quiz");
    check(p.errs.length === 0, "no console errors (practice filter)" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
    await ctx.close();
  }

  // I. Calculation questions (numeric entry) and the two kinds of review label
  {
    const calc = require(path.join(root, "tests", "calc.js"));
    const NUM = BANK.filter(q => q.type === "numeric");
    const { ctx, p } = await page({ v: LATEST, setup: true, name: "Calc", exam: "2028-07-01" });
    await p.waitForSelector("#home.on");
    const fresh = async q => { await p.evaluate(id => { runQuiz([Q.find(x => x.id === id)], {}); }, q.id); await p.waitForSelector("#quiz .stem"); };
    check(NUM.length >= 7, `the bank has ${NUM.length} calculation questions`);

    // the number parser
    const parsed = await p.evaluate(() => ["7", "7.0", "7,5", "1,200", "-3.5", ".5", "abc", "", "1.2.3", "7 mL", "1,2,3"].map(parseNum));
    check(JSON.stringify(parsed) === JSON.stringify([7, 7, 7.5, 1200, -3.5, 0.5, null, null, null, null, null]), "typed numbers: 7, 7.0, 7,5 (decimal comma) and 1,200 are read; text and a second dot are not");

    // what the app accepts, checked against answers recomputed here with the shared calc module
    const rows = NUM.map(q => { const run = calc.runCalc(q.calc), d = q.rounding.decimals; return { id: q.id, key: q.key, exact: run.exact, d, slips: q.commonErrors.map(e => e.value) }; });
    const acc = await p.evaluate(items => items.map(({ id, key, exact, d, slips }) => {
      const q = Q.find(x => x.id === id), step = Math.pow(10, -d);
      return { id, key: numericOk(q, String(key)), exact: numericOk(q, String(exact)), long: numericOk(q, exact.toFixed(8)), comma: numericOk(q, String(key).replace(".", ",") + (Number.isInteger(key) ? ",0" : "")),
        up: numericOk(q, (key + step).toFixed(d + 3)), down: numericOk(q, (key - step).toFixed(d + 3)), slips: slips.map(v => numericOk(q, String(v))) };
    }), rows);
    check(acc.every(a => a.key && a.exact && a.long && a.comma), "the rounded answer, the exact unrounded answer and a decimal-comma answer are all accepted: " + (acc.filter(a => !(a.key && a.exact && a.long && a.comma)).map(a => a.id).join(", ") || "ok"));
    check(acc.every(a => !a.up && !a.down), "an answer one rounding step too high or too low is not accepted");
    check(acc.every(a => a.slips.every(s => !s)), "none of the listed common slips is accepted as correct");
    check(await p.evaluate(() => roundTo(2.5, 0) === 3 && roundTo(7.03125, 1) === 7 && roundTo(214.2857, 0) === 214 && roundTo(3.255, 2) === 3.26 && roundTo(1.005, 2) === 1.01), "rounding is half-up and not thrown off by floating point (1.005 → 1.01)");

    // on screen, for every calculation question
    for (const q of NUM) {
      await fresh(q);
      const submit = '#quiz button:has-text("Submit")';
      check(await p.isDisabled(submit) && await p.isVisible("#numIn") && (await p.textContent("#quiz .unit")).trim() === q.unit, `${q.id}: Submit is off until a number is typed, and the unit "${q.unit}" is shown`);
      await p.fill("#numIn", "abc"); const offForText = await p.isDisabled(submit);
      await p.fill("#numIn", String(q.key)); const onForNumber = !(await p.isDisabled(submit));
      check(offForText && onForNumber, `${q.id}: text keeps Submit off, a number turns it on`);
      await p.press("#numIn", "Enter");
      check((await p.textContent("#quiz .rat b")).includes("Correct") && await p.isVisible("#numIn.right"), `${q.id}: the right number (Enter key) shows Correct`);
      const body = await p.textContent("#quiz .whyall");
      check(body.includes("Formula:") && q.calc.steps.every(s => body.includes(s.show)), `${q.id}: the working (formula and every step) is shown`);
      // a common slip: not correct, and the app says what the slip was
      await fresh(q);
      await p.fill("#numIn", String(q.commonErrors[0].value));
      await p.click(submit);
      const txt = await p.textContent("#quiz .rat");
      check(txt.includes("Not quite") && txt.includes("Answer:") && txt.includes("Your answer is what you get if") && await p.isVisible("#numIn.wrong"), `${q.id}: the first common slip is marked wrong and explained`);
    }
    const st = await state(p);
    check(NUM.every(q => st.mistakes[q.id] && st.mistakes[q.id].rationale.length > 30), "wrong calculation answers are saved to My mistakes");
    // the rounding rule is in the stem, so she sees it
    check(await (async () => { await fresh(NUM[1]); return (await p.textContent("#quiz .stem")).includes(NUM[1].rounding.rule); })(), "the rounding rule is part of the question text");

    // review labels
    const regional = BANK.find(q => q.reviewKind === "regional"), clinical = BANK.find(q => q.reviewKind === "clinical");
    check(!!regional && !!clinical, "the bank has a regional and a clinical needsReview question");
    await fresh(regional);
    let t = await p.textContent("#quiz");
    check(t.includes("NCLEX model: provincial rules may differ") && !t.includes("clinical check"), "a regional question says 'NCLEX model: provincial rules may differ' and not 'clinical check'");
    await p.evaluate(() => { QZ.selFor = 0; QZ.sel = []; });
    await fresh(clinical);
    t = await p.textContent("#quiz");
    check(t.includes("Waiting for a clinical check") && !t.includes("provincial rules may differ"), "a clinical question says 'Waiting for a clinical check'");
    // a regional question's rationale carries the detail she needs
    check(/provinc|territor|Canad/i.test(regional.rationale) && BANK.filter(q => q.reviewKind === "regional").every(q => /provinc|territor|Canad|U\.S\./i.test(q.rationale)), "every regional question explains the difference in its rationale");
    check(p.errs.length === 0, "no console errors (calculations)" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
    await ctx.close();
  }

  // J. ECG strips (drawn in code) and the questions that use them
  {
    const { ctx, p } = await page({ v: LATEST, setup: true, name: "ECG", exam: "2028-07-01" });
    await p.waitForSelector("#home.on");
    const st = await p.evaluate(() => Object.fromEntries([["nsr", 75], ["sinus-tach", 128], ["sinus-brady", 40], ["afib", 120], ["pvc", 75], ["vtach", 180], ["vfib", 0], ["asystole", 0]].map(([r, rate]) => {
      const m = ecgModel(r, rate), s = ecgStats(m), pAt = m.beats.map(b => m.v[Math.round((b - 0.16) * m.fs)]).filter(x => x !== undefined);
      return [r, { beats: m.beats.length, rate: s.rate, cv: s.cv, qrs: m.qrs, amp: Math.max(...m.v) - Math.min(...m.v), ectopic: m.ectopic.filter(Boolean).length, pWave: pAt.length ? pAt.reduce((a, b) => a + b, 0) / pAt.length : 0 }];
    })));
    check(Math.abs(st.nsr.rate - 75) < 3 && st.nsr.cv < 0.03 && st.nsr.qrs < 0.11 && st.nsr.pWave > 0.08, "normal sinus rhythm: regular, about 75/min, narrow QRS, P waves present");
    check(Math.abs(st["sinus-tach"].rate - 128) < 4 && st["sinus-tach"].cv < 0.03 && st["sinus-tach"].qrs < 0.11, "sinus tachycardia: regular, fast, narrow QRS");
    check(Math.abs(st["sinus-brady"].rate - 40) < 2 && st["sinus-brady"].cv < 0.03, "sinus bradycardia: regular and slow");
    check(st.afib.cv > 0.2 && st.afib.rate > 80 && st.afib.rate < 180 && st.afib.qrs < 0.11, "atrial fibrillation: irregularly irregular, narrow QRS");
    check(st.pvc.ectopic >= 1 && st.pvc.qrs >= 0.14, "premature ventricular contractions: wide early beats");
    check(Math.abs(st.vtach.rate - 180) < 6 && st.vtach.cv < 0.03 && st.vtach.qrs >= 0.14, "ventricular tachycardia: fast, regular, wide complexes");
    check(st.vfib.beats === 0 && st.vfib.amp > 0.5, "ventricular fibrillation: chaotic with no QRS complexes");
    check(st.asystole.beats === 0 && st.asystole.amp < 0.05, "asystole: a flat line");
    check(await p.evaluate(() => JSON.stringify(ecgModel("afib", 110, 6, 9).v) === JSON.stringify(ecgModel("afib", 110, 6, 9).v) && JSON.stringify(ecgModel("afib", 110, 6, 9).v) !== JSON.stringify(ecgModel("afib", 110, 6, 10).v)), "a strip is the same every time, and a different seed gives a different strip");
    const svg = await p.evaluate(() => ecgSvg({ rhythm: "nsr", rate: 72 }));
    check(svg.startsWith("<svg") && (svg.match(/L/g) || []).length > 1000 && svg.includes('class="tr"') && svg.includes("role=\"img\"") && !/nsr|normal sinus/i.test(svg), "the strip is an accessible SVG that does not name the rhythm");

    // questions that use strips
    const withStrips = BANK.filter(q => (q.exhibit && q.exhibit.ecg) || (q.rows || []).some(r => r.ecg) || (q.items || []).some(r => r.ecg));
    check(withStrips.length >= 3, `${withStrips.length} questions use ECG strips`);
    const used = new Set(withStrips.flatMap(q => [q.exhibit && q.exhibit.ecg, ...(q.rows || []).map(r => r.ecg), ...(q.items || []).map(r => r.ecg)]).filter(Boolean).map(e => e.rhythm));
    check(["nsr", "sinus-tach", "sinus-brady", "afib", "vtach", "vfib", "asystole"].every(r => used.has(r)), "the questions cover normal sinus, sinus tachycardia and bradycardia, atrial fibrillation, ventricular tachycardia, ventricular fibrillation and asystole: " + [...used].join(", "));
    for (const q of withStrips) {
      const want = [q.exhibit && q.exhibit.ecg, ...(q.rows || []).map(r => r.ecg), ...(q.items || []).map(r => r.ecg)].filter(Boolean).length;
      await p.evaluate(id => { runQuiz([Q.find(x => x.id === id)], {}); }, q.id);
      await p.waitForSelector("#quiz .stem");
      check((await p.$$("#quiz svg.ecg")).length === want && await p.evaluate(() => document.documentElement.scrollWidth <= 360), `${q.id}: ${want} ECG strip(s) are drawn without sideways scroll`);
      await tapRight(p, q);
      await p.click('#quiz button:has-text("Submit")');
      check((await p.textContent("#quiz .rat b")).includes("Correct"), `${q.id}: choosing the right answers for the strips shows Correct`);
    }
    // the strip uses theme colours, so it stays readable in dark mode
    await p.evaluate(() => { S.theme = "dark"; applyLook(); });
    const dark = await p.evaluate(() => { const t = getComputedStyle(document.querySelector("#quiz svg.ecg .tr")).stroke, bg = getComputedStyle(document.querySelector("#quiz svg.ecg")).backgroundColor; return { t, bg }; });
    check(dark.t !== dark.bg && /rgb/.test(dark.t), "in dark mode the trace and the strip background are different colours: " + dark.t + " on " + dark.bg);
    check(p.errs.length === 0, "no console errors (ECG)" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
    await ctx.close();
  }

  await b.close(); server.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("✘ test crashed:", e.message); process.exit(1); });
