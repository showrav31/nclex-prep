/* Syllabus screen, built from data/syllabus.json (an exact copy of source/nclex-2026-syllabus.json,
   the official 2026 NCLEX-RN Test Plan data). area -> category -> topic -> learning points.
   Her ticks are saved by learning point ID (S.points), her ratings by topic ID (S.lv). */

/* Short names for chips and labels (display only; the data has none). Keyed by category id. */
const CAT_SHORT = {
  "management-of-care": "MoC",
  "safety-infection-control": "Safety",
  "health-promotion": "Health Promo",
  "psychosocial-integrity": "Psychosocial",
  "basic-care-comfort": "Basic Care",
  "pharmacological-parenteral": "Pharm",
  "reduction-risk-potential": "Risk Reduction",
  "physiological-adaptation": "Phys Adaptation"
};
let SYL = null, AREA = {}, ACTS = {}; // ACTS[topicId] = activity statements linked to that topic

function indexSyllabus(syl) {
  SYL = syl; CATS = syl.categories;
  syl.areas.forEach(a => AREA[a.id] = a);
  CATS.forEach(c => {
    c.short = CAT_SHORT[c.id] || c.name;
    CAT[c.id] = c;
    c.activityStatements.forEach(a => a.topicIds.forEach(t => (ACTS[t] = ACTS[t] || []).push(a)));
    c.topics.forEach(t => TOPIC[t.id] = { ...t, cat: c.id });
  });
}

/* Overall progress, weighted by each category's weightMid (its share of the exam):
   sum(weightMid x share of the category's topics rated Confident) / sum(weightMid). */
function syllabusProgress() {
  let wSum = 0, wDone = 0, conf = 0, total = 0, pts = 0, ptsTotal = 0;
  CATS.forEach(c => {
    const k = c.topics.filter(t => S.lv[t.id] == 3).length;
    wSum += c.weightMid; wDone += c.weightMid * k / c.topics.length; conf += k; total += c.topics.length;
    c.topics.forEach(t => t.learningPoints.forEach(p => { ptsTotal++; if (S.points[p.id]) pts++; }));
  });
  return { weighted: wSum ? wDone / wSum : 0, conf, total, pts, ptsTotal };
}
const pointsDone = t => t.learningPoints.filter(p => S.points[p.id]).length;

/* ---------- category list ---------- */
function renderCats() {
  const open = [...document.querySelectorAll("#cats .open")].map(e => e.id);
  let h = "", lastArea = "";
  CATS.forEach(c => {
    if (c.areaId !== lastArea) { h += `<div class="group">${esc(AREA[c.areaId].name)}</div>`; lastArea = c.areaId; }
    const nq = Q.filter(q => catOf(q) === c.id).length;
    h += `<div class="card" id="c-${c.id}"><div class="head" onclick="this.parentNode.classList.toggle('open')"><h3>${esc(c.name)}</h3><span class="pill">${esc(c.weightRange)} of exam</span></div><div class="bar"><i id="b-${c.id}"></i></div><div class="note" id="p-${c.id}" style="margin-top:6px"></div><div class="body">
    <p class="note" style="margin-top:0">${esc(c.description)}</p>
    <button class="btn ghost" style="margin-bottom:8px" onclick="startQuiz('${c.id}')" ${nq ? "" : "disabled"}>${nq ? `Practise ${nq} question${nq === 1 ? "" : "s"} on this ▶` : "No practice questions yet"}</button>`;
    c.topics.forEach(t => {
      const v = S.lv[t.id] || 0, n = t.learningPoints.length, d = pointsDone(t), hasNote = S.notes[t.id] && S.notes[t.id].text;
      h += `<div class="topic"><button class="tname" onclick="openTopic('${t.id}')"><span>${esc(t.name)}</span><small>${d}/${n} points${hasNote ? " · 📝 note" : ""}</small></button><div class="lvl">${["Weak", "OK", "Confident"].map((l, i) => `<button class="s${i + 1} ${v == i + 1 ? "on" : ""}" onclick="setLv('${t.id}',${i + 1})">${l}</button>`).join("")}</div></div>`;
    });
    h += `</div></div>`;
  });
  $("cats").innerHTML = h;
  open.forEach(id => $(id) && $(id).classList.add("open"));
  catBars();
  renderSynTop();
}

function renderSynTop() {
  const p = syllabusProgress(), pct = Math.round(p.weighted * 100);
  $("synTop").innerHTML = `<div class="card"><div class="head" style="cursor:default"><h3>Syllabus progress</h3><b style="font-size:1.4rem;color:var(--teal2)">${pct}%</b></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <p class="note" style="margin:8px 0 0">${p.conf} of ${p.total} topics Confident · ${p.pts} of ${p.ptsTotal} learning points ticked.<br>Each category counts by its share of the exam.</p></div>
    <div class="card tip">✅ The <b>official NCSBN 2026 NCLEX-RN Test Plan</b>: ${SYL.categories.length} categories, ${p.total} topics. Tap a category, rate each topic <b>Weak → OK → Confident</b>, and tap a <b>topic name</b> to open its learning points, test-plan activities and your notes.</div>`;
}

/* keep=true: set the rating (don't toggle it off when tapped twice) */
function setLv(k, v, keep) {
  S.lv[k] = !keep && S.lv[k] == v ? 0 : v;
  markActive(); save(); renderCats();
  paintSheetRating(k);
}

function catBars() {
  CATS.forEach(c => {
    let conf = 0, weak = 0, pts = 0, ptsTotal = 0;
    c.topics.forEach(t => { const v = S.lv[t.id]; if (v == 3) conf++; if (v == 1) weak++; ptsTotal += t.learningPoints.length; pts += pointsDone(t); });
    $("b-" + c.id).style.width = (conf / c.topics.length * 100) + "%";
    const st = S.stat[c.id];
    $("p-" + c.id).textContent = `${conf}/${c.topics.length} confident${weak ? ` · ${weak} weak` : ""} · ${pts}/${ptsTotal} points${st ? ` · quiz ${Math.round(st.c / st.n * 100)}%` : ""} · tap to open`;
  });
}

function openCat(cid) {
  pendingScroll = $("c-" + cid);
  if (pendingScroll) pendingScroll.classList.add("open");
  go("learn", "syllabus");
}

/* ---------- topic page (bottom sheet) ---------- */
let sheetTopic = null;

function openTopic(tid, focusNote) {
  const t = TOPIC[tid];
  if (!t) return;
  const c = CAT[t.cat], acts = ACTS[tid] || [], nq = Q.filter(q => q.topic === tid).length, catQ = Q.filter(q => catOf(q) === c.id).length;
  const note = S.notes[tid] ? S.notes[tid].text : "";
  sheetTopic = tid;
  openSheet(sheetHead(esc(t.name)) +
    `<p class="note" style="margin-top:0">${esc(c.name)} · ${esc(c.weightRange)} of the exam</p>
     <div class="lvl" id="tpLvl"></div>
     <h4 class="sub-h">Learning points <span class="note" id="tpCount"></span></h4>
     <div id="tpPoints">${t.learningPoints.map(p => `<label class="check ${S.points[p.id] ? "done" : ""}"><input type="checkbox" ${S.points[p.id] ? "checked" : ""} onchange="togglePoint('${p.id}',this)"><span><b style="font-weight:500">${esc(p.text)}</b>${p.isActivityStatement ? `<small>★ Test plan activity</small>` : ""}</span></label>`).join("")}</div>
     ${acts.length ? `<h4 class="sub-h">Test plan activity statements for this topic</h4><ul class="acts">${acts.map(a => `<li>${esc(a.text)}</li>`).join("")}</ul>` : ""}
     <h4 class="sub-h">My notes</h4>
     <textarea id="noteText" rows="6" placeholder="Key facts, mnemonics, what confuses you…">${esc(note)}</textarea>
     <p class="note">Saved automatically.</p>
     ${nq ? `<button class="btn block" onclick="closeSheet(() => startTopicQuiz('${tid}'))">Practise this topic (${nq} question${nq === 1 ? "" : "s"}) ▶</button>`
          : `<p class="note" style="margin-bottom:6px">No practice questions on this topic yet.</p>${catQ ? `<button class="btn block ghost" onclick="closeSheet(() => startQuiz('${c.id}'))">Practise this category (${catQ}) ▶</button>` : ""}`}`,
    () => { clearTimeout(noteTimer); const ta = $("noteText"); if (ta) saveTopicNote(tid, ta.value); sheetTopic = null; renderCats(); refreshNotesViews(); });
  paintSheetRating(tid);
  paintSheetCount();
  $("noteText").oninput = e => later(() => saveTopicNote(tid, e.target.value));
  if (focusNote) { const ta = $("noteText"); ta.scrollIntoView({ block: "center" }); ta.focus(); }
}
function editTopicNote(tid) { openTopic(tid, true); }

function paintSheetRating(tid) {
  const box = $("tpLvl");
  if (!box || sheetTopic !== tid) return;
  const v = S.lv[tid] || 0;
  box.innerHTML = ["Weak", "OK", "Confident"].map((l, i) => `<button class="s${i + 1} ${v == i + 1 ? "on" : ""}" onclick="setLv('${tid}',${i + 1})">${l}</button>`).join("");
}
function paintSheetCount() {
  const t = TOPIC[sheetTopic];
  if (t && $("tpCount")) $("tpCount").textContent = `${pointsDone(t)}/${t.learningPoints.length} ticked`;
}
function togglePoint(pid, el) {
  if (el.checked) S.points[pid] = true; else delete S.points[pid];
  el.closest(".check").classList.toggle("done", el.checked);
  if (el.checked) markActive();
  save(); paintSheetCount();
}

function startTopicQuiz(tid) {
  const t = TOPIC[tid], pool = Q.filter(q => q.topic === tid);
  if (!pool.length) return;
  qf = t.cat; qt = tid; renderFilter(); // the Practice screen's filter shows the same topic
  runQuiz(shuffle(pool), { cat: t.cat, topic: tid });
}

/* ---------- about the test plan (exam rules, integrated processes, clinical judgment steps) ---------- */
function renderPlanInfo() {
  const e = SYL.exam, b = e.minLengthBreakdown, m = SYL.meta;
  const det = (title, body) => `<details class="item"><summary><b>${esc(title)}</b></summary><p class="note" style="margin:6px 0 0">${esc(body)}</p></details>`;
  $("planInfo").innerHTML = `<div class="card"><h3>📋 About the test plan</h3>
    <p class="note">${esc(m.title)} · in effect ${esc(m.effective)} to ${esc(m.validThrough)}</p>
    <h4 class="sub-h">Exam rules</h4>
    <ul class="acts">
      <li>${e.minItems} to ${e.maxItems} items, up to ${e.timeLimitHours} hours${e.breaksCountTowardTime ? " (breaks count toward the time)" : ""}.</li>
      <li>Shortest exam (${e.minItems}): ${b.contentItems} content items + ${b.caseStudyItems} case-study items (${b.caseStudies} case studies × ${b.itemsPerCaseStudy}) + ${b.pretestItems} unscored pretest items.</li>
      <li>Stand-alone clinical judgment items: ${e.standAloneClinicalJudgmentPercent}%.</li>
      <li>${e.canReturnToPreviousItem ? "You can go back to earlier items." : "You can't go back to an earlier item."} ${e.mustAnswerEveryItem ? "Every item must be answered." : ""}</li>
      <li>Partial-credit scoring: ${e.partialCreditMethods.map(esc).join(", ")}.</li>
      <li>The exam stops by: ${e.stopRules.map(esc).join("; ")}.</li>
    </ul>
    <h4 class="sub-h">Integrated processes</h4>${SYL.integratedProcesses.map(p => det(p.name, p.description)).join("")}
    <h4 class="sub-h">Clinical judgment steps</h4>${SYL.clinicalJudgmentSteps.slice().sort((a, b) => a.order - b.order).map(s => det(s.order + ". " + s.name, s.description)).join("")}
    <p class="note" style="margin-bottom:0">Source: <a href="${esc(m.sourceUrl)}" target="_blank" rel="noopener">official test plan (PDF)</a></p></div>`;
}
