// Test harness: real Neon in a throwaway schema, mocked R2, mocked platform HTTP (global fetch).
import { migrate, db } from "../src/db.mjs";
import { _resetMigrated } from "../src/core.mjs";

const realFetch = globalThis.fetch;
export const calls = [];
let routes = [];

// route(method, urlPrefixOrRegex, handler(req, body, url) -> Response | object)
export function mock(method, match, handler) { routes.push({ method, match, handler }); }
export function resetMocks() { routes = []; calls.length = 0; }
export const res = (body, status = 200, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const u = new URL(url);
  if (/neon\.tech$|neon\.build$/.test(u.hostname) || u.hostname.endsWith(".neon.tech")) return realFetch(input, init);
  const method = (init.method || "GET").toUpperCase();
  let body = init.body;
  if (body && typeof body.getReader === "function") body = new Uint8Array(await new Response(body).arrayBuffer());
  const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const rec = { method, url, headers, body };
  calls.push(rec);
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (r.method !== method) continue;
    if (typeof r.match === "string" ? !url.startsWith(r.match) : !r.match.test(url)) continue;
    const out = await r.handler(rec, u);
    if (out === undefined) continue;
    return out instanceof Response ? out : res(out);
  }
  throw new Error(`unmocked fetch ${method} ${url}`);
};

export function r2(objects = {}) {
  const store = new Map(Object.entries(objects).map(([k, v]) => [k, typeof v === "number" ? new Uint8Array(v) : v]));
  return {
    store,
    async head(k) { const v = store.get(k); return v ? { key: k, size: v.length } : null; },
    async get(k, opts) {
      const v = store.get(k); if (!v) return null;
      const s = opts?.range ? v.slice(opts.range.offset, opts.range.offset + opts.range.length) : v;
      return { size: v.length, body: new Response(s).body, text: async () => new TextDecoder().decode(s) };
    },
    async put(k, val) { const b = val instanceof Uint8Array ? val : new Uint8Array(await new Response(val).arrayBuffer()); store.set(k, b); return {}; },
    async list({ prefix = "", cursor, limit = 1000 } = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + limit);
      return { objects: page.map((k) => ({ key: k, size: store.get(k).length, uploaded: new Date("2026-11-01") })), truncated: start + limit < keys.length, cursor: String(start + limit) };
    },
  };
}

export async function makeEnv(extra = {}) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL needed for tests (a throwaway schema is created and dropped)");
  const schema = `mob_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const env = {
    DATABASE_URL: process.env.DATABASE_URL, MOB_SCHEMA: schema, ADMIN_PASSWORD: "pw-test", MOB_API_TOKEN: "tok-test", MOB_ENC_KEY: "enc-test",
    GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsec", IG_APP_ID: "igid", IG_APP_SECRET: "igsec", TIKTOK_CLIENT_KEY: "tkey", TIKTOK_CLIENT_SECRET: "tsec",
    CF_API_TOKEN: "cf", CF_ACCOUNT_ID: "acct1", MEDIA: r2({ "oraktys-a.mp4": 1000, "oraktys-b.mp4": 2000, "other.txt": 5 }), ...extra,
  };
  _resetMigrated();
  await migrate(env);
  return env;
}
export async function dropEnv(env) { await db(env).q(`DROP SCHEMA IF EXISTS ${env.MOB_SCHEMA} CASCADE`); }

export function reqOf(env) {
  return async (method, path, { body, headers = {}, cookie, bearer, form } = {}) => {
    const h = new Headers(headers);
    if (cookie) h.set("cookie", cookie);
    if (bearer) h.set("authorization", `Bearer ${bearer}`);
    let b = body;
    if (form) { b = new URLSearchParams(form); h.set("content-type", "application/x-www-form-urlencoded"); }
    else if (body && Object.getPrototypeOf(body) === Object.prototype) { b = JSON.stringify(body); h.set("content-type", "application/json"); }
    const { default: worker } = await import("../src/worker.mjs");
    return worker.fetch(new Request(`https://mob.gardenbuddystore.workers.dev${path}`, { method, headers: h, body: b, redirect: "manual" }), env, { waitUntil() {} });
  };
}
export async function login(env) {
  const r = await reqOf(env)("POST", "/login", { form: { password: env.ADMIN_PASSWORD } });
  return r.headers.get("set-cookie").split(";")[0];
}
