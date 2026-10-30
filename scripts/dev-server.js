// 로컬 실행용 서버: 정적 페이지를 서비스하고 /api/culture 를 제공한다. (Vercel 에서는 api/culture.js 가 대신한다)
// 인증키는 환경변수 JEJU_CULTURE_INFO_KEY / JEJU_CULTURE_LOCATION_KEY (.env.local 도 지원).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCulture } from "../lib/culture.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || 3000;
const CACHE_MS = 60 * 60 * 1000;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
loadEnvFile(path.join(ROOT, ".env.local"));

let cache = null;
async function getData() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  cache = { at: Date.now(), data: await loadCulture() };
  return cache.data;
}

const PUBLIC = new Set(["/index.html", "/explorer.html"]);

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname === "/api/culture") {
    try {
      const body = JSON.stringify(await getData());
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(body);
    } catch (e) {
      console.error(e.message);
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  const file = pathname === "/" ? "/index.html" : pathname;
  if (!PUBLIC.has(file)) return res.writeHead(404).end("Not found");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(fs.readFileSync(path.join(ROOT, file)));
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
