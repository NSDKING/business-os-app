// Receives push notifications (an @mention) and opens the conversation when tapped.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || "Business OS", {
    body: d.body || "", tag: d.tag, icon: "/icon-192.png", badge: "/icon-192.png",
    data: { channel: d.channel, message: d.message },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const { channel, message } = e.notification.data || {};
  const url = channel ? `/?c=${channel}&m=${message || ""}` : "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

// Offline shell (P-022): the app opens without a connection. Pages: network first, last copy when offline. Built files: cache first.
const SHELL = "bos-shell-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const r = e.request; const u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== self.location.origin) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(SHELL).then((x) => x.put(r, c)); return res; })
      .catch(() => caches.match(r).then((m) => m || caches.match("/") || Response.error())));
  } else if (u.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|webmanifest)$/.test(u.pathname)) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { const c = res.clone(); caches.open(SHELL).then((x) => x.put(r, c)); return res; })));
  }
});
