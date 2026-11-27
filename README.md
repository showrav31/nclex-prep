# NCLEX-RN Study Dashboard

**Live site:** https://showrav31.github.io/nclex-prep/

A mobile-first study app for the NCLEX-RN: the official Client Needs syllabus with self-ratings, a phased study plan, practice questions (including Next Gen item types), quick-reference tables and a Canada RN roadmap. Progress is saved locally in your browser.

## Files
- `index.html`, `css/style.css`, `js/store.js`, `js/app.js`: the app
- `data/*.json`: syllabus, questions, study plan, Canada roadmap, quick reference, exam guide
- `sw.js`: offline support (bump its `VERSION` on every change)
- `tests/`: `node tests/check-data.js` and `node tests/browser-test.js`

## Hosting
Served by GitHub Pages from the `main` branch, root folder. No build step. All paths are relative because the site lives under `/nclex-prep/`.

To try it locally, serve the parent folder so the URL matches Pages (`python3 -m http.server` from the folder that contains `nclex-prep`, then open `http://localhost:8000/nclex-prep/`). Opening `index.html` directly from disk won't load the data files.

## Credits
Syllabus categories and exam weights are based on the 2026 NCLEX-RN Test Plan © National Council of State Boards of Nursing (NCSBN). Official test plan: https://www.nclex.com/test-plans.page. This project is an independent study aid and is not affiliated with or endorsed by NCSBN.
