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
    await p.click('#setMinutes button[data-v="30"]'); await p.click("#setNext");
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
    const s = await state(p);
    check(s.v === 4 && Object.keys(s.lv).every(k => /^[a-z]/.test(k)) && Object.keys(s.stat).every(k => /^[a-z]/.test(k)), "progress saved by ID");
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
    check(s.v === 4 && s.name === "Test" && s.lv["pharm-dosage-calculation"] === 1, "v3 progress moved to IDs, setup skipped");
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

  await b.close(); server.close();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("✘ test crashed:", e.message); process.exit(1); });
