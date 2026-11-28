/* Question types: loading, drawing, answering and scoring.
   Types: mcq, sata, matrix, trend, dropdown, highlight, dragdrop (order | sort), bowtie.

   Partial credit (see CLAUDE.md):
   - mcq: 1 point, all or nothing.
   - sata, highlight: plus/minus. Each correct choice +1, each wrong choice -1, never below 0. Max = number of correct choices.
   - matrix, trend, dragdrop sort: 1 point per row/item answered correctly.
   - dropdown: 1 point per box.
   - dragdrop order: 1 point per item in the correct position.
   - bowtie: 1 point per correct choice (1 condition + the actions + the parameters); wrong choices score 0 but do not subtract.
   - numeric (calculation): 1 point, all or nothing. The typed number is accepted if it equals the key, or if it is a more
     precise number that rounds to the key under the question's stated rounding rule (q.rounding.decimals).
   A question counts as "correct" (stats, streaks, mistakes) only when every point is earned. */

/* ---------- text helpers ---------- */
/* Question text is plain text; **bold** is allowed. Everything else is escaped. */
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
/* Older questions and saved mistakes contain <b>/<i> tags: turn them into the plain format. */
const legacyHtml = s => String(s == null ? "" : s).replace(/<b>(.*?)<\/b>/g, "**$1**").replace(/<\/?i>/g, "");
const letter = i => String.fromCharCode(65 + i);

/* ---------- numbers (calculation questions) ---------- */
/* Typed text to a number, or null. Accepts "7", "7.0", "7,5" (decimal comma) and "1,200" (thousands comma). */
function parseNum(s) {
  let t = String(s == null ? "" : s).trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  else t = t.replace(",", ".");
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : null;
}
const roundTo = (x, decimals) => Number(Math.round(Number(x + "e" + decimals)) + "e-" + decimals); // half up; same as tests/calc.js
const sameNum = (a, b, decimals) => a !== null && b !== null && Math.abs(roundTo(a, decimals) - roundTo(b, decimals)) < 1e-9;
const numericOk = (q, typed) => sameNum(parseNum(typed), q.key, q.rounding.decimals);
/* A typed wrong answer that matches a known slip (wrong conversion, forgot a step...). */
const commonSlip = (q, typed) => (q.commonErrors || []).find(e => sameNum(parseNum(typed), e.value, q.rounding.decimals));

/* Bring a question from either file format into one shape. Adds q.topic as an alias of q.topicId. */
function normQ(raw) {
  const q = { ...raw };
  if (q.topicId === undefined) { // the original format of data/questions.json
    q.topicId = q.topic;
    if (q.type === "mcq") q.key = q.answer[0]; else if (q.type === "sata") q.key = q.answer;
    if (q.type === "matrix") q.rows = q.rows.map(r => ({ text: legacyHtml(r.text), key: r.answer }));
    delete q.answer;
    q.options = q.options && q.options.map(legacyHtml);
    q.cols = q.cols && q.cols.map(legacyHtml);
    q.stem = legacyHtml(q.stem); q.rationale = legacyHtml(q.rationale);
  }
  q.topic = q.topicId;
  return q;
}

const kindOf = q => q.type === "numeric" ? "numeric" : q.type === "dragdrop" ? (q.mode === "sort" ? "sort" : "order") : q.type === "trend" ? "matrix" : q.type;
const TYPE_NAME = { mcq: "Multiple choice", sata: "Select all that apply", matrix: "Matrix (Next Gen)", trend: "Trend (Next Gen)", dropdown: "Drop-down (Next Gen)", highlight: "Highlight (Next Gen)", order: "Ordering (Next Gen)", sort: "Drag & drop sort (Next Gen)", bowtie: "Bowtie (Next Gen)", numeric: "Calculation" };
const TYPE_HINT = {
  mcq: "Choose 1 answer.", sata: "Choose all the answers that apply.", matrix: "Choose one answer in each row.",
  dropdown: "Choose an answer for each box. The sentence fills in as you go.", highlight: "Tap the statements that apply. Tap again to undo.",
  order: "Tap the items in the order you think is correct.", sort: "Choose a group for each item.", bowtie: "Choose the condition, the actions and the parameters to monitor.",
  numeric: "Type the number only. The unit is shown next to the box. Round only the final answer, as the question says."
};
const typeName = q => q.type === "trend" ? TYPE_NAME.trend : TYPE_NAME[kindOf(q)];

/* ---------- answer state ---------- */
const initSel = q => kindOf(q) === "bowtie" ? { c: [], a: [], p: [] } : [];
const keyList = q => q.type === "mcq" ? [q.key] : q.key;
const hlKeys = q => q.segments.map((s, i) => s.key === true ? i : -1).filter(i => i >= 0);

function isReady(q, sel) {
  switch (kindOf(q)) {
    case "mcq": return sel.length === 1;
    case "sata": return sel.length > 0;
    case "matrix": return q.rows.every((_, i) => sel[i] !== undefined);
    case "sort": return q.items.every((_, i) => sel[i] !== undefined);
    case "dropdown": return q.blanks.every((_, i) => sel[i] !== undefined);
    case "highlight": return sel.length > 0;
    case "order": return sel.length === q.items.length;
    case "bowtie": return sel.c.length === 1 && sel.a.length === q.actions.keys.length && sel.p.length === q.parameters.keys.length;
    case "numeric": return parseNum(sel[0]) !== null;
  }
  return false;
}

/* Returns {got, max}. Fully correct when got === max. */
function scoreQ(q, sel) {
  const plusMinus = (picked, keys) => { const hit = picked.filter(x => keys.includes(x)).length; return Math.max(0, hit - (picked.length - hit)); };
  switch (kindOf(q)) {
    case "mcq": return { got: sel[0] === q.key ? 1 : 0, max: 1 };
    case "sata": return { got: plusMinus(sel, q.key), max: q.key.length };
    case "matrix": return { got: q.rows.filter((r, i) => sel[i] === r.key).length, max: q.rows.length };
    case "sort": return { got: q.items.filter((r, i) => sel[i] === r.key).length, max: q.items.length };
    case "dropdown": return { got: q.blanks.filter((b, i) => sel[i] === b.key).length, max: q.blanks.length };
    case "highlight": return { got: plusMinus(sel, hlKeys(q)), max: hlKeys(q).length };
    case "order": return { got: q.key.filter((item, pos) => sel[pos] === item).length, max: q.key.length };
    case "numeric": return { got: numericOk(q, sel[0]) ? 1 : 0, max: 1 };
    case "bowtie": {
      const hit = (picked, keys) => picked.filter(x => keys.includes(x)).length;
      return { got: hit(sel.c, [q.condition.key]) + hit(sel.a, q.actions.keys) + hit(sel.p, q.parameters.keys), max: 1 + q.actions.keys.length + q.parameters.keys.length };
    }
  }
  return { got: 0, max: 1 };
}

/* ---------- drawing ---------- */
function exhibitHtml(e) {
  const body = e.text ? `<p style="margin:6px 0 0">${fmt(e.text)}</p>`
    : `<div class="scroll"><table class="exh ${e.columns.length === 2 ? "two" : ""}"><tr>${e.columns.map(c => `<th>${fmt(c)}</th>`).join("")}</tr>${e.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${fmt(c)}</td>` : `<th>${fmt(c)}</th>`).join("")}</tr>`).join("")}</table></div>`;
  return `<div class="exhibit"><b>📋 ${fmt(e.title || "Client data")}</b>${body}</div>`;
}

function gridHtml(cols, rows, z) { // rows: [{text, key}]
  return `<div class="scroll"><table class="matrix"><tr><th></th>${cols.map(c => `<th style="text-align:center">${fmt(c)}</th>`).join("")}</tr>${rows.map((r, ri) => `<tr><td>${fmt(r.text)}</td>${cols.map((_, ci) => {
    let cls = ""; if (z.sub && ci === r.key) cls = "right"; else if (z.sub && z.sel[ri] === ci) cls = "wrong";
    return `<td class="${cls}"><input type="radio" name="m${ri}" aria-label="${esc(cols[ci])}" ${z.sel[ri] === ci ? "checked" : ""} ${z.sub ? "disabled" : ""} onchange="qCell(${ri},${ci})"></td>`;
  }).join("")}</tr>`).join("")}</table></div>`;
}

const BODY = {
  mcq: (q, z) => q.options.map((o, oi) => {
    let cls = z.sel.includes(oi) ? "sel" : "";
    if (z.sub) { if (keyList(q).includes(oi)) cls = "right"; else if (z.sel.includes(oi)) cls = "wrong"; }
    return `<div class="opt ${cls}" onclick="qPick(${oi})"><span class="k">${q.type === "sata" ? (z.sel.includes(oi) ? "☑" : "☐") : letter(oi)}</span><span>${fmt(o)}</span></div>`;
  }).join(""),
  sata: (q, z) => BODY.mcq(q, z),
  matrix: (q, z) => gridHtml(q.cols, q.rows, z),
  sort: (q, z) => gridHtml(q.bins, q.items, z),
  dropdown: (q, z) => {
    const sentence = q.template.split(/(\{\d+\})/).map(part => {
      const m = part.match(/^\{(\d+)\}$/);
      if (!m) return fmt(part);
      const bi = +m[1] - 1, b = q.blanks[bi], chosen = z.sel[bi];
      const cls = z.sub ? (chosen === b.key ? "right" : "wrong") : (chosen === undefined ? "" : "set");
      return `<span class="slot ${cls}">${chosen === undefined ? `[ box ${bi + 1} ]` : esc(b.options[chosen])}</span>`;
    }).join("");
    const boxes = q.blanks.map((b, bi) => `<div class="bowpart"><h4 class="sub-h">Box ${bi + 1}</h4>${b.options.map((o, oi) => {
      let cls = z.sel[bi] === oi ? "sel" : "";
      if (z.sub) { if (oi === b.key) cls = "right"; else if (z.sel[bi] === oi) cls = "wrong"; }
      return `<div class="opt ${cls}" onclick="qDrop(${bi},${oi})"><span class="k">${z.sel[bi] === oi ? "●" : "○"}</span><span>${fmt(o)}</span></div>`;
    }).join("")}</div>`).join("");
    return `<div class="case blankline">${sentence}</div>${boxes}`;
  },
  highlight: (q, z) => `<div class="case hlbox">${q.segments.map((s, si) => {
    if (s.key === undefined) return esc(s.text);
    const on = z.sel.includes(si);
    let cls = on ? "hl" : "";
    if (z.sub) cls = s.key && on ? "right" : s.key ? "miss" : on ? "wrong" : "";
    return `<span class="hlw ${cls}" onclick="qHl(${si})">${fmt(s.text)}</span>`;
  }).join("")}</div>`,
  order: (q, z) => {
    const left = q.items.map((_, i) => i).filter(i => !z.sel.includes(i));
    let h = `<div class="case"><b>Your order</b>${z.sel.length ? `<ol class="ord">${z.sel.map((ii, pos) => {
      const cls = z.sub ? (ii === q.key[pos] ? "right" : "wrong") : "";
      return `<li class="${cls}">${fmt(q.items[ii].text)}${z.sub ? "" : ` <button class="iconbtn" aria-label="Remove this item" onclick="qOrdRemove(${pos})">✕</button>`}</li>`;
    }).join("")}</ol>` : `<p class="note" style="margin:6px 0 0">Nothing chosen yet. Tap the items below.</p>`}</div>`;
    if (!z.sub && left.length) h += `<div class="note" style="margin:8px 0 4px">Tap the item that comes next:</div>` + left.map(i => `<div class="opt" onclick="qOrd(${i})"><span class="k">＋</span><span>${fmt(q.items[i].text)}</span></div>`).join("");
    if (!z.sub && z.sel.length) h += `<button class="chip" onclick="qOrdReset()">↺ Start over</button>`;
    return h;
  },
  numeric: (q, z) => `<div class="numrow"><input id="numIn" class="numin ${z.sub ? (z.last ? "right" : "wrong") : ""}" type="text" inputmode="decimal" autocomplete="off" aria-label="Your answer" value="${esc(z.sel[0] === undefined ? "" : z.sel[0])}" ${z.sub ? "disabled" : ""} oninput="qNum(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();submitQ()}"><span class="unit">${esc(q.unit)}</span></div>`,
  bowtie: (q, z) => [["a", q.actions, q.actions.keys, "Actions"], ["c", q.condition, [q.condition.key], "Condition"], ["p", q.parameters, q.parameters.keys, "Parameters"]].map(([part, p, keys]) =>
    `<div class="bowpart"><h4 class="sub-h">${fmt(p.prompt)} · ${z.sel[part].length} of ${keys.length} chosen</h4>${p.options.map((o, oi) => {
      let cls = z.sel[part].includes(oi) ? "sel" : "";
      if (z.sub) { if (keys.includes(oi)) cls = "right"; else if (z.sel[part].includes(oi)) cls = "wrong"; }
      return `<div class="opt ${cls}" onclick="qBow('${part}',${oi})"><span class="k">${z.sel[part].includes(oi) ? "☑" : "☐"}</span><span>${fmt(o)}</span></div>`;
    }).join("")}</div>`).join("")
};

/* Explanation of every choice, shown after answering. Older questions have none. */
function whyItems(q) {
  const li = (mark, title, why) => `<div class="why1"><b>${mark} ${fmt(title)}</b>${why ? `<div>${fmt(why)}</div>` : ""}</div>`;
  switch (kindOf(q)) {
    case "mcq": case "sata": return q.optionRationales ? q.options.map((o, i) => li(keyList(q).includes(i) ? "✔" : "✘", (q.type === "mcq" ? letter(i) + ". " : "") + o, q.optionRationales[i])) : [];
    case "matrix": return q.rows[0].why ? q.rows.map(r => li("✔", `${r.text} → ${q.cols[r.key]}`, r.why)) : [];
    case "sort": return q.items.map(it => li("✔", `${it.text} → ${q.bins[it.key]}`, it.why));
    case "order": return q.key.map((ii, pos) => li(`${pos + 1}.`, q.items[ii].text, q.items[ii].why));
    case "dropdown": return q.blanks.map((b, bi) => li("✔", `Box ${bi + 1}: ${b.options[b.key]}`, b.why));
    case "highlight": return q.segments.filter(s => s.key !== undefined).map(s => li(s.key ? "✔ Highlight:" : "✘ Do not highlight:", s.text, s.why));
    case "numeric": return [li("📐", "Formula: " + q.calc.formula, "")]
      .concat(q.calc.steps.map(st => li("•", `${st.label}: ${st.show}`, "")))
      .concat((q.commonErrors || []).map(e => li("✘", `${fmtVal(e.value, q)} ${q.unit}`, "This is what you get if " + e.why)));
    case "bowtie": return [["Condition", q.condition, [q.condition.key]], ["Actions", q.actions, q.actions.keys], ["Parameters", q.parameters, q.parameters.keys]]
      .flatMap(([name, p, keys]) => [`<h4 class="sub-h">${name}</h4>`].concat(p.options.map((o, i) => li(keys.includes(i) ? "✔" : "✘", o, p.optionRationales[i]))));
  }
  return [];
}

const fmtVal = (v, q) => String(roundTo(v, q.rounding.decimals));

/* Notes for questions flagged needsReview. "regional": the NCLEX model may differ from provincial/Canadian practice
   (the detail is in the rationale). Anything else (reviewKind "clinical"): real doubt about the clinical answer. */
const reviewTop = q => !q.needsReview ? "" : q.reviewKind === "regional"
  ? `<div class="qnote">ℹ️ NCLEX model: provincial rules may differ. The detail is in the rationale.</div>`
  : `<div class="qreview">⚠️ Waiting for a clinical check. Treat this answer with care.</div>`;
const reviewEnd = q => q.needsReview && q.reviewKind !== "regional" ? `<p class="note">⚠️ This question is waiting for a clinical check.</p>` : "";

function reviewHtml(q, z) {
  const banner = z.last ? "✔ Correct" : `✘ Not quite${z.pts.got > 0 && z.pts.max > 1 ? ` · partial credit ${z.pts.got}/${z.pts.max}` : ""}`;
  const items = whyItems(q), isNum = q.type === "numeric", slip = isNum && !z.last ? commonSlip(q, z.sel[0]) : null;
  return `<div class="rat"><b class="${z.last ? "ok" : "no"}">${banner}</b>${isNum ? `<br>Answer: <b>${fmtVal(q.key, q)} ${esc(q.unit)}</b>${slip ? `<br><i>Your answer is what you get if ${fmt(slip.why)}</i>` : ""}` : ""}<br>${fmt(q.rationale)}</div>` +
    (items.length ? `<details class="whyall" ${z.last && !isNum ? "" : "open"}><summary>${isNum ? "Working and common slips" : "Why each choice is right or wrong"}</summary>${items.join("")}</details>` : "") +
    reviewEnd(q);
}

function drawQ() {
  const z = QZ;
  if (z.i >= z.list.length) return finishQuiz();
  const q = z.list[z.i], k = kindOf(q);
  if (z.selFor !== z.i) { z.sel = initSel(q); z.selFor = z.i; }
  let h = `<div class="qmeta"><span>Question ${z.i + 1} of ${z.list.length} · Score ${z.score}</span><span><span class="qtype">${typeName(q)}</span> · ${esc(CAT[catOf(q)].short)} · ${esc(TOPIC[q.topic].name)}</span></div>`;
  h += reviewTop(q);
  h += `<div class="bar" style="margin:0 0 12px"><i style="width:${z.i / z.list.length * 100}%"></i></div><div class="stem">${fmt(q.stem)}</div>`;
  if (q.exhibit) h += exhibitHtml(q.exhibit);
  h += `<p class="qhint">${TYPE_HINT[k]}</p>${BODY[k](q, z)}`;
  if (z.sub) h += reviewHtml(q, z) + `<div class="row"><button class="btn" onclick="nextQ()">${z.i + 1 < z.list.length ? "Next question →" : "See results"}</button></div>`;
  else h += `<div class="row"><button class="btn" id="qSubmit" ${isReady(q, z.sel) ? "" : "disabled"} onclick="submitQ()">Submit</button></div>`;
  $("quiz").innerHTML = h;
}

/* ---------- answering ---------- */
const live = () => (QZ && !QZ.sub) ? QZ : null;
function qPick(oi) { const z = live(); if (!z) return; const q = z.list[z.i]; z.sel = q.type === "mcq" ? [oi] : z.sel.includes(oi) ? z.sel.filter(x => x !== oi) : [...z.sel, oi]; drawQ(); }
function qCell(ri, ci) { const z = live(); if (!z) return; z.sel[ri] = ci; drawQ(); }
function qDrop(bi, oi) { const z = live(); if (!z) return; z.sel[bi] = oi; drawQ(); }
function qHl(si) { const z = live(); if (!z) return; z.sel = z.sel.includes(si) ? z.sel.filter(x => x !== si) : [...z.sel, si]; drawQ(); }
function qOrd(ii) { const z = live(); if (!z || z.sel.includes(ii)) return; z.sel = [...z.sel, ii]; drawQ(); }
function qOrdRemove(pos) { const z = live(); if (!z) return; z.sel = z.sel.filter((_, p) => p !== pos); drawQ(); }
function qOrdReset() { const z = live(); if (!z) return; z.sel = []; drawQ(); }
/* Typing a number: keep the input as it is (no redraw, so the keyboard stays open) and just switch Submit on or off. */
function qNum(v) { const z = live(); if (!z) return; z.sel = [v]; const b = $("qSubmit"); if (b) b.disabled = !isReady(z.list[z.i], z.sel); }
function qBow(part, oi) {
  const z = live(); if (!z) return;
  const q = z.list[z.i], max = part === "c" ? 1 : (part === "a" ? q.actions.keys.length : q.parameters.keys.length), cur = z.sel[part];
  if (cur.includes(oi)) z.sel[part] = cur.filter(x => x !== oi);
  else if (part === "c") z.sel[part] = [oi];
  else if (cur.length < max) z.sel[part] = [...cur, oi];
  else return toast(`Choose only ${max}. Tap one you chose to take it off.`);
  drawQ();
}

function submitQ() {
  const z = live(); if (!z) return;
  const q = z.list[z.i];
  if (!isReady(q, z.sel)) return;
  const pts = scoreQ(q, z.sel), ok = pts.got === pts.max;
  z.sub = true; z.last = ok; z.pts = pts;
  if (ok) z.score++;
  const cid = catOf(q), st = S.stat[cid] || (S.stat[cid] = { n: 0, c: 0 });
  st.n++; if (ok) st.c++;
  if (!ok) { const k = q.topic; if (!S.lv[k] || S.lv[k] == 2) S.lv[k] = 1; }
  recordAnswer(q, ok);
  markActive(); save(); drawQ();
  const r = $("quiz").querySelector(".rat"); if (r) r.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function nextQ() { QZ.i++; QZ.sub = false; drawQ(); $("quiz").scrollIntoView({ block: "start" }); }
