/**
 * Shop Admin service worker — the part that is awake when the tab is not.
 *
 * It exists for one reason: to turn a push from our Worker into the
 * notification he hears on his iPhone and his MacBook. No caching, no offline
 * tricks, nothing that could ever serve a stale admin.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Shop Admin", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Shop Admin";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-512.png",
      badge: "/logo-mark.png",
      // Same tag means a re-delivery replaces the banner instead of stacking.
      tag: data.tag || "shop-admin",
      renotify: true,
      data: { url: data.url || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes("/admin") && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
