# NCLEX-RN Study Dashboard — notes for Claude

## Project goal
This website is my wife's **main** place to prepare for the NCLEX-RN. She is a 4th-year nursing student in Bangladesh, sitting the exam around mid-2028, and will then work as an RN in Canada. She mostly uses her **Android phone**, sometimes on **slow internet**.

## Rules
- **Fast on a mid-range Android**: plain JS, no frameworks or big libraries, render only the visible screen. (Now: ~780 KB uncompressed; the syllabus is 168 KB and the four question banks 118, 75, 102 and 91 KB, all compressing to about a quarter of that on GitHub Pages; ~0.4 s load with a 4× slower CPU.)
- **Dark mode**: use the colour tokens in `:root` (`var(--card)`, `var(--ink)` …), never hard-coded colours.
- **Mobile-first**: design for a small Android screen first, then scale up.
- **Simple and friendly** design, in **plain English**.
- **Works offline** (and loads fast on slow connections).
- **Never lose her saved progress**: don't rename or reset the `localStorage` key, migrate old data whenever its shape changes.
- **Clinically accurate content only**: if unsure, leave it out.

## Syllabus source (single source of truth)
- NCSBN 2026 NCLEX-RN Test Plan: https://nclex.com/files/2026_RN_Test%20Plan_English-F.pdf. Link to it; **don't commit the PDF**.
- The official data file is `source/nclex-2026-syllabus.json` (areas → categories → topics → learningPoints, plus activityStatements, integratedProcesses, clinicalJudgmentSteps, exam rules). **Never edit it.**
- `data/syllabus.json` is an **exact copy** of it (`tests/check-data.js` fails if they differ). If a new official file ever replaces the source, copy it over and keep every existing id.
- Expected counts (checked by tests): 4 areas, 8 categories, 82 topics, 511 learning points, 149 activity statements, 6 integrated processes, 6 clinical judgment steps.
- Overall syllabus progress is **weighted by each category's `weightMid`**: sum(weightMid × share of the category's topics rated Confident) ÷ sum(weightMid).

## Workflow (every task, permanent rule)
At the end of every task, without being asked:
1. **Test it**:
   - `node tests/check-data.js` checks the content: IDs, question → topic links, files cached by `sw.js`.
   - `node tests/browser-test.js` loads the site locally under `/nclex-prep/` at a 360px phone size. It checks there are no console errors or sideways scrolling, tests the tabs, quiz, Back button and offline loading, and checks that saved progress from every older version still loads.
   - Add checks to these scripts when adding features.
2. **Bump `VERSION` in `sw.js`** (`v2` → `v3` …), so phones get the update.
3. **Open a pull request** into `main` with a short summary of what changed and what to test.
4. **Squash-merge it yourself and delete the branch.**
5. Tell the user what changed in **3–5 short lines**.

**Only skip the merge and ask first** if a test fails or the change is risky (e.g. it could lose saved progress, it removes content, or it is a large clinical-content change you're unsure of).

## Hosting
- **GitHub Pages**, deployed from branch `main`, root folder (`/`).
- Repo (public): https://github.com/showrav31/nclex-prep
- Live site: https://showrav31.github.io/nclex-prep/
- Not Cloudflare. No build step: files are served as-is (`.nojekyll` in the root disables Jekyll — keep it).

## Paths — always relative
The site lives under the `/nclex-prep/` subpath, not the domain root.
- Use relative URLs (`./app.js`, `icons/icon-192.png`), never root-absolute ones (`/app.js`).
- Service worker (when added): register with `navigator.serviceWorker.register('./sw.js', { scope: './' })`; cache relative URLs inside `sw.js`.
- Web manifest (when added): `"start_url": "./"`, `"scope": "./"`, relative icon `src` paths; link it with `<link rel="manifest" href="manifest.webmanifest">`.

## Never commit
- Secrets or API keys of any kind (`.env`, tokens, credentials).
- The NCSBN test plan PDF (copyrighted). Link to https://www.nclex.com/test-plans.page instead. `*.pdf` is gitignored.

## Must keep
- The NCSBN credit footer at the bottom of `index.html`: the exact line "Portions copyrighted by the National Council of State Boards of Nursing, Inc. All rights reserved." plus the note that the syllabus comes from the 2026 NCLEX-RN Test Plan and the site is not affiliated with NCSBN. (A test checks the copyright line.)

## Structure (no build step: plain files, served as-is)
- `index.html` — page shell: first-time setup, 5 screens (Home, Learn, Practice, Progress, More), bottom menu, NCSBN footer.
- `css/style.css` — mobile-first styles (base = small phone, `min-width` media queries scale up).
- `js/store.js` — saved progress: load, migrate, save, streak. Loaded before `app.js`.
- `js/app.js` — core: start-up, navigation (hash + Back button), bottom sheet, toast, Home, study plan, quiz, exam guide. Loads `data/*.json` at start-up.
- `js/syllabus.js` — syllabus screen: area → category → topic rows, the topic page (learning-point checklist, linked activity statements, note, "Practise this topic"), weighted progress, "About the test plan". Short category labels (`CAT_SHORT`) live here: add one for any new category.
- Study tools, one file each, loaded after `app.js`: `flashcards.js` (spaced repetition), `notes.js`, `mistakes.js`, `timer.js` (study timer + weekly chart), `badges.js`, `settings.js` (dark mode, text size, backup/restore, reset).
- `source/nclex-2026-syllabus.json` — the official syllabus data (never edit). Not cached by the service worker.
- `js/qtypes.js` — question engine: loads/normalizes questions, draws all 10 question types (incl. numeric calculations), scoring and partial credit, "why each choice" review.
- `data/questions/<categoryId>.json` — the question bank for one category, in the new format (see **Question bank** below). Today `management-of-care.json` (64), `pharmacological-parenteral.json` (36), `physiological-adaptation.json` (44) and `safety-infection-control.json` (36 questions). Add a file per category, and list it in `QUESTION_FILES` in `js/app.js` and in `FILES` in `sw.js`.
- `data/questions.json` — the 34 older questions (older, simpler format; still loaded and converted by `normQ`). Leave as is.
- `data/legacy-topic-map.json` — old (pre-2026-syllabus) topic id → new id map, used by the v5 → v6 migration. Never edit it.
- `data/*.json` — content: `syllabus` (copy of the source), `questions`, `plan`, `canada`, `reference` (labs, drugs, isolation, high-alert meds, vital signs), `exam-guide`. Flashcard decks are built from `reference` + `exam-guide.priority`; each item's `id` is its card ID.
- `sw.js` — service worker for offline use. **Bump `VERSION` in `sw.js` whenever any app file changes**, and add new files to its `FILES` list.
- `js/ecg.js` — draws ECG rhythm strips as SVG (normal sinus, sinus tachycardia/bradycardia, atrial fibrillation, PVCs, ventricular tachycardia/fibrillation, asystole) for rhythm-recognition questions.
- `tests/` — `check-data.js` (content checks), `calc.js` (recomputes dosage calculations), `interpret.js` (ABG, lab-flag and ECG lookups used to double-check answers) and `browser-test.js` (Playwright, phone size). Not part of the app.

## Saved progress (never lose it)
- One `localStorage` key: `nclexDash2`. Never rename it. Schema has a version field `v` (now **6**); when the shape changes, add a step to `migrate()` in `js/store.js` and a test case in `tests/browser-test.js`.
- Before each migration, a raw copy of the old data is kept in `nclexDash2_backup_v<old version>` (e.g. `_backup_v2`, `_backup_v3`). Old keys that can't be mapped are kept in `S.unmapped`, never dropped.
- Progress is saved by **fixed text IDs**, not by position. Syllabus ids come from the official file and look like `management-of-care--advocacy` (topic) or `…--p01` (learning point); they may contain `--`. Topic ratings `lv[topicId]`, learning points ticked `points[pointId]`, plan ticks `plan[taskId]`, Canada ticks `can[stepId]`, quiz stats `stat[catId]`, today's task `task.topic`, flashcards `cards[cardId]`, topic notes `notes[topicId]`, mistakes `mistakes[questionId]`, timer minutes `study[day][topicId]`, badges `badges[badgeId]`. Her own cards / free notes get generated IDs (`my-…`, `note-…`); data IDs must not use those prefixes.
- Everything she has is inside that one object, so **backup/restore** (More → Backup) covers it all. Any new feature must store its data in `S` too. Restore and reset keep a safety copy (`nclexDash2_before_import`, `nclexDash2_before_reset`).
- Mistakes store a copy of the question stem and rationale, so they survive question edits or removal.
- Every category, topic, learning point, phase, plan task, Canada step and question in `data/*.json` has an `id` (lowercase words with dashes, e.g. `q-pharm-heparin-antidote`). Questions link to a topic by `topic: "<official topicId>"`.
- **Schema v6** moved everything from the old topic ids (`moc-delegation` …) to the official ids. Ratings, notes, timer minutes, mistakes, today's task and quiz stats were mapped by `LEGACY_V5` (a frozen copy of `data/legacy-topic-map.json` inside `js/store.js`; a test checks they agree). Where two old topics became one, the lower rating wins and notes are joined. Anything unmatched is kept in `S.unmapped.v6`; a note on an unmatched topic becomes a free note.

## Question bank
Question files `data/questions/<categoryId>.json` look like `{ "categoryId": "...", "quotas": {...}, "questions": [ ... ] }`. **Quotas**: every topic needs at least 4 questions by default. When a request asks for other numbers, the file carries `quotas: {topicId: n}` (n may be 0 for a topic that was not asked for); the test then requires exactly that many per topic and `min(n, number of learning points)` different first learning points. Safety and Infection Control uses quotas (8, 8, 4, 3, 3, 3, 3, 2, 2, and 0 for Ergonomic Principles, which has no questions yet). Every question has:
`id` (stable, `q-…`), `categoryId`, `topicId`, `secondaryTopicIds[]`, `learningPointIds[]` (official ids; the first is the main one), `cjStep` (a clinical judgment step id or `null`), `integratedProcess` (id), `type`, `difficulty` (1 to 5), `stem`, optional `exhibit` (`{title, text}` or `{title, columns, rows}`), `rationale` (why the key is right), `needsReview` (true/false; when true also `reviewKind` and `reviewNote`, see below). Optional: `caseStudy: {id: "cs-…", step: 1..6}` (marks a question as a building block for a later case study; `step` must match its `cjStep`, e.g. 1 = recognize-cues), `checks[]` (see **Interpretation checks**).
Type fields:
- `mcq`: `options[]`, `key` (index), `optionRationales[]` (one per option).
- `sata`: `options[]`, `key` (array of indexes), `optionRationales[]`.
- `matrix`: `cols[]`, `rows[{text, key (column index), why}]`.
- `trend`: like `matrix`, plus a required `exhibit` table of data over time.
- `dropdown`: `template` with `{1}`, `{2}`…, `blanks[{options[], key, why}]`.
- `highlight`: `segments[]`; plain text is `{text}`, tappable text is `{text, key: true|false, why}`.
- `dragdrop`: `mode: "order"` with `items[{text, why}]` shown in a mixed order and `key[]` (key[position] = index of the item that belongs there); or `mode: "sort"` with `bins[]` and `items[{text, key (bin index), why}]`.
- `bowtie`: `condition`, `actions`, `parameters`, each `{prompt, options[], key|keys[], optionRationales[]}` (1 condition, 2 actions, 2 parameters).
- `numeric` (calculation, not a Next Gen type): she types a number. Fields: `unit`, `key` (number), `rounding: {decimals, rule}` (the `rule` sentence, e.g. "Round to one decimal place.", must also appear in the `stem`), `calc: {formula, inputs{}, steps[{name, label, expr, value, show}], result}`, `commonErrors[{expr, value, why}]` (typical wrong answers; `why` completes "you …").
  Accepted answers: the key, or any more precise number that rounds to the key under `rounding.decimals` (half up). A decimal comma is read as a point.
`exhibit` may hold `text`, a table (`columns`, `rows`) and/or an ECG strip `ecg: {rhythm, rate, seed?}`. In `matrix`/`trend` `rows` and in `dragdrop` sort `items`, an entry may also carry its own `ecg` (shown as a card with the strip). Questions with 4 or more choices are drawn as cards instead of a table (phone width).
**Tables that must fit a phone**: for trend tables put the unit pair in the row label and keep cells short, e.g. label `PaCO₂, mmHg [kPa]` with cell `78 [10.4]`, or label `HCO₃⁻ (mmol/L)` with cell `33`. The tests expand these and verify the conversion.
Text is plain; `**bold**` is allowed. Question ids are stable: **never change or reuse one** (My mistakes is keyed by it).
**Partial credit** (in `scoreQ`, `js/qtypes.js`): mcq all-or-nothing; sata and highlight plus/minus (+1 right, −1 wrong, min 0); matrix, trend, sort 1 point per row/item; dropdown 1 per box; order 1 per item in the right place; bowtie 1 per right choice out of 5 (wrong choices score 0). numeric all-or-nothing. A question counts as correct only when every point is earned.
**Dosage calculations are verified by code.** `tests/calc.js` recomputes every `calc` (steps use only numbers, + − × ÷, brackets and names from `inputs` or earlier steps; nothing else is evaluated) and `tests/check-data.js` fails if a step value, the "working" text (`show`), the key, a rounding rule or a common error is wrong. Never type `value`/`show` by hand: build them with `calc.runCalc` (the question-writing tool does). Don't use an exact answer that sits on a rounding boundary (e.g. 2.5 to a whole number). Cover unit conversions (mg/mcg/g, mL/L, kg/lb), weight-based doses, mL/h and gtt/min, and say the rounding rule in the stem ("Round only the final answer").
**Unit pairs are checked too**: any "X mmol/L [Y mg/dL]", "X °C [Y °F]", "X ng/mL [Y nmol/L]", "X g/L [Y g/dL]" or "X mmol/L [X mEq/L]" in a question must be arithmetically right (the test scans all question text).
**Interpretation checks** (`checks[]`, verified by `tests/check-data.js` with the lookups in `tests/interpret.js`; never skip them for ABG, lab-value or ECG questions):
- `{kind:"abg", pH, paco2, hco3, primary, compensation?, ref?}`: the lookup (pH 7.35–7.45, PaCO₂ 35–45 mmHg [4.7–6.0 kPa], HCO₃⁻ 22–26 mmol/L) must give the same primary disorder and compensation; the numbers must appear in the question text (pH to 2 decimals, `N mmHg`, `N mmol/L`); `ref` (`key`, `rows.N`, `blanks.N`, `items.N`) says which keyed answer must name it.
- `{kind:"lab", name, value, flag, ref?}`: low/normal/high against the adult ranges in `interpret.js`; values too close to a limit are rejected as ambiguous.
- `{kind:"ecg", rhythm, ref}` (the keyed answer must name the rhythm shown) and `{kind:"ecg-action", rhythm, context, ref}` (e.g. asystole + pulseless → the answer must say epinephrine, not defibrillate). Every ECG strip in a question needs one.
Put ABG questions under Fluid and Electrolyte Imbalances (the test plan has no acid–base topic) with `secondaryTopicIds` including `reduction-risk-potential--laboratory-values`. Add new unit pairs (e.g. kPa, µmol/L creatinine, calcium) to `UNIT_PAIRS` in `tests/check-data.js` rather than typing conversions unchecked.
**needsReview has two kinds** (`reviewKind`):
- `"regional"`: the NCLEX model may differ from provincial/Canadian practice, or the question relies on US-only vs Canadian practice (e.g. controlled-substance rules, scope of practice, substitute decision-makers). She sees "NCLEX model: provincial rules may differ". **The detail must be in the `rationale`** (a test checks it mentions provincial/Canadian/US practice) and `reviewNote` says what to check.
- `"clinical"`: real doubt about the clinical answer. She sees "Waiting for a clinical check". Use it only for real doubt.
**Writing questions**: original (never copy the test plan or a commercial bank), entry-level RN scope, generic drug names, lab values with units, glucose in both mmol/L and mg/dL, temperatures in °C with °F, Canadian-friendly wording. At least 4 questions per topic covering different learning points, and at least 40% Next Gen types (matrix, dropdown, highlight, dragdrop, bowtie, trend). Every wrong option needs a reason. Set `needsReview: true` (with `reviewKind` and `reviewNote`) when not fully sure or when the answer depends on province/territory rules, and list the flagged questions to the user after each task. Prefer drugs that exist in both Canada and the US; give units in both systems.

## Content order and IDs
- Content can be **reordered, inserted or removed** safely.
- **Never change or reuse an existing ID**: progress is attached to it. To fix a typo in a name, change the text, not the `id`.
- New items need a new unique `id`; `tests/check-data.js` checks this.
- Never rename a badge `id` in `js/badges.js`.
- `LEGACY_V3` (positions → old ids) and `LEGACY_V5` (old ids → official ids) in `js/store.js` are frozen, used only to migrate old progress. Never edit them.
- Dates use the phone's local calendar day (`dayKey()`), not UTC.
