/* Flashcards with spaced repetition (Again / Hard / Good / Easy).
   Decks are built from data/reference.json + data/exam-guide.json; her own cards are S.myCards.
   Each card's progress is S.cards[cardId] = {due, ivl, ease, reps, lapses}; cardId is the item's
   fixed ID from the data (e.g. "lab-sodium"), so editing or reordering content keeps progress. */

const NEW_PER_DAY = 10; // new cards introduced per day, so reviews never pile up
let STATIC_DECKS = null, FC = null;

function staticDecks() {
  if (STATIC_DECKS) return STATIC_DECKS;
  STATIC_DECKS = [
    { id: "labs", icon: "🧪", name: "Lab values", cards: REF.labs.map(l => ({ id: l.id, front: `Normal range: <b>${l.name}</b>?`, back: l.range })) },
    { id: "drugs", icon: "💊", name: "Drug suffixes → class", cards: REF.drugs.map(d => ({ id: d.id, front: `Drug ending <b>${d.suffix}</b>: which class?`, back: d.cls })) },
    { id: "antidotes", icon: "⚠️", name: "High-alert meds & antidotes", cards: REF.highAlert.map(d => ({ id: d.id, front: `<b>${d.drug}</b>: antidote or reversal?`, back: `<b>${d.antidote}</b><br><small>${d.watch}</small>` })) },
    { id: "isolation", icon: "😷", name: "Isolation precautions", cards: REF.isolation.map(r => ({ id: r.id, front: `<b>${r.type}</b> precautions: examples and PPE?`, back: `${r.examples}<br><small>${r.ppe}</small>` })) },
    { id: "priority", icon: "⚡", name: "Priority rules", cards: GUIDE.priority.map(p => ({ id: p.id, front: `Priority rule: <b>${p.rule}</b>`, back: p.detail })) },
    { id: "vitals", icon: "❤️", name: "Normal vital signs by age", cards: REF.vitals.map(v => ({ id: v.id, front: `Normal heart rate and breathing rate: <b>${v.age}</b>?`, back: `HR ${v.hr} · RR ${v.rr}${v.more ? `<br><small>${v.more}</small>` : ""}` })) }
  ];
  return STATIC_DECKS;
}
function allDecks() {
  return staticDecks().concat([{ id: "mine", icon: "✏️", name: "My cards", cards: S.myCards.map(c => ({ id: c.id, front: esc(c.front), back: esc(c.back) })) }]);
}

function addDays(d, n) { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return dayKey(x); }
function newLeft() { return S.fcNew.d === dayKey() ? Math.max(0, NEW_PER_DAY - S.fcNew.n) : NEW_PER_DAY; }
function splitDeck(deck) {
  const t = dayKey(), due = [], fresh = [];
  deck.cards.forEach(c => { const st = S.cards[c.id]; if (!st) fresh.push(c); else if (st.due <= t) due.push(c); });
  return { due, fresh };
}
/* Cards to study today: everything due + today's allowance of new cards. */
function dueCount() {
  let due = 0, fresh = 0;
  allDecks().forEach(d => { const s = splitDeck(d); due += s.due.length; fresh += s.fresh.length; });
  return due + Math.min(fresh, newLeft());
}

/* SM-2 style scheduling. g: 1 Again, 2 Hard, 3 Good, 4 Easy. */
function schedule(st, g) {
  const s = Object.assign({ ivl: 0, ease: 2.5, reps: 0, lapses: 0 }, st);
  if (g === 1) { s.lapses++; s.reps = 0; s.ivl = 0; s.ease = Math.max(1.3, s.ease - .2); }
  else if (g === 2) { s.ivl = s.reps === 0 ? 1 : Math.max(1, Math.round(s.ivl * 1.2)); s.ease = Math.max(1.3, s.ease - .15); s.reps++; }
  else if (g === 3) { s.ivl = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.ivl * s.ease); s.reps++; }
  else { s.ivl = s.reps === 0 ? 4 : Math.round(Math.max(s.ivl, 1) * s.ease * 1.3); s.ease += .15; s.reps++; }
  s.ivl = Math.min(s.ivl, 365);
  s.due = addDays(dayKey(), s.ivl);
  return s;
}
const ivlLabel = d => d === 0 ? "again now" : d < 30 ? d + (d === 1 ? " day" : " days") : d < 365 ? Math.round(d / 30) + " mo" : "1 year";

function startCards(deckId) {
  const decks = deckId === "all" ? allDecks() : allDecks().filter(d => d.id === deckId);
  let due = [], fresh = [];
  decks.forEach(d => { const s = splitDeck(d); due = due.concat(s.due); fresh = fresh.concat(s.fresh); });
  const queue = shuffle(due).concat(fresh.slice(0, newLeft()));
  FC = { deck: deckId, queue, i: 0, shown: false, done: 0 };
  drawCard();
  $("fcStudy").scrollIntoView({ block: "start" });
}

function drawCard() {
  const box = $("fcStudy");
  if (!FC || FC.i >= FC.queue.length) {
    const n = dueCount(), finished = FC && FC.done;
    box.innerHTML = `<h3>🃏 Flashcards</h3>${finished ? `<p>🎉 Session done: <b>${FC.done}</b> card${FC.done === 1 ? "" : "s"} reviewed.</p>` : ""}
      <p class="note">${n ? `<b>${n}</b> card${n === 1 ? "" : "s"} to study today (up to ${NEW_PER_DAY} new cards a day).` : "Nothing due right now. Come back tomorrow, or add your own cards below."}</p>
      ${n ? `<button class="btn block" onclick="startCards('all')">Study all due cards ▶</button>` : ""}`;
    FC = null;
    return;
  }
  const c = FC.queue[FC.i], st = S.cards[c.id];
  let h = `<div class="qmeta"><span>Card ${FC.i + 1} of ${FC.queue.length}${st ? "" : " · new"}</span><a href="#" onclick="event.preventDefault();FC.i=FC.queue.length;drawCard()">End session</a></div>
    <div class="fcard"><div class="front">${c.front}</div>${FC.shown ? `<div class="back">${c.back}</div>` : ""}</div>`;
  if (!FC.shown) h += `<button class="btn block" onclick="FC.shown=true;drawCard()">Show answer</button>`;
  else h += `<div class="grades">${[["Again", 1], ["Hard", 2], ["Good", 3], ["Easy", 4]].map(([l, g]) => `<button class="g${g}" onclick="gradeCard(${g})">${l}<small>${ivlLabel(schedule(st, g).ivl)}</small></button>`).join("")}</div>`;
  box.innerHTML = h;
}

function gradeCard(g) {
  const c = FC.queue[FC.i], t = dayKey();
  if (!S.cards[c.id]) { if (S.fcNew.d !== t) S.fcNew = { d: t, n: 0 }; S.fcNew.n++; }
  S.cards[c.id] = schedule(S.cards[c.id], g);
  S.fcReviews++;
  if (g === 1) FC.queue.push(c); // see it again before the session ends
  FC.i++; FC.done++; FC.shown = false;
  markActive(); save();
  drawCard(); renderDecks();
}

function renderDecks() {
  $("fcDecks").innerHTML = allDecks().map(d => {
    const s = splitDeck(d), n = s.due.length + Math.min(s.fresh.length, newLeft());
    return `<div class="deck"><div>${d.icon} <b>${d.name}</b><div class="note">${d.cards.length} cards · ${s.due.length} due · ${s.fresh.length} new</div></div>${n ? `<button class="btn ghost small" onclick="startCards('${d.id}')">Study ${n}</button>` : `<span class="note">✔ done</span>`}</div>`;
  }).join("");
}

function renderMyCards() {
  $("fcMine").innerHTML = S.myCards.length ? S.myCards.slice().reverse().map(c => `<div class="item"><b>${esc(c.front)}</b><div class="snip">${esc(c.back)}</div><button class="btn ghost small" style="margin-top:6px" onclick="deleteMyCard('${c.id}')">Delete</button></div>`).join("") : `<p class="note">No cards yet. Add one above: anything you keep forgetting.</p>`;
}

function addMyCard() {
  const f = $("fcFront").value.trim(), b = $("fcBack").value.trim();
  if (!f || !b) return toast("Write both the front and the back of the card.");
  S.myCards.push({ id: "my-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), front: f, back: b, created: dayKey() });
  $("fcFront").value = ""; $("fcBack").value = "";
  save(); renderCards(); toast("Card added ✔");
}

function deleteMyCard(id) {
  if (!confirm("Delete this card?")) return;
  S.myCards = S.myCards.filter(c => c.id !== id);
  delete S.cards[id];
  save(); renderCards();
}

function renderCards() { if (!FC) drawCard(); renderDecks(); renderMyCards(); }
