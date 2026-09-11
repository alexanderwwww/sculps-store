/**
 * "Get Shop Admin" — the app, on the home page, sold like one.
 *
 * There is no file to download. The admin *is* the app: the browser installs
 * it from the manifest it already serves, gives it a Dock icon, its own
 * window, and — the reason this exists — notifications that carry the gold
 * bag and the name Shop Admin instead of Chrome's. This card is the front
 * door to that, styled the way a paid product would be, because it is one.
 *
 * Chrome and Edge, on macOS and Windows, hand the page an install prompt it
 * can fire on a click. Safari has no such prompt: there the card says the
 * two menu clicks that do the same thing. Once installed, the card says so.
 */
import { useEffect, useState } from "react";

type Platform = "mac" | "windows" | "other";
type State = "installed" | "ready" | "manual";

export function InstallCard() {
  const [platform, setPlatform] = useState<Platform>("other");
  const [state, setState] = useState<State>("manual");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<any>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const plat = (navigator as any).userAgentData?.platform ?? navigator.platform ?? "";
    setPlatform(/Mac/i.test(plat) || /Macintosh/i.test(ua) ? "mac" : /Win/i.test(plat) || /Windows/i.test(ua) ? "windows" : "other");

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) setState("installed");

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event);
      setState((current) => (current === "installed" ? current : "ready"));
    };
    const onInstalled = () => {
      setPrompt(null);
      setState("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === "accepted") setState("installed");
    } catch {
      /* the browser closed the sheet; nothing to say */
    } finally {
      setBusy(false);
      setPrompt(null);
    }
  };

  const isSafari = typeof navigator !== "undefined" && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);
  const primary: Platform = platform === "windows" ? "windows" : "mac";
  const secondary: Platform = primary === "mac" ? "windows" : "mac";

  const label = (p: Platform) => (p === "mac" ? "Download for macOS" : "Download for Windows");

  return (
    <section
      className="k-glass"
      aria-label="Get the Shop Admin app"
      style={{
        padding: "28px 28px 30px",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: 28,
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src="/icon-512.png"
            alt=""
            width={64}
            height={64}
            style={{ width: 64, height: 64, flex: "none", filter: "drop-shadow(0 8px 18px rgba(120, 90, 20, .35))" }}
          />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-2)" }}>
              Shop Admin for desktop
            </div>
            <h2 style={{ margin: "2px 0 0", fontSize: 24, lineHeight: 1.15, fontWeight: 650, letterSpacing: "-.02em" }}>
              Your store, in its own window.
            </h2>
          </div>
        </div>

        <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14, lineHeight: "21px", maxWidth: 560 }}>
          A Dock icon, a window of its own, and every sale arriving as a real notification —
          the gold bag, the amount, the sound — with the browser closed. Nothing to configure:
          it is the admin you are looking at, installed.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 4 }}>
          {state === "installed" ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: 44,
                padding: "0 18px",
                borderRadius: 999,
                background: "var(--b-success-bg)",
                color: "var(--b-success-fg)",
                fontWeight: 650,
                fontSize: 14,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
              Installed on this {platform === "windows" ? "PC" : "Mac"}
            </span>
          ) : (
            <>
              <button
                type="button"
                className="k-btn-primary"
                onClick={state === "ready" ? install : undefined}
                disabled={busy || state !== "ready"}
                title={state === "ready" ? undefined : "Open this page in Chrome or Edge to install"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  height: 46,
                  padding: "0 22px",
                  borderRadius: 999,
                  border: 0,
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  fontWeight: 650,
                  fontSize: 14.5,
                  cursor: state === "ready" ? "pointer" : "default",
                  opacity: state === "ready" ? 1 : 0.55,
                  boxShadow: state === "ready" ? "0 10px 26px rgba(0,0,0,.18)" : "none",
                }}
              >
                {primary === "mac" ? <AppleMark /> : <WindowsMark />}
                {busy ? "Installing…" : label(primary)}
              </button>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 46,
                  padding: "0 18px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  color: "var(--ink-2)",
                  fontWeight: 600,
                  fontSize: 14,
                  background: "rgba(255,255,255,.55)",
                }}
                title={`Open this page on a ${secondary === "mac" ? "Mac" : "Windows PC"} to install there`}
              >
                {secondary === "mac" ? <AppleMark /> : <WindowsMark />}
                {label(secondary)}
              </span>
            </>
          )}
        </div>

        {state === "manual" ? (
          <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13, lineHeight: "19px" }}>
            {isSafari
              ? "In Safari: File → Add to Dock. On iPhone: Share → Add to Home Screen."
              : "Open this page in Chrome or Edge and the button lights up. Already installed? Open it from the Dock."}
          </p>
        ) : null}
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: 10,
          minWidth: 220,
        }}
      >
        {[
          ["Own window", "No tabs, no address bar."],
          ["Real notifications", "Your logo, the sale sound."],
          ["Always signed in", "Same account, same stores."],
          ["Free", "It is your admin. It is yours."],
        ].map(([head, sub]) => (
          <li key={head} className="k-glass k-glass--tight k-glass--flat" style={{ padding: "10px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 650 }}>{head}</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{sub}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.7c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.2 1-4.1 2.5-1.8 3-.5 7.6 1.3 10.1.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.2-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.8-1.1-2.9-4.1zM14 5.3c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
    </svg>
  );
}

function WindowsMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5.5l7.5-1v7H3v-6zm0 13l7.5 1v-7H3v6zm8.5 1.2L21 21v-8.5h-9.5v7.2zm0-15.4v7.2H21V3l-9.5 1.3z" />
    </svg>
  );
}
