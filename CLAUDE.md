# NCLEX-RN Study Dashboard — notes for Claude

## Project goal
This website is my wife's **main** place to prepare for the NCLEX-RN. She is a 4th-year nursing student in Bangladesh, sitting the exam around mid-2028, and will then work as an RN in Canada. She mostly uses her **Android phone**, sometimes on **slow internet**.

## Rules
- **Mobile-first**: design for a small Android screen first, then scale up.
- **Simple and friendly** design, in **plain English**.
- **Works offline** (and loads fast on slow connections).
- **Never lose her saved progress**: don't rename or reset the `localStorage` key, migrate old data whenever its shape changes.
- **Clinically accurate content only**: if unsure, leave it out.

## Syllabus source
NCSBN 2026 NCLEX-RN Test Plan: https://nclex.com/files/2026_RN_Test%20Plan_English-F.pdf. Link to it; **don't commit the PDF**.

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
- The NCSBN credit footer at the bottom of `index.html` (credits the 2026 NCLEX-RN Test Plan © NCSBN and states the site is not affiliated with NCSBN).

## Structure (no build step: plain files, served as-is)
- `index.html` — page shell: first-time setup, 5 screens (Home, Learn, Practice, Progress, More), bottom menu, NCSBN footer.
- `css/style.css` — mobile-first styles (base = small phone, `min-width` media queries scale up).
- `js/store.js` — saved progress: load, migrate, save, streak. Loaded before `app.js`.
- `js/app.js` — screens and features. Loads content from `data/*.json` at start-up.
- `data/*.json` — content: `syllabus`, `questions`, `plan`, `canada`, `reference`, `exam-guide`.
- `sw.js` — service worker for offline use. **Bump `VERSION` in `sw.js` whenever any app file changes**, and add new files to its `FILES` list.
- `tests/` — `check-data.js` (content checks) and `browser-test.js` (Playwright, phone size). Not part of the app.

## Saved progress (never lose it)
- One `localStorage` key: `nclexDash2`. Never rename it. Schema has a version field `v` (now **4**); when the shape changes, add a step to `migrate()` in `js/store.js` and a test case in `tests/browser-test.js`.
- Before each migration, a raw copy of the old data is kept in `nclexDash2_backup_v<old version>` (e.g. `_backup_v2`, `_backup_v3`). Old keys that can't be mapped are kept in `S.unmapped`, never dropped.
- Progress is saved by **fixed text IDs**, not by position: topic ratings `lv[topicId]`, plan ticks `plan[taskId]`, Canada ticks `can[stepId]`, quiz stats `stat[catId]`, today's task `task.topic`.
- Every category, topic, phase, plan task, Canada step and question in `data/*.json` has an `id` (lowercase words with dashes, e.g. `moc-delegation`, `q-pharm-heparin-antidote`). Questions link to a topic by `topic: "<topicId>"`.

## Content order and IDs
- Content can be **reordered, inserted or removed** safely.
- **Never change or reuse an existing ID**: progress is attached to it. To fix a typo in a name, change the text, not the `id`.
- New items need a new unique `id`; `tests/check-data.js` checks this.
- `LEGACY_V3` in `js/store.js` is a frozen copy of the old position → ID mapping, used only to migrate old progress. Never edit it.
- Dates use the phone's local calendar day (`dayKey()`), not UTC.
