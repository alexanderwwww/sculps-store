import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  let title = "Something went wrong";
  let detail = "Please try again in a moment.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : `${error.status}`;
    detail = error.status === 404 ? "That page doesn't exist." : error.statusText;
  } else if (import.meta.env.DEV && error instanceof Error) {
    detail = error.message;
  }

  return (
    <main style={{ padding: "64px 24px", fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>{title}</h1>
      <p style={{ fontSize: 16, color: "#555", margin: 0 }}>{detail}</p>
    </main>
  );
}
