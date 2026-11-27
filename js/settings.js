/* Settings: dark mode, text size, backup (download / copy), restore, reset.
   Restore and reset always keep a safety copy of the current progress first. */

const THEMES = [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]];
const SIZES = [[1, "Normal"], [1.12, "Large"], [1.25, "Extra large"]];

function applyLook() {
  const r = document.documentElement;
  if (S.theme === "light" || S.theme === "dark") r.dataset.theme = S.theme; else delete r.dataset.theme;
  r.style.fontSize = (S.textSize || 1) * 100 + "%";
}
applyLook(); // straight away, before the app shows

function renderLook() {
  choiceChips("optTheme", S.theme, v => { S.theme = v; applyLook(); save(); }, THEMES);
  choiceChips("optText", S.textSize, v => { S.textSize = v; applyLook(); save(); }, SIZES);
}

/* ---------- backup ---------- */
function backupText() { return JSON.stringify({ app: "nclex-prep", exported: new Date().toISOString(), data: S }); }

function exportDownload() {
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([backupText()], { type: "application/json" }));
    a.download = `nclex-backup-${dayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast("Backup saved to Downloads ✔ If nothing appeared, use Copy backup.", 5000);
  } catch (e) { exportCopy(); }
}

async function exportCopy() {
  const t = backupText();
  try {
    await navigator.clipboard.writeText(t);
    toast("Backup copied ✔ Paste it somewhere safe, e.g. a message or email to yourself.", 5000);
  } catch (e) { // clipboard blocked: show the text so she can copy it by hand
    openSheet(sheetHead("Copy your backup") + `<p class="note" style="margin-top:0">Select all of this text, copy it, and paste it somewhere safe.</p><textarea id="bkText" rows="8" readonly>${esc(t)}</textarea>`);
    const ta = $("bkText"); ta.focus(); ta.select();
    try { if (document.execCommand("copy")) toast("Backup copied ✔"); } catch (e2) {}
  }
}

/* Accepts this app's backup wrapper or a raw saved-progress object. */
function parseBackup(txt) {
  let o;
  try { o = JSON.parse(txt.trim()); } catch (e) { return null; }
  const d = o && o.app === "nclex-prep" && o.data ? o.data : o;
  if (!d || typeof d !== "object" || Array.isArray(d) || !(d.lv || d.sessions || d.cards || d.stat)) return null;
  return d;
}

async function importBackup() {
  let txt = $("importText").value;
  const f = $("importFile").files[0];
  if (f) { try { txt = await f.text(); } catch (e) { return toast("Couldn't read that file."); } }
  if (!txt.trim()) return toast("Choose a backup file or paste the backup text first.");
  const d = parseBackup(txt);
  if (!d) return toast("That doesn't look like a backup from this app.");
  if (!confirm("Replace your current progress with this backup?\n\nYour current progress is kept as a safety copy on this phone.")) return;
  try {
    localStorage.setItem(KEY + "_before_import", JSON.stringify(S));
    localStorage.setItem(KEY, JSON.stringify(d)); // older backups are migrated on load
    frozen = true;
  } catch (e) { return toast("Couldn't save on this phone (storage full?). Nothing was changed."); }
  location.replace(location.pathname + "#home");
  location.reload();
}

function resetAll() {
  const t = prompt("This deletes ALL progress on this phone.\n\nType RESET to confirm.");
  if (t === null) return;
  if (t.trim().toUpperCase() !== "RESET") return toast("Not reset. Type RESET to confirm.");
  try { localStorage.setItem(KEY + "_before_reset", JSON.stringify(S)); } catch (e) { return toast("Couldn't make a safety copy, so nothing was deleted."); }
  frozen = true;
  localStorage.removeItem(KEY);
  location.replace(location.pathname);
}
