/* Study timer (default 25 min study / 5 min break, adjustable). Logs minutes per topic in
   S.study[day][topicId | "general"]. Uses end times, not counting ticks, so it stays right
   when the phone sleeps or the page reloads (the running timer is saved in S.timerRun). */

let tick = null, timerTopic = "general", timerPaintKey = "";
const WORK_OPTS = [15, 20, 25, 30, 45, 50, 60], BREAK_OPTS = [3, 5, 10, 15];
const fmtClock = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const topicLabel = id => id === "general" ? "General study" : TOPIC[id] ? TOPIC[id].name : "Old topic";

function timerLeft() {
  const r = S.timerRun;
  if (!r) return S.timer.work * 60000;
  return r.end ? Math.max(0, r.end - Date.now()) : r.left;
}

function logStudy(topic, mins) {
  const d = dayKey(), day = S.study[d] || (S.study[d] = {});
  day[topic] = (day[topic] || 0) + mins;
  markActive();
}

function timerAlert(msg) {
  toast(msg, 6000);
  try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) {}
  try { // short beep
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = .15;
    o.start(); o.stop(a.currentTime + .4); o.onended = () => a.close();
  } catch (e) {}
}

/* Finish study / break periods whose end time has passed. */
function timerCheck() {
  const r = S.timerRun;
  if (!r || !r.end || Date.now() < r.end) return;
  if (r.mode === "work") {
    logStudy(r.topic, r.work);
    const brkEnd = r.end + S.timer.brk * 60000;
    S.timerRun = brkEnd > Date.now() ? { mode: "break", end: brkEnd, left: null, topic: r.topic, work: r.work } : null;
    save();
    timerAlert(`✔ ${r.work} minutes logged. Time for a ${S.timer.brk}-minute break ☕`);
  } else {
    S.timerRun = null; save();
    timerAlert("Break's over. Ready for another round? 💪");
  }
}

function timerStart() {
  S.timerRun = { mode: "work", end: Date.now() + S.timer.work * 60000, left: null, topic: timerTopic, work: S.timer.work };
  persist(); startTick(); paintTimer();
}
function timerPause() { const r = S.timerRun; r.left = Math.max(0, r.end - Date.now()); r.end = null; persist(); paintTimer(); }
function timerGo() { const r = S.timerRun; r.end = Date.now() + r.left; r.left = null; persist(); paintTimer(); }
function timerStop() {
  const r = S.timerRun;
  if (!r) return;
  if (r.mode === "work") { const mins = Math.floor((r.work * 60000 - timerLeft()) / 60000); if (mins >= 1) { logStudy(r.topic, mins); toast(`✔ ${mins} minute${mins === 1 ? "" : "s"} logged`); } }
  S.timerRun = null; save(); paintTimer();
}

function startTick() {
  if (!tick) tick = setInterval(() => { timerCheck(); paintTimer(); }, 1000);
}
function timerResume() { timerCheck(); if (S.timerRun) startTick(); paintTimer(); }
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.timerRun) { timerCheck(); paintTimer(); } });

function openTimer(topic) {
  if (topic && !S.timerRun) timerTopic = topic;
  const opts = (list, v) => list.map(m => `<option value="${m}" ${m === v ? "selected" : ""}>${m} min</option>`).join("");
  openSheet(sheetHead("⏱️ Study timer") +
    `<div class="timer-mode" id="tMode"></div><div class="clock" id="tClock"></div>
     <label class="field">What are you studying?<select id="tTopic" style="width:100%;margin-top:6px"><option value="general">General study</option>${CATS.map(c => `<optgroup label="${esc(c.name)}">${c.topics.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</optgroup>`).join("")}</select></label>
     <div class="minis"><label class="field">Study<select id="tWork">${opts(WORK_OPTS, S.timer.work)}</select></label><label class="field">Break<select id="tBrk">${opts(BREAK_OPTS, S.timer.brk)}</select></label></div>
     <div class="row" id="tBtns"></div>
     <p class="note" id="tToday"></p>`, () => { timerPaintKey = ""; });
  $("tTopic").value = S.timerRun ? S.timerRun.topic : timerTopic;
  if (!$("tTopic").value) $("tTopic").value = "general";
  $("tTopic").onchange = e => { timerTopic = e.target.value; if (S.timerRun) { S.timerRun.topic = timerTopic; persist(); paintTimer(); } };
  $("tWork").onchange = e => { S.timer.work = +e.target.value; save(); timerPaintKey = ""; paintTimer(); };
  $("tBrk").onchange = e => { S.timer.brk = +e.target.value; save(); };
  timerPaintKey = "";
  paintTimer();
}

function paintTimer() {
  const r = S.timerRun, left = timerLeft();
  document.body.classList.toggle("timing", !!r);
  const bar = $("timebar");
  bar.hidden = !r;
  if (r) {
    bar.classList.toggle("brk", r.mode === "break");
    bar.innerHTML = `<span>⏱️ ${r.mode === "work" ? esc(topicLabel(r.topic)) : "Break ☕"}</span><b>${fmtClock(left)}${r.end ? "" : " · paused"}</b>`;
  } else if (tick) { clearInterval(tick); tick = null; }
  if (!$("tClock")) return;
  $("tClock").textContent = fmtClock(left);
  $("tMode").textContent = !r ? "Ready" : r.mode === "break" ? "Break time ☕" : r.end ? "Studying…" : "Paused";
  const key = r ? r.mode + (r.end ? "run" : "pause") : "idle"; // only rebuild buttons when the state changes
  if (key !== timerPaintKey) {
    timerPaintKey = key;
    $("tWork").disabled = $("tBrk").disabled = !!r;
    $("tBtns").innerHTML = !r ? `<button class="btn block" onclick="timerStart()">▶ Start ${S.timer.work} min</button>`
      : r.mode === "break" ? `<button class="btn ghost" onclick="timerStop()">Skip break</button>`
      : `${r.end ? `<button class="btn" onclick="timerPause()">Pause</button>` : `<button class="btn" onclick="timerGo()">Resume ▶</button>`}<button class="btn ghost" onclick="timerStop()">Stop & log</button>`;
    const today = Object.values(S.study[dayKey()] || {}).reduce((a, b) => a + b, 0);
    $("tToday").textContent = `Today: ${today} minute${today === 1 ? "" : "s"} logged. Keep the phone screen on, or come back when it's done: time is counted either way.`;
  }
}

/* Progress screen: minutes per day for the last 7 days + top topics. */
function renderWeek() {
  const days = [];
  for (let i = 6; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); days.push(x); }
  const mins = days.map(d => Object.values(S.study[dayKey(d)] || {}).reduce((a, b) => a + b, 0));
  const max = Math.max(30, ...mins);
  $("wkChart").innerHTML = days.map((d, i) => `<div class="${i === 6 ? "today" : ""}"><span>${mins[i] || ""}</span><i style="height:${mins[i] / max * 100}%"></i>${d.toLocaleDateString(undefined, { weekday: "narrow" })}</div>`).join("");
  const per = {};
  days.forEach(d => Object.entries(S.study[dayKey(d)] || {}).forEach(([t, m]) => per[t] = (per[t] || 0) + m));
  const total = mins.reduce((a, b) => a + b, 0);
  const top = Object.entries(per).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $("wkTopics").innerHTML = `<p class="note">${total ? `<b>${Math.floor(total / 60)} h ${total % 60} min</b> this week` : "No timer sessions this week yet."}</p>` +
    top.map(([t, m]) => `<div class="catrow" style="grid-template-columns:1fr 60px"><span>${esc(topicLabel(t))}</span><b style="text-align:right">${m} min</b></div>`).join("");
}
