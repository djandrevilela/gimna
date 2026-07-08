/* =========================================================
   AnimaKids — Service Worker
   Estratégia: cache-first para o "app shell" (HTML/CSS/JS/ícones),
   com fallback de rede e cache dinâmica para outros pedidos GET
   (ex.: tipos de letra). Os dados da aplicação NÃO passam por aqui
   — vivem no IndexedDB (ver js/db.js), por isso a app funciona
   totalmente offline depois da primeira visita.
   ========================================================= */
const CACHE_NAME = "animakids-cache-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/db.js",
  "./js/season.js",
  "./js/seed.js",
  "./js/stats.js",
  "./js/qrcode.js",
  "./js/auth.js",
  "./js/app.js",
  "./js/views.js",
  "./js/views2.js",
  "./js/views3.js",
  "./js/views4.js",
  "./js/actions.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === "navigate") return caches.match("./index.html");
        });
    })
  );
});

// ---------------------------------------------------------------
// Notificações push. Este handler já está pronto para receber pushes
// reais de um backend (ver backend/routes/push.js no pacote) — envia
// um payload JSON { title, body } e o utilizador vê a notificação
// mesmo com a app fechada. Sem um backend a chamar isto, o único uso
// possível é o botão "notificação de teste" nas Definições da app,
// que chama showNotification diretamente.
// ---------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = { title: "AnimaKids", body: "Tens uma novidade na app." };
  try { if (event.data) data = event.data.json(); } catch (e) { /* payload não é JSON, usa omissão */ }
  event.waitUntil(
    self.registration.showNotification(data.title || "AnimaKids", {
      body: data.body || "",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { url: data.url || "./index.html" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./index.html";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
