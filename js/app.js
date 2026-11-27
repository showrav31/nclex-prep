/* NCLEX-RN Study — app logic. Content lives in data/*.json, saved progress in js/store.js. */

let CATS = [], Q = [], PHASES = [], CAN = {}, REF = {}, GUIDE = {};
const $ = id => document.getElementById(id);
const MINUTES = [[15, "15 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"], [90, "1½ hours+"]];

function save() { persist(); renderStats(); }

/* ---------- START-UP ---------- */
const DATA = ["syllabus", "questions", "plan", "canada", "reference", "exam-guide"];
Promise.all(DATA.map(f => fetch("data/" + f + ".json").then(r => { if (!r.ok) throw new Error(f); return r.json(); })))
  .then(([syl, qs, plan, can, ref, guide]) => {
    CATS = syl.categories; Q = qs.questions; PHASES = plan.phases; CAN = can; REF = ref; GUIDE = guide;
    start();
  })
  .catch(() => {
    $("loading").innerHTML = "Couldn't load the study content.<br>Check your internet connection and reload the page.<br><br>Your saved progress is safe.";
  });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {}));
}

function start() {
  $("loading").hidden = true;
  renderCats(); renderFilter(); renderFacts(); drawCat(); renderCJ(); renderPrio(); renderTypes(); renderDay();
  renderQuick(); renderCan(); renderSettings();
  document.querySelectorAll("#tabbar button").forEach(b => b.onclick = () => go(b.dataset.go));
  document.querySelectorAll("#learnTabs button").forEach(b => b.onclick = () => go("learn", b.dataset.sub));
  window.addEventListener("popstate", show);
  if (!S.setup) openSetup(); else openApp();
}

function openApp() {
  $("setup").hidden = true; $("app").hidden = false; $("tabbar").hidden = false;
  show();
}

/* ---------- NAVIGATION (hash-based, so Android's Back button works) ---------- */
const SCREENS = ["home", "learn", "practice", "progress", "more"];
let learnSub = "syllabus", pendingScroll = null;

function go(screen, sub) {
  const h = "#" + screen + (sub ? "/" + sub : "");
  if (location.hash !== h) history.pushState(null, "", h);
  show();
}

function show() {
  let [screen, sub] = location.hash.slice(1).split("/");
  if (!SCREENS.includes(screen)) screen = "home";
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("on", s.id === screen));
  document.querySelectorAll("#tabbar button").forEach(b => b.classList.toggle("on", b.dataset.go === screen));
  if (screen === "learn") {
    if (["syllabus", "ngn", "quick"].includes(sub)) learnSub = sub;
    document.querySelectorAll("#learn .sub").forEach(s => s.classList.toggle("on", s.id === learnSub));
    document.querySelectorAll("#learnTabs button").forEach(b => b.classList.toggle("on", b.dataset.sub === learnSub));
  }
  if (screen === "home") renderHome();
  if (screen === "progress") { renderLog(); renderPhases(); }
  if (pendingScroll) { const el = pendingScroll; pendingScroll = null; el.scrollIntoView({ block: "start" }); }
  else window.scrollTo(0, 0);
}

/* ---------- FIRST-TIME SETUP ---------- */
let setupStep = 0, setupMin = 30;

function choiceChips(id, value, onPick) {
  $(id).innerHTML = MINUTES.map(([v, l]) => `<button type="button" class="chip ${v === value ? "on" : ""}" data-v="${v}">${l}</button>`).join("");
  $(id).querySelectorAll("button").forEach(b => b.onclick = () => {
    $(id).querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    onPick(+b.dataset.v);
  });
}

function openSetup() {
  $("app").hidden = true; $("tabbar").hidden = true; $("setup").hidden = false;
  $("setName").value = S.name; $("setExam").value = S.exam; setupMin = S.minutes || 30;
  choiceChips("setMinutes", setupMin, v => setupMin = v);
  setupShow(0);
}

function setupShow(i) {
  setupStep = i;
  document.querySelectorAll(".setup-step").forEach(s => s.hidden = +s.dataset.step !== i);
  document.querySelectorAll("#setupDots i").forEach((d, k) => d.classList.toggle("on", k === i));
  $("setBack").hidden = !i;
  $("setNext").textContent = i === 2 ? "Let's start 🎉" : "Next";
}

$("setBack").onclick = () => setupShow(Math.max(0, setupStep - 1));
$("setNext").onclick = () => {
  if (setupStep === 0) {
    const n = $("setName").value.trim();
    if (!n) { $("setName").focus(); $("setName").placeholder = "Please type your name"; return; }
    S.name = n;
  }
  if (setupStep === 1) {
    if (!$("setExam").value) { $("setExam").focus(); return; }
    S.exam = $("setExam").value;
  }
  if (setupStep < 2) return setupShow(setupStep + 1);
  S.minutes = setupMin; S.setup = true; S.task = null; save();
  renderSettings();
  history.replaceState(null, "", "#home");
  openApp();
};
$("setName").addEventListener("keydown", e => { if (e.key === "Enter") $("setNext").click(); });

/* ---------- HOME ---------- */
function daysToExam() {
  if (!S.exam) return null;
  return Math.round((Date.parse(S.exam + "T00:00:00") - Date.parse(dayKey() + "T00:00:00")) / 864e5);
}

function renderHome() {
  const h = new Date().getHours();
  $("helloName").textContent = (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") + (S.name ? ", " + S.name : "") + " 👋";
  $("helloDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const d = daysToExam();
  $("hDays").textContent = d === null || d < 0 ? "–" : d;
  $("hDaysL").textContent = d === null ? "set your exam date in More" : d < 0 ? "exam date passed: update it in More" : d === 0 ? "Exam day! You've got this 💪" : d === 1 ? "day to your exam" : `days to your exam (about ${Math.max(1, Math.round(d / 30.4))} month${d > 45 ? "s" : ""})`;
  $("hStreak").textContent = streak();
  const week = [];
  for (let i = 6; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); week.push(S.days[dayKey(x)] ? "y" : ""); }
  $("hWeek").innerHTML = week.map(c => `<i class="${c}"></i>`).join("");
  renderTask();
  renderStats();
}

function renderStats() {
  let tot = 0, conf = 0;
  CATS.forEach((c, ci) => c.topics.forEach((_, ti) => { tot++; if (S.lv[ci + "-" + ti] == 3) conf++; }));
  $("sSyl").textContent = tot ? Math.round(conf / tot * 100) + "%" : "0%";
  let pt = 0, pd = 0;
  PHASES.forEach((p, pi) => p.tasks.forEach((_, ti) => { pt++; if (S.plan[pi + "-" + ti]) pd++; }));
  $("sPlan").textContent = pt ? Math.round(pd / pt * 100) + "%" : "0%";
  const st = Object.values(S.stat), n = st.reduce((s, x) => s + x.n, 0), c = st.reduce((s, x) => s + x.c, 0);
  $("sQ").textContent = n;
  $("sAcc").textContent = n ? Math.round(c / n * 100) + "%" : "–";
}

/* Today's study task: one topic a day, picked from her own ratings.
   Weak topics first, then topics not rated yet (rotating categories), then OK, then review. */
function todayTask() {
  const d = dayKey(), t = S.task;
  if (t && t.d === d && CATS[t.c] && CATS[t.c].topics[t.tp] !== undefined) return t;
  const all = [];
  CATS.forEach((c, ci) => c.topics.forEach((_, ti) => all.push({ c: ci, tp: ti, v: S.lv[ci + "-" + ti] || 0 })));
  const n = Math.floor(Date.parse(d + "T00:00:00Z") / 864e5);
  const by = v => all.filter(x => x.v === v);
  const weak = by(1), fresh = by(0), ok = by(2);
  let p, why;
  if (weak.length) { p = weak[n % weak.length]; why = "weak"; }
  else if (fresh.length) {
    const cats = [...new Set(fresh.map(x => x.c))], c = cats[n % cats.length];
    p = fresh.find(x => x.c === c); why = "new";
  }
  else if (ok.length) { p = ok[n % ok.length]; why = "ok"; }
  else { p = all[n % all.length]; why = "review"; }
  S.task = { d, c: p.c, tp: p.tp, why, done: false };
  persist();
  return S.task;
}

function renderTask() {
  const t = todayTask(), cat = CATS[t.c], topic = cat.topics[t.tp], m = S.minutes || 30;
  const nq = Q.filter(q => q.cat === t.c).length;
  const qn = Math.min(nq, m <= 15 ? 5 : m <= 30 ? 10 : m <= 45 ? 15 : 20);
  const read = Math.max(5, m - Math.round(qn * 1.5) - (m >= 60 ? 10 : 0));
  const why = { weak: "You marked this <b>Weak</b>, so let's make it stronger.", new: "A topic you haven't rated yet.", ok: "Rated <b>OK</b>: let's push it to Confident.", review: "Everything is Confident! Quick review to keep it fresh." }[t.why];
  const v = S.lv[t.c + "-" + t.tp] || 0;
  let h = `<h3><span>📌 Today's study task</span><span class="pill ${t.done ? "done" : ""}">${t.done ? "Done ✔" : "~" + m + " min"}</span></h3>
  <div class="topicname">${topic}</div><div class="note">${cat.name} · ${why}</div>`;
  if (t.done) {
    h += `<p style="margin:12px 0 4px">🎉 <b>Done for today!</b> Come back tomorrow to keep your streak going.</p>
    <div class="row"><button class="btn ghost" onclick="startQuiz(${t.c})">Practise more</button><button class="btn ghost" onclick="taskDone(false)">Undo</button></div>`;
  } else {
    h += `<ol>
    <li>📖 <b>Review the topic</b> for about ${read} min in your textbook or notes. <a href="#learn/syllabus" onclick="event.preventDefault();openCat(${t.c})">See it in the syllabus</a></li>
    ${qn ? `<li>✍️ <b>Answer ${qn} questions</b> on ${cat.short}.<br><button class="btn" style="margin-top:6px" onclick="startQuiz(${t.c},${qn},true)">Start practice ▶</button></li>` : ""}
    ${m >= 60 ? `<li>🧪 <b>10 min quick review</b>: <a href="#learn/quick">lab values & drug suffixes</a></li>` : ""}
    <li>⭐ <b>How do you feel about it now?</b><div class="lvl" style="margin-top:6px">${["Weak", "OK", "Confident"].map((l, i) => `<button class="s${i + 1} ${v == i + 1 ? "on" : ""}" onclick="rateTask(${i + 1})">${l}</button>`).join("")}</div></li>
    </ol><button class="btn block" onclick="taskDone(true)">✔ I've done today's task</button>`;
  }
  $("hTask").className = "card task" + (t.done ? " done" : "");
  $("hTask").innerHTML = h;
}

function rateTask(v) { const t = todayTask(); setLv(t.c + "-" + t.tp, v, true); renderTask(); }
function taskDone(done) {
  const t = todayTask(); t.done = done;
  if (done) markActive();
  save(); renderHome();
}
function openCat(ci) {
  pendingScroll = $("c" + ci);
  if (pendingScroll) pendingScroll.classList.add("open");
  go("learn", "syllabus");
}

/* ---------- SYLLABUS ---------- */
function renderCats() {
  const open = [...document.querySelectorAll("#cats .open")].map(e => e.id);
  let h = "", lastG = "";
  CATS.forEach((c, ci) => {
    if (c.group !== lastG) { h += `<div class="group">${c.group}</div>`; lastG = c.group; }
    const nq = Q.filter(q => q.cat === ci).length;
    h += `<div class="card" id="c${ci}"><div class="head" onclick="this.parentNode.classList.toggle('open')"><h3>${c.name}</h3><span class="pill">${c.weight} of exam</span></div><div class="bar"><i id="b${ci}"></i></div><div class="note" id="p${ci}" style="margin-top:6px"></div><div class="body">
    <button class="btn ghost" style="margin-bottom:8px" onclick="startQuiz(${ci})">Practise ${nq} questions on this ▶</button>`;
    c.topics.forEach((t, ti) => {
      const k = ci + "-" + ti, v = S.lv[k] || 0;
      h += `<div class="topic"><span>${t}</span><div class="lvl">${["Weak", "OK", "Confident"].map((l, i) => `<button class="s${i + 1} ${v == i + 1 ? "on" : ""}" onclick="setLv('${k}',${i + 1})">${l}</button>`).join("")}</div></div>`;
    });
    h += `</div></div>`;
  });
  $("cats").innerHTML = h;
  open.forEach(id => $(id) && $(id).classList.add("open"));
  catBars();
}

/* keep=true: set the rating (don't toggle it off when tapped twice) */
function setLv(k, v, keep) {
  S.lv[k] = !keep && S.lv[k] == v ? 0 : v;
  markActive(); save(); renderCats();
}

function catBars() {
  CATS.forEach((c, ci) => {
    let conf = 0, weak = 0;
    c.topics.forEach((_, ti) => { const v = S.lv[ci + "-" + ti]; if (v == 3) conf++; if (v == 1) weak++; });
    $("b" + ci).style.width = (conf / c.topics.length * 100) + "%";
    const st = S.stat[ci];
    $("p" + ci).textContent = `${conf}/${c.topics.length} confident${weak ? ` · ${weak} weak` : ""}${st ? ` · quiz ${Math.round(st.c / st.n * 100)}%` : ""} · tap to open`;
  });
}

/* ---------- STUDY PLAN ---------- */
function renderPhases() {
  const open = [...document.querySelectorAll("#phases .open")].map(e => e.id), now = new Date();
  const fmt = d => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });
  $("phases").innerHTML = PHASES.map((p, pi) => {
    const done = p.tasks.filter((_, ti) => S.plan[pi + "-" + ti]).length, all = done == p.tasks.length;
    const cur = now >= new Date(p.start + "T00:00:00") && now <= new Date(p.end + "T23:59:59");
    return `<div class="card phase ${all ? "complete" : cur ? "now" : ""}" id="ph${pi}"><div class="head" onclick="this.parentNode.classList.toggle('open')"><div><h3>${all ? "✔ " : ""}${p.name}</h3><div class="when">${fmt(p.start)} – ${fmt(p.end)}${cur ? " · <b style='color:var(--amber)'>you are here</b>" : ""}</div></div><span class="pill ${all ? "done" : ""}">${done}/${p.tasks.length}</span></div>
    <div class="bar"><i style="width:${done / p.tasks.length * 100}%"></i></div>
    <div class="body"><p class="note" style="margin:0 0 6px">🎯 ${p.goal}</p>${p.tasks.map((t, ti) => {
      const k = pi + "-" + ti, c = S.plan[k];
      return `<label class="check ${c ? "done" : ""}"><input type="checkbox" ${c ? "checked" : ""} onchange="setPlan('${k}',this.checked)"><span><b style="font-weight:500">${t.title}</b>${t.hint ? `<small>${t.hint}</small>` : ""}</span></label>`;
    }).join("")}
    <div class="row"><button class="btn ghost" onclick="markPhase(${pi},1)">Mark whole phase done</button><button class="btn ghost" onclick="markPhase(${pi},0)">Untick all</button></div></div></div>`;
  }).join("");
  open.forEach(id => $(id) && $(id).classList.add("open"));
  if (!open.length) { const i = PHASES.findIndex(p => now <= new Date(p.end + "T23:59:59")); const el = $("ph" + Math.max(0, i)); if (el) el.classList.add("open"); }
}
function setPlan(k, v) { S.plan[k] = v; if (v) markActive(); save(); renderPhases(); }
function markPhase(pi, v) {
  if (!v && !confirm("Untick every task in this phase?")) return;
  PHASES[pi].tasks.forEach((_, ti) => S.plan[pi + "-" + ti] = !!v);
  if (v) markActive();
  save(); renderPhases();
}

/* ---------- PRACTICE ---------- */
let qf = -1, QZ = null;

function renderFilter() {
  $("qfilter").innerHTML = [`<button class="chip ${qf == -1 ? "on" : ""}" onclick="qf=-1;renderFilter()">All</button>`]
    .concat(CATS.map((c, i) => `<button class="chip ${qf == i ? "on" : ""}" onclick="qf=${i};renderFilter()">${c.short}</button>`)).join("");
  $("bankInfo").textContent = Q.length + " questions in the bank.";
}

function shuffle(a) { return a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]); }

/* ci: category (undefined = use the filter), n: how many, fromTask: started from Home's task */
function startQuiz(ci, n, fromTask) {
  if (ci !== undefined) { qf = ci; renderFilter(); }
  let pool = shuffle(Q.filter(q => qf == -1 || q.cat == qf));
  if ($("qweak").checked) pool.sort((a, b) => (S.lv[b.cat + "-" + b.topic] == 1) - (S.lv[a.cat + "-" + a.topic] == 1));
  pool = pool.slice(0, n || +$("qn").value);
  QZ = { list: pool, i: 0, score: 0, sel: [], sub: false, task: !!fromTask, cat: qf };
  $("quiz").hidden = false;
  drawQ();
  pendingScroll = $("quiz");
  go("practice");
}
$("qstart").onclick = () => startQuiz();

const TYPE_NAMES = { mcq: "Multiple choice", sata: "Select all that apply", matrix: "Matrix (Next Gen)" };

function drawQ() {
  const z = QZ;
  if (z.i >= z.list.length) return finishQuiz();
  const q = z.list[z.i];
  let h = `<div class="qmeta"><span>Question ${z.i + 1} of ${z.list.length} · Score ${z.score}</span><span><span class="qtype">${TYPE_NAMES[q.type]}</span> · ${CATS[q.cat].short} · ${CATS[q.cat].topics[q.topic]}</span></div><div class="bar" style="margin:0 0 12px"><i style="width:${z.i / z.list.length * 100}%"></i></div><div class="stem">${q.stem}</div>`;
  if (q.type == "matrix") {
    h += `<div class="scroll"><table class="matrix"><tr><th></th>${q.cols.map(c => `<th style="text-align:center">${c}</th>`).join("")}</tr>${q.rows.map((r, ri) => `<tr><td>${r.text}</td>${q.cols.map((_, ci) => {
      let cls = ""; if (z.sub && ci == r.answer) cls = "right"; else if (z.sub && z.sel[ri] == ci) cls = "wrong";
      return `<td class="${cls}"><input type="radio" name="m${ri}" aria-label="${q.cols[ci]}" ${z.sel[ri] == ci ? "checked" : ""} ${z.sub ? "disabled" : ""} onchange="QZ.sel[${ri}]=${ci};drawQ()"></td>`;
    }).join("")}</tr>`).join("")}</table></div>`;
  } else {
    h += q.options.map((o, oi) => {
      let cls = z.sel.includes(oi) ? "sel" : "";
      if (z.sub) { if (q.answer.includes(oi)) cls = "right"; else if (z.sel.includes(oi)) cls = "wrong"; }
      return `<div class="opt ${cls}" onclick="pick(${oi})"><span class="k">${q.type == "sata" ? (z.sel.includes(oi) ? "☑" : "☐") : String.fromCharCode(65 + oi)}</span><span>${o}</span></div>`;
    }).join("");
  }
  if (z.sub) {
    const ok = z.last;
    h += `<div class="rat"><b class="${ok ? "ok" : "no"}">${ok ? "✔ Correct" : "✘ Not quite"}${!ok && z.partial ? ` · partial credit ${z.partial}` : ""}</b><br>${q.rationale}</div><div class="row"><button class="btn" onclick="QZ.i++;QZ.sel=[];QZ.sub=false;drawQ()">${z.i + 1 < z.list.length ? "Next question →" : "See results"}</button></div>`;
  } else {
    const ready = q.type == "matrix" ? q.rows.every((_, ri) => z.sel[ri] !== undefined) : z.sel.length > 0;
    h += `<div class="row"><button class="btn" ${ready ? "" : "disabled"} onclick="submitQ()">Submit</button></div>`;
  }
  $("quiz").innerHTML = h;
}

function pick(oi) {
  const z = QZ, q = z.list[z.i];
  if (z.sub) return;
  z.sel = q.type == "mcq" ? [oi] : z.sel.includes(oi) ? z.sel.filter(x => x != oi) : [...z.sel, oi];
  drawQ();
}

function submitQ() {
  const z = QZ, q = z.list[z.i];
  let ok, partial = "";
  if (q.type == "matrix") { const n = q.rows.filter((r, ri) => z.sel[ri] == r.answer).length; ok = n == q.rows.length; partial = n + "/" + q.rows.length; }
  else if (q.type == "sata") {
    ok = z.sel.length == q.answer.length && z.sel.every(x => q.answer.includes(x));
    const n = Math.max(0, z.sel.filter(x => q.answer.includes(x)).length - z.sel.filter(x => !q.answer.includes(x)).length);
    partial = n + "/" + q.answer.length;
  }
  else ok = q.answer[0] == z.sel[0];
  z.sub = true; z.last = ok; z.partial = partial;
  if (ok) z.score++;
  const st = S.stat[q.cat] || (S.stat[q.cat] = { n: 0, c: 0 });
  st.n++; if (ok) st.c++;
  if (!ok) { const k = q.cat + "-" + q.topic; if (!S.lv[k] || S.lv[k] == 2) S.lv[k] = 1; }
  markActive(); save(); drawQ();
}

function finishQuiz() {
  const z = QZ, p = Math.round(z.score / z.list.length * 100);
  S.sessions.push({ d: dayKey(), q: z.list.length, c: z.score, cat: z.cat == -1 ? "All" : CATS[z.cat].short });
  let taskMsg = "";
  if (z.task && S.task && S.task.d === dayKey() && !S.task.done) {
    S.task.done = true;
    taskMsg = `<p><b>🎉 Today's task is done!</b> Rate the topic on Home.</p>`;
  }
  save(); renderCats();
  $("quiz").innerHTML = `<div style="text-align:center;padding:10px"><div style="font-size:3rem">${p >= 80 ? "🌟" : p >= 60 ? "💪" : "📚"}</div><h2>${z.score} / ${z.list.length} (${p}%)</h2><p class="note">${p >= 80 ? "Excellent! Move these topics toward Confident." : p >= 60 ? "Good work, keep going. Review the rationales you missed." : "Topics you missed were marked Weak in the Syllabus. Review them, then try again."}</p>${taskMsg}<div class="row" style="justify-content:center"><button class="btn" onclick="startQuiz()">Another round</button>${z.task ? `<button class="btn ghost" onclick="go('home')">Back to Home</button>` : ""}</div></div>`;
}

/* ---------- PROGRESS ---------- */
function renderLog() {
  const L = S.sessions.slice(-30);
  $("chart").innerHTML = L.map(r => { const a = Math.round(r.c / r.q * 100); return `<div class="${a < 60 ? "low" : ""}" style="height:${Math.max(a, 3)}%" title="${r.d}: ${a}%"></div>`; }).join("") || '<span class="note" style="margin:auto">No sessions yet</span>';
  $("hist").innerHTML = S.sessions.slice(-8).reverse().map(r => `<tr><td>${r.d}</td><td>${r.cat}</td><td>${r.c}/${r.q}</td><td>${Math.round(r.c / r.q * 100)}%</td></tr>`).join("");
  $("catAcc").innerHTML = CATS.map((c, i) => {
    const s = S.stat[i], a = s ? Math.round(s.c / s.n * 100) : null;
    return `<div class="catrow"><span>${c.name}</span><div class="bar" style="margin:0"><i style="width:${a || 0}%;${a !== null && a < 60 ? "background:var(--rose)" : ""}"></i></div><b style="text-align:right">${a === null ? "–" : a + "%"}</b></div>`;
  }).join("");
}

/* ---------- EXAM GUIDE ---------- */
const flipCard = (front, back) => `<div class="flip" onclick="this.classList.toggle('f')"><div class="in"><div class="fa"><b style="font-family:Fraunces,serif;font-size:1.05rem">${front}</b><span class="note">tap to flip</span></div><div class="ba">${back}</div></div></div>`;
function renderFacts() { $("facts").innerHTML = GUIDE.facts.map(f => flipCard(f.q, f.a)).join(""); }
function renderPrio() { $("prio").innerHTML = GUIDE.priority.map(f => flipCard(f.rule, f.detail)).join(""); }
function renderDay() {
  $("dayList").innerHTML = GUIDE.examDay.map((d, i) => `<div class="check" style="cursor:default"><span class="pill" style="height:fit-content">${i + 1}</span><span><b style="font-weight:600">${d.title}</b><small>${d.hint}</small></span></div>`).join("");
}

let cat = { th: 0, hist: [0], n: 0 };
function catAns(ok) {
  if (cat.done) return;
  cat.n++;
  const step = Math.max(.15, 1.2 / Math.sqrt(cat.n));
  cat.th = Math.max(-3, Math.min(3, cat.th + (ok ? step : -step)));
  cat.hist.push(cat.th);
  const se = 1.5 / Math.sqrt(cat.n);
  let msg = `Question ${cat.n}: answered ${ok ? "<b>right</b>, so the next one will be <b>harder</b>" : "<b>wrong</b>, so the next one will be <b>easier</b>"}. Estimated ability: ${cat.th >= 0 ? "above" : "below"} passing line.`;
  if (cat.n >= 10 && Math.abs(cat.th) > 1.96 * se) {
    cat.done = 1;
    msg = `🛑 <b>Test stops at question ${cat.n}</b>: the computer is 95% confident you are <b>${cat.th > 0 ? "ABOVE the passing line → PASS ✔" : "BELOW the passing line → FAIL"}</b>. (In the real exam the minimum is 85 questions.)`;
  }
  $("catMsg").innerHTML = msg;
  drawCat();
}
function catReset() { cat = { th: 0, hist: [0], n: 0 }; $("catMsg").innerHTML = "Press a button to answer question 1."; drawCat(); }
function drawCat() {
  const y = v => 85 - v * 24, n = Math.max(12, cat.hist.length), x = i => 30 + i * (300 / (n - 1));
  let s = `<rect x="30" y="${y(3)}" width="300" height="${y(0) - y(3)}" fill="#e6f4f1"/><rect x="30" y="${y(0)}" width="300" height="${y(-3) - y(0)}" fill="#fdf0f1"/><line x1="30" x2="330" y1="${y(0)}" y2="${y(0)}" stroke="#b7791f" stroke-dasharray="5 4"/><text x="34" y="${y(0) - 5}" font-size="10" fill="#b7791f">passing standard</text><text x="34" y="${y(3) + 12}" font-size="10" fill="#0f766e">PASS zone</text><text x="34" y="${y(-3) - 4}" font-size="10" fill="#be4b5b">FAIL zone</text>`;
  s += `<polyline fill="none" stroke="#0f766e" stroke-width="2.5" points="${cat.hist.map((v, i) => x(i) + "," + y(v)).join(" ")}"/>` + cat.hist.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#0f766e"/>`).join("");
  $("catSvg").innerHTML = s;
}

function renderCJ() {
  $("cjSteps").innerHTML = GUIDE.judgment.map((c, i) => `<div class="step" onclick="cjShow(${i})" id="cj${i}"><div class="num">${i + 1}</div><b style="font-size:.9rem">${c.step}</b><div style="font-size:.78rem;opacity:.8">${c.ask}</div></div>`).join("");
}
function cjShow(i) {
  const J = GUIDE.judgment;
  document.querySelectorAll(".step").forEach(e => e.classList.remove("on"));
  $("cj" + i).classList.add("on");
  $("cjDetail").innerHTML = `<b>Step ${i + 1}: ${J[i].step}</b><br>${J[i].example}${i < J.length - 1 ? `<br><button class="btn ghost" style="margin-top:10px" onclick="cjShow(${i + 1})">Next step →</button>` : "<br><br>🎉 That's the whole model! Every case study follows this path."}`;
}

let tSel = 0, demoSel = [], demoSub = false, ordPick = [];
function renderTypes() {
  $("typeChips").innerHTML = GUIDE.types.map((t, i) => `<button class="chip ${i == tSel ? "on" : ""}" onclick="tSel=${i};demoSel=[];demoSub=false;ordPick=[];renderTypes()">${t.name}</button>`).join("");
  drawDemo();
}
function drawDemo() {
  const t = GUIDE.types[tSel];
  let h = `<p class="note">${t.desc}</p>`;
  if (t.demo) {
    const q = t.demo;
    h += `<div class="stem">${q.stem}</div>`;
    if (q.type == "matrix") h += `<div class="scroll"><table class="matrix"><tr><th></th>${q.cols.map(c => `<th style="text-align:center">${c}</th>`).join("")}</tr>${q.rows.map((r, ri) => `<tr><td>${r.text}</td>${q.cols.map((_, ci) => `<td class="${demoSub ? (ci == r.answer ? "right" : demoSel[ri] == ci ? "wrong" : "") : ""}"><input type="radio" name="d${ri}" ${demoSel[ri] == ci ? "checked" : ""} onchange="demoSel[${ri}]=${ci}"></td>`).join("")}</tr>`).join("")}</table></div>`;
    else h += q.options.map((o, oi) => {
      let c = demoSel.includes(oi) ? "sel" : "";
      if (demoSub) { if (q.answer.includes(oi)) c = "right"; else if (demoSel.includes(oi)) c = "wrong"; }
      return `<div class="opt ${c}" onclick="dPick(${oi})"><span class="k">${q.type == "sata" ? (demoSel.includes(oi) ? "☑" : "☐") : String.fromCharCode(65 + oi)}</span>${o}</div>`;
    }).join("");
    h += demoSub ? `<div class="rat">${q.rationale}</div>` : `<button class="btn" style="margin-top:8px" onclick="demoSub=true;drawDemo()">Check</button>`;
  }
  else if (t.kind == "highlight") {
    h += `<div class="case" id="hlBox" style="font-size:1rem;line-height:2.2">${GUIDE.highlight.map(p => p.key || p.text.trim().length > 2 ? `<span data-k="${p.key ? 1 : 0}" onclick="this.classList.toggle('hl');this.style.background=this.classList.contains('hl')?'#fde68a':''" style="cursor:pointer;border-radius:4px;padding:2px 3px">${p.text}</span>` : p.text).join("")}</div><button class="btn" onclick="hlCheck()">Check</button><div id="hlRes"></div>`;
  }
  else if (t.kind == "cloze") {
    h += `<div class="case" style="font-size:1rem;line-height:2.4">The client is most likely experiencing <select id="cz1"><option>—</option><option>hypovolemia</option><option>fluid overload</option></select> as shown by <select id="cz2"><option>—</option><option>crackles and weight gain</option><option>dry mouth and low BP</option></select>.</div><p class="note">Case: heart failure client, +2 kg overnight, crackles, edema.</p><button class="btn" onclick="clozeCheck()">Check</button><div id="czRes"></div>`;
  }
  else if (t.kind == "bowtie") {
    h += `<div class="bowtie"><div><b>Actions to take</b><div class="opt">Give oxygen</div><div class="opt">Give IV fluids</div></div><div class="mid"><b>Condition</b><br>Sepsis</div><div><b>Parameters to monitor</b><div class="opt">Blood pressure</div><div class="opt">Lactate level</div></div></div><p class="note">In the real exam, you drag these from a list of options into each box. Every box is scored.</p>`;
  }
  else if (t.kind == "order") {
    h += `<p class="stem">Put the hand-hygiene + PPE <b>donning</b> order right (tap in order):</p><div id="ordBox"></div><div id="ordRes"></div>`;
    setTimeout(drawOrd);
  }
  else {
    h += `<div class="scroll"><table><tr><th>Time</th><th>08:00</th><th>12:00</th><th>16:00</th></tr><tr><td>BP</td><td>128/80</td><td>110/70</td><td>92/58</td></tr><tr><td>HR</td><td>84</td><td>98</td><td>116</td></tr><tr><td>Urine (mL/h)</td><td>60</td><td>40</td><td>20</td></tr></table></div><p class="note" style="margin-top:8px">Trend: BP ↓, HR ↑, urine ↓ → the client is getting worse (possible shock). Trend questions ask you to <b>spot the direction</b>, not a single value.</p>`;
  }
  $("typeDemo").innerHTML = h;
}
function dPick(oi) {
  if (demoSub) return;
  const q = GUIDE.types[tSel].demo;
  demoSel = q.type == "mcq" ? [oi] : demoSel.includes(oi) ? demoSel.filter(x => x != oi) : [...demoSel, oi];
  drawDemo();
}
function hlCheck() {
  let r = 0, w = 0;
  const total = GUIDE.highlight.filter(p => p.key).length;
  document.querySelectorAll("#hlBox span").forEach(s => {
    const k = s.dataset.k == "1", h = s.classList.contains("hl");
    if (k) s.style.outline = "2px solid #0f766e";
    if (k && h) r++; if (!k && h) w++;
  });
  $("hlRes").innerHTML = `<div class="rat">You found <b>${r}/${total}</b> key findings${w ? ` (and ${w} extra)` : ""}. Fever, new confusion, low BP and high HR together suggest <b>sepsis</b>: report right away.</div>`;
}
function clozeCheck() {
  const ok = $("cz1").value == "fluid overload" && $("cz2").value == "crackles and weight gain";
  $("czRes").innerHTML = ok ? `<div class="rat"><b class="ok">✔ Correct</b>: crackles + weight gain = fluid overload.</div>` : `<div class="rat"><b class="no">✘ Try again</b>: look at the weight and lung sounds.</div>`;
}
function drawOrd() {
  const ORD = GUIDE.donning;
  if (!$("ordBox")) return;
  const left = shuffle(ORD.map((o, i) => i).filter(i => !ordPick.includes(i)));
  $("ordBox").innerHTML = `<div class="case">${ordPick.map((i, n) => `${n + 1}. ${ORD[i]}`).join("<br>") || "<span class='note'>Your order appears here</span>"}</div>` + left.map(i => `<button class="chip" style="margin:3px" onclick="ordPick.push(${i});drawOrd()">${ORD[i]}</button>`).join("") + (ordPick.length ? ` <button class="chip" onclick="ordPick=[];drawOrd();$('ordRes').innerHTML=''">↺ reset</button>` : "");
  if (ordPick.length == ORD.length) $("ordRes").innerHTML = `<div class="rat">${ordPick.every((o, i) => o == i) ? "<b class=ok>✔ Perfect!</b>" : "<b class=no>✘ Not quite.</b> Correct: " + ORD.join(" → ")}. Remove in roughly the reverse order: gloves come off first.</div>`;
}

/* ---------- QUICK REFERENCE ---------- */
function renderQuick() {
  $("labs").innerHTML = REF.labs.map(l => `<tr><td>${l.name}</td><td>${l.range}</td></tr>`).join("");
  $("drugs").innerHTML = REF.drugs.map(l => `<tr><td><b>${l.suffix}</b></td><td>${l.cls}</td></tr>`).join("");
  $("iso").innerHTML = `<tr><th>Type</th><th>Examples</th><th>Key PPE / room</th></tr>` + REF.isolation.map(r => `<tr><td>${r.type}</td><td>${r.examples}</td><td>${r.ppe}</td></tr>`).join("");
}

/* ---------- MORE: SETTINGS + CANADA ---------- */
function renderSettings() {
  $("optName").value = S.name; $("optExam").value = S.exam;
  choiceChips("optMinutes", S.minutes, v => { S.minutes = v; save(); });
}
$("optName").addEventListener("change", e => { const n = e.target.value.trim(); if (n) { S.name = n; save(); } else e.target.value = S.name; });
$("optExam").addEventListener("change", e => { if (e.target.value) { S.exam = e.target.value; save(); } else e.target.value = S.exam; });

function renderCan() {
  const steps = CAN.steps, d = steps.filter((_, i) => S.can[i]).length;
  $("canBar").style.width = d / steps.length * 100 + "%";
  $("canList").innerHTML = steps.map((c, i) => `<label class="check ${S.can[i] ? "done" : ""}"><input type="checkbox" ${S.can[i] ? "checked" : ""} onchange="S.can[${i}]=this.checked;save();renderCan()"><span><b style="font-weight:500">${c.title}</b>${c.hint ? `<small>${c.hint}</small>` : ""}</span></label>`).join("");
  $("canLinks").innerHTML = CAN.links.map(l => `<li><a href="${l.url}" target="_blank" rel="noopener">${l.label}</a></li>`).join("");
}
