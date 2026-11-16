// tiny static server for the statue preview: node aq/dev/statues/server.mjs  (http://localhost:8791)
import http from "node:http"; import { readFileSync, existsSync } from "node:fs"; import { dirname, join, normalize } from "node:path"; import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "out"), port = Number(process.env.PORT || 8791);
http.createServer((req, res) => { const p = new URL(req.url, "http://x").pathname; const f = join(root, normalize(p === "/" ? "/index.html" : p)); if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html", "cache-control": "no-store" }); res.end(readFileSync(f)); }).listen(port, () => console.log("statues preview on http://localhost:" + port));
