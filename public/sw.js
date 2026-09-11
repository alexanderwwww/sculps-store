/**
 * Shop Admin service worker — the part that is awake when the tab is not.
 *
 * It exists for one reason: to turn a push from our Worker into the
 * notification he hears on his iPhone and his MacBook. No caching, no offline
 * tricks, nothing that could ever serve a stale admin.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Tell the shop what happened, since nobody can watch this from the inside. */
function say(kind, detail) {
  try {
    return fetch("/push/log", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ kind: kind, detail: String(detail || "").slice(0, 400) }),
    }).catch(function () {});
  } catch (error) {
    return Promise.resolve();
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Shop Admin", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Shop Admin";
  event.waitUntil(
    say("received", title + " | permission=" + (self.Notification ? Notification.permission : "none"))
      .then(function () {
        return self.registration.showNotification(title, {
          body: data.body || "",
          icon: "/icon-512.png",
          badge: "/logo-mark.png",
          // Same tag means a re-delivery replaces the banner instead of
          // stacking; requireInteraction keeps it on screen until it is dealt
          // with, which is what an order deserves.
          tag: data.tag || "shop-admin",
          renotify: true,
          requireInteraction: true,
          data: { url: data.url || "/admin" },
        });
      })
      .then(function () {
        // A worker cannot make a sound. An open admin window can — so every
        // one of them (the installed app counts, minimised or not) is told,
        // and plays the same cha-ching Live View plays.
        return self.clients
          .matchAll({ type: "window", includeUncontrolled: true })
          .then(function (windows) {
            windows.forEach(function (client) {
              try {
                client.postMessage({ type: "shop-admin:push", title: title, body: data.body || "" });
              } catch (_) {}
            });
          })
          .then(function () {
            return say("shown", title);
          });
      })
      .catch(function (error) {
        return say("failed", (error && error.message) || String(error));
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
