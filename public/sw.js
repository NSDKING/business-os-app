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
