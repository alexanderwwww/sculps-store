import { createRequestHandler } from "react-router";
import { makeDb } from "../app/db/client";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: { env: Env; ctx: ExecutionContext };
    db: ReturnType<typeof makeDb>;
    /** hostname the visitor arrived on — decides which store we serve */
    hostname: string;
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
      db: makeDb(env.DATABASE_URL),
      hostname: new URL(request.url).hostname,
    });
  },
} satisfies ExportedHandler<Env>;
