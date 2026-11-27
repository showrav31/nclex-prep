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
const LATEST = 5;

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
      if (await p.evaluate(() => QZ.list[QZ.i].type) === "matrix") {
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
    check(s.lv["moc-advance-directives"] === 3 && s.lv["pharm-dosage-calculation"] === 1, "v2 topic ratings moved to IDs");
    check(s.plan["plan-get-test-plan"] && s.plan["plan-sit-nclex"] && s.can["can-bnmc"], "v2 plan + Canada ticks moved to IDs");
    check(s.stat.moc && s.stat.moc.n === 4 && s.sessions.length === 1 && s.sessions[0].cid === "moc", "v2 quiz stats + sessions kept");
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
    check(s.v === LATEST && s.name === "Test" && s.lv["pharm-dosage-calculation"] === 1, "v3 progress moved to IDs, setup skipped");
    check(await p.textContent("#hTask .topicname") === "Dosage calculation", "today's task picks the Weak topic");
    await p.click("#tabbar [data-go=learn]");
    check((await p.textContent("#p-moc")).startsWith("1/14 confident"), "syllabus shows migrated rating");
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
    check(s.v === LATEST && s.lv["moc-advance-directives"] === 3 && !!s.cards && !!s.notes && !!(await p.evaluate(() => localStorage.getItem("nclexDash2_backup_v4"))), "v4 progress kept, new fields added, v4 backup kept");
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
    await p.click("#c-moc .head");
    await p.click('#c-moc button[aria-label^="Notes on Advance"]');
    await p.fill("#noteText", "Competent adult's wishes come first.");
    await p.goBack();
    await p.waitForSelector("#sheet", { state: "hidden" });
    s = await state(p);
    check(!!s.notes["moc-advance-directives"] && s.notes["moc-advance-directives"].text.includes("wishes"), "topic note saved; Back closes the note");
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
    await p.evaluate(() => openTimer("pharm-dosage-calculation"));
    await p.click('#tBtns button:has-text("Start")');
    check(await p.isVisible("#timebar"), "timer bar shows while timing");
    await p.evaluate(() => { S.timerRun.end = Date.now() - 1000; });
    await p.waitForFunction(() => S.timerRun && S.timerRun.mode === "break", null, { timeout: 4000 });
    check(await p.evaluate(() => S.study[dayKey()]["pharm-dosage-calculation"] === 25), "finished timer logs 25 min to the topic");
    await p.click('#tBtns button:has-text("Skip break")');
    await p.click('#sheet button:has-text("Done")');
    await p.goto(U + "#progress");
    check((await p.textContent("#wkTopics")).includes("Dosage calculation"), "weekly chart lists study time by topic");
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
    check(copied.app === "nclex-prep" && !!copied.data.notes["moc-advance-directives"] && copied.data.myCards.length === 1 && !!copied.data.cards && !!copied.data.study, "Copy backup includes notes, cards, timer and progress");
    copied.data.name = "Restored";
    await p.fill("#importText", JSON.stringify(copied));
    await Promise.all([p.waitForEvent("load"), p.click('button:has-text("Restore backup")')]);
    await p.waitForSelector("#home.on");
    check((await state(p)).name === "Restored" && !!(await p.evaluate(() => localStorage.getItem("nclexDash2_before_import"))), "restore replaces progress and keeps a safety copy");
    await p.goto(U + "#more");
    await p.fill("#importText", JSON.stringify(V2));
    await Promise.all([p.waitForEvent("load"), p.click('button:has-text("Restore backup")')]);
    await p.waitForSelector("#setup:not([hidden]), #app:not([hidden])");
    check(await p.evaluate(() => S.lv["moc-advance-directives"] === 3 && S.v === 5), "restoring an old-version backup migrates it");
    await p.evaluate(() => { S.setup = true; persist(); });
    await p.goto(U + "#more"); await p.reload(); await p.waitForSelector("#more.on");
    await Promise.all([p.waitForEvent("load"), p.click('button:has-text("Reset all progress")')]);
    await p.waitForSelector("#setup:not([hidden])");
    check(!!(await p.evaluate(() => localStorage.getItem("nclexDash2_before_reset"))), "reset starts over and keeps a safety copy");
    check(p.errs.length === 0, "no console errors (study tools)" + (p.errs.length ? ": " + p.errs.join(" | ") : ""));
    await ctx.close();
  }

  await b.close(); server.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("✘ test crashed:", e.message); process.exit(1); });
