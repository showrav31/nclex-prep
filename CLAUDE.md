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

## Workflow
- At the end of every task, open a pull request into `main` with a short summary of **what to test**.

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

## Saved progress (never lose it)
- One `localStorage` key: `nclexDash2`. Never rename it. Schema has a version field `v` (now 3); when the shape changes, add a step to `migrate()` in `js/store.js`.
- Before migrating old data, a raw copy is kept in `nclexDash2_backup_v2`.
- Ratings, plan ticks and Canada ticks are keyed by **array position** in the JSON (e.g. `lv["2-5"]` = category 2, topic 5). **Never reorder or delete** categories, topics, plan tasks or Canada steps; only append. Questions point to topics the same way (`cat`, `topic`).
- Dates use the phone's local calendar day (`dayKey()`), not UTC.
