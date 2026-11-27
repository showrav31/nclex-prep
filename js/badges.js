/* Badges. Earned badges are kept in S.badges[badgeId] = date, so they stay earned
   even if, say, a streak later breaks. Never rename a badge id. */

const answered = () => Object.values(S.stat).reduce((s, x) => s + (x.n || 0), 0);
const timerMinutes = () => Object.values(S.study).reduce((s, d) => s + Object.values(d).reduce((a, b) => a + b, 0), 0);
const confidentShare = () => { let t = 0, c = 0; CATS.forEach(k => k.topics.forEach(x => { t++; if (S.lv[x.id] == 3) c++; })); return t ? c / t : 0; };

const BADGES = [
  { id: "first-question", ic: "🌱", name: "First step", desc: "Answer your first question", test: () => answered() >= 1 },
  { id: "questions-100", ic: "💯", name: "100 questions", desc: "Answer 100 questions", test: () => answered() >= 100 },
  { id: "questions-500", ic: "🏆", name: "500 questions", desc: "Answer 500 questions", test: () => answered() >= 500 },
  { id: "streak-7", ic: "🔥", name: "7-day streak", desc: "Study 7 days in a row", test: () => streak() >= 7 },
  { id: "streak-30", ic: "🌟", name: "30-day streak", desc: "Study 30 days in a row", test: () => streak() >= 30 },
  { id: "category-confident", ic: "🎯", name: "Category mastered", desc: "Rate every topic in one category Confident", test: () => CATS.some(c => c.topics.every(t => S.lv[t.id] == 3)) },
  { id: "syllabus-half", ic: "📚", name: "Halfway there", desc: "Half of all topics Confident", test: () => confidentShare() >= .5 },
  { id: "syllabus-all", ic: "🎓", name: "Exam ready", desc: "Every topic Confident", test: () => confidentShare() >= 1 },
  { id: "cards-100", ic: "🃏", name: "Card shark", desc: "Review 100 flashcards", test: () => S.fcReviews >= 100 },
  { id: "first-note", ic: "📝", name: "Note taker", desc: "Write your first note", test: () => Object.keys(S.notes).length > 0 || S.freeNotes.some(n => (n.text || "").trim()) },
  { id: "mistakes-10", ic: "🔁", name: "Learn from mistakes", desc: "Fix 10 mistakes", test: () => Object.values(S.mistakes).filter(m => m.fixed).length >= 10 },
  { id: "timer-10h", ic: "⏱️", name: "10 focused hours", desc: "Log 10 hours with the study timer", test: () => timerMinutes() >= 600 },
  { id: "phase-done", ic: "✅", name: "Phase complete", desc: "Finish every task in a study plan phase", test: () => PHASES.some(p => p.tasks.every(t => S.plan[t.id])) }
];

function checkBadges() {
  if (!CATS.length) return;
  const fresh = BADGES.filter(b => !S.badges[b.id] && b.test());
  if (!fresh.length) return;
  fresh.forEach(b => S.badges[b.id] = dayKey());
  persist();
  toast(`🏅 New badge: <b>${fresh[0].ic} ${fresh[0].name}</b>${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ""}`, 4000);
}

function renderBadges() {
  const got = BADGES.filter(b => S.badges[b.id]).length;
  $("badgeCount").textContent = `${got} of ${BADGES.length}`;
  $("badgeGrid").innerHTML = BADGES.map(b => `<div class="badge ${S.badges[b.id] ? "" : "locked"}"><div class="ic">${b.ic}</div><b>${b.name}</b>${S.badges[b.id] ? `<span class="note">${S.badges[b.id]}</span>` : b.desc}</div>`).join("");
}
