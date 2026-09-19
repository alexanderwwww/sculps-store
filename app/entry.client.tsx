/**
 * The browser side of the app.
 *
 * React Router provides this file by default; it exists here for one reason:
 * `onRecoverableError`. When the server's HTML and the browser's first render
 * disagree, React throws the tree away, rebuilds it, and says so in a
 * minified sentence with no location — which is exactly as useful as
 * silence. The tree being rebuilt is why a tap on Add to cart in that first
 * second can land on markup that is about to be replaced and do nothing at
 * all, so a mismatch here is not cosmetic.
 *
 * This prints the component stack with it, so the next one is findable
 * instead of guessable.
 */
import { HydratedRouter } from "react-router/dom";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      onRecoverableError(error, errorInfo) {
        const stack = (errorInfo as { componentStack?: string })?.componentStack ?? "";
        // eslint-disable-next-line no-console
        console.error("[hydration]", error, stack);
        try {
          const body = JSON.stringify({
            kind: "hydration",
            message: String((error as Error)?.message ?? error).slice(0, 300),
            stack: stack.split("\n").slice(0, 14).join("\n"),
            path: location.pathname + location.search,
            ua: navigator.userAgent.slice(0, 160),
          });
          // Sent, not just logged: the mismatch happens on other people's
          // browsers more often than on ours, and a console nobody is
          // watching has never fixed anything.
          navigator.sendBeacon?.("/vitals", body);
        } catch {
          /* never let reporting break the page */
        }
      },
    },
  );
});
