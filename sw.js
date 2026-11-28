/* Offline support. Caches the whole app on first visit, then serves it from the
   phone even with no internet. BUMP VERSION whenever any app file changes, or
   phones keep the old copy. Paths are relative: the site lives under /nclex-prep/. */
const VERSION = "v6";
const CACHE = "nclex-" + VERSION;
const FILES = [
  "./",
  "index.html",
  "css/style.css",
  "js/store.js",
  "js/app.js",
  "js/syllabus.js",
  "js/qtypes.js",
  "js/flashcards.js",
  "js/notes.js",
  "js/mistakes.js",
  "js/timer.js",
  "js/badges.js",
  "js/settings.js",
  "data/syllabus.json",
  "data/questions.json",
  "data/questions/management-of-care.json",
  "data/questions/pharmacological-parenteral.json",
  "data/plan.json",
  "data/canada.json",
  "data/reference.json",
  "data/exam-guide.json"
];

self.addEventListener("install", e => {
  // all-or-nothing: a half-downloaded update never replaces a working copy
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("nclex-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // app files: cache first (fast on slow internet), network as fallback
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit ||
      fetch(req).catch(() => req.mode === "navigate" ? caches.match("index.html") : Response.error())));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    // fonts: keep a copy once downloaded; the app falls back to system fonts if missing
    e.respondWith(caches.open("fonts").then(c => c.match(req).then(hit => hit ||
      fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
  }
});
