/* My mistakes: every wrong answer is saved in S.mistakes[questionId] with a copy of the
   question and rationale (so it survives even if the question is later edited or removed).
   A later right answer marks it fixed. */

const WHY = [["didnt-know", "Didn't know it"], ["misread", "Misread the question"], ["changed", "Changed my answer"]];
let mkShow = "open";

function recordAnswer(q, ok) {
  const m = S.mistakes[q.id], d = dayKey();
  if (!ok) {
    if (m) Object.assign(m, { n: m.n + 1, last: d, fixed: false, stem: q.stem, rationale: q.rationale, topic: q.topic });
    else S.mistakes[q.id] = { topic: q.topic, stem: q.stem, rationale: q.rationale, first: d, last: d, n: 1, why: "", fixed: false };
  } else if (m && !m.fixed) { m.fixed = true; m.fixedOn = d; }
}

function whyChips(qid) {
  const m = S.mistakes[qid];
  if (!m) return "";
  return `<div class="why" data-why="${qid}"><span class="note" style="width:100%">Why did you miss it?</span>${WHY.map(([k, l]) => `<button class="chip ${m.why === k ? "on" : ""}" onclick="event.stopPropagation();setWhy('${qid}','${k}')">${l}</button>`).join("")}</div>`;
}

function setWhy(qid, k) {
  const m = S.mistakes[qid];
  if (!m) return;
  m.why = m.why === k ? "" : k;
  save();
  document.querySelectorAll(`[data-why="${qid}"]`).forEach(el => el.outerHTML = whyChips(qid));
}

function openMistakes() { return Object.keys(S.mistakes).filter(id => !S.mistakes[id].fixed && Q.some(q => q.id === id)); }

function retryMistakes() {
  const ids = openMistakes();
  if (!ids.length) return toast("No mistakes to retry. 🎉");
  runQuiz(shuffle(ids.map(id => Q.find(q => q.id === id))).slice(0, 20), { mode: "retry", cat: "" });
}

function renderMistakes() {
  const all = Object.entries(S.mistakes).sort((a, b) => (b[1].last || "").localeCompare(a[1].last || ""));
  const open = all.filter(([, m]) => !m.fixed);
  $("mkFilter").innerHTML = [["open", `Not fixed yet (${open.length})`], ["all", `All (${all.length})`]].map(([k, l]) => `<button class="chip ${mkShow === k ? "on" : ""}" onclick="mkShow='${k}';renderMistakes()">${l}</button>`).join("");
  const n = openMistakes().length;
  $("mkRetry").disabled = !n;
  $("mkRetry").textContent = n ? `Retry my mistakes (${Math.min(n, 20)}) ▶` : "Retry my mistakes";
  const list = (mkShow === "open" ? open : all).slice(0, 100);
  $("mkList").innerHTML = list.length ? list.map(([id, m]) => `<div class="item">
      <div class="meta">${TOPIC[m.topic] ? esc(TOPIC[m.topic].name) : "Old topic"} · wrong ${m.n}× · last ${m.last}${m.fixed ? ` · <b style="color:var(--teal2)">✔ fixed</b>` : ""}</div>
      <div style="margin-top:4px">${m.stem}</div>
      <details><summary>Show rationale</summary><div class="rat">${m.rationale}</div></details>
      ${whyChips(id)}</div>`).join("")
    : `<p class="empty">${all.length ? "All mistakes fixed! 🎉" : "No mistakes yet. Wrong answers from quizzes show up here."}</p>`;
}
