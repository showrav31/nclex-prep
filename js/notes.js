/* Notes: one per syllabus topic (S.notes[topicId]) plus free notes (S.freeNotes), with search.
   Typing saves automatically (debounced, and again when the note is closed). */

let noteTimer = null;
const nowIso = () => new Date().toISOString();
function later(fn) { clearTimeout(noteTimer); noteTimer = setTimeout(fn, 500); }

function saveTopicNote(tid, text) {
  const old = S.notes[tid];
  if (!text.trim()) { if (old) { delete S.notes[tid]; save(); } return; }
  if (old && old.text === text) return;
  S.notes[tid] = { text, updated: nowIso() };
  save();
}

function editFreeNote(id) {
  let n = S.freeNotes.find(x => x.id === id);
  if (!n) { n = { id: "note-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: "", text: "", updated: nowIso() }; S.freeNotes.push(n); }
  const nid = n.id;
  openSheet(sheetHead("📝 My note") +
    `<input id="fnTitle" type="text" placeholder="Title" maxlength="120" value="${esc(n.title)}" style="width:100%;margin-bottom:8px">
     <textarea id="fnText" rows="10" placeholder="Write anything…">${esc(n.text)}</textarea>
     <div class="row" style="justify-content:space-between"><span class="note">Saved automatically.</span><button class="btn ghost small" onclick="deleteFreeNote('${nid}')">Delete note</button></div>`,
    () => { clearTimeout(noteTimer); const t = $("fnTitle"); if (t) saveFreeNote(nid, t.value, $("fnText").value); refreshNotesViews(); });
  const upd = () => later(() => saveFreeNote(nid, $("fnTitle").value, $("fnText").value));
  $("fnTitle").oninput = upd; $("fnText").oninput = upd;
  if (!n.text) $("fnTitle").focus();
}

function saveFreeNote(id, title, text) {
  const i = S.freeNotes.findIndex(x => x.id === id);
  if (i < 0) return;
  if (!title.trim() && !text.trim()) { S.freeNotes.splice(i, 1); save(); return; } // empty: don't keep
  const n = S.freeNotes[i];
  if (n.title === title && n.text === text) return;
  Object.assign(n, { title, text, updated: nowIso() });
  save();
}

function deleteFreeNote(id) {
  if (!confirm("Delete this note?")) return;
  S.freeNotes = S.freeNotes.filter(x => x.id !== id);
  save();
  closeSheet();
}

function refreshNotesViews() { if ($("notes").classList.contains("on")) renderNotes(); if ($("home").classList.contains("on")) renderTask(); }

function renderNotes() {
  const q = $("noteSearch").value.trim().toLowerCase();
  const items = Object.entries(S.notes).map(([tid, n]) => ({ title: TOPIC[tid] ? TOPIC[tid].name : "Old topic", kind: TOPIC[tid] ? "Topic · " + CAT[TOPIC[tid].cat].short : "Topic note", text: n.text, updated: n.updated, open: TOPIC[tid] ? `editTopicNote('${tid}')` : "" }))
    .concat(S.freeNotes.map(n => ({ title: n.title || "Untitled", kind: "My note", text: n.text, updated: n.updated, open: `editFreeNote('${n.id}')` })))
    .filter(n => !q || (n.title + " " + n.text).toLowerCase().includes(q))
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
  const fmt = d => d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
  $("noteList").innerHTML = items.length ? items.map(n => `<div class="item" ${n.open ? `onclick="${n.open}" style="cursor:pointer"` : ""}><b>${esc(n.title)}</b> <span class="meta">${n.kind} · ${fmt(n.updated)}</span><div class="snip">${esc(n.text)}</div></div>`).join("")
    : `<p class="empty">${q ? "No notes match your search." : "No notes yet. Tap ＋ New note, or 📝 next to any topic in the Syllabus."}</p>`;
}
document.getElementById("noteSearch").addEventListener("input", renderNotes);
