// 제주 역사문화 데이터 서버: 공공데이터포털(odcloud) API 두 개를 호출해 합친 뒤 /api/culture 로 내려준다.
// 인증키는 환경변수 JEJU_CULTURE_INFO_KEY / JEJU_CULTURE_LOCATION_KEY 에서만 읽는다 (.env.local 도 지원).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CACHE_MS = 60 * 60 * 1000;
const PER_PAGE = 500;

loadEnvFile(path.join(ROOT, ".env.local"));

const BASE = "https://api.odcloud.kr/api";
const API = {
  info: { path: "15109587/v1/uddi:56c2b3a4-4b4b-46cd-a1fa-f928ef731ffb", keyEnv: "JEJU_CULTURE_INFO_KEY" },
  location: { path: "15109570/v1/uddi:8781448b-81a8-487c-bc95-d26335bafa82", keyEnv: "JEJU_CULTURE_LOCATION_KEY" },
};

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

function getKey(envName) {
  const raw = process.env[envName];
  if (!raw) throw new Error(`환경변수 ${envName} 가 설정되어 있지 않습니다.`);
  try { return decodeURIComponent(raw); } catch { return raw; } // 포털에서 인코딩된 키를 받은 경우 대비
}

async function fetchAll({ path: apiPath, keyEnv }) {
  const key = getKey(keyEnv);
  const rows = [];
  for (let page = 1; ; page++) {
    const url = `${BASE}/${apiPath}?page=${page}&perPage=${PER_PAGE}&serviceKey=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${keyEnv} API 호출 실패 (HTTP ${res.status})`);
    const json = await res.json();
    rows.push(...json.data);
    if (rows.length >= json.totalCount || !json.data.length) return rows;
  }
}

const text = v => (v == null ? "" : String(v));

// 정보 API + 위치 API 를 '데이터 고유번호'로 합쳐 화면이 쓰는 필드 이름으로 변환
function merge(info, location) {
  const loc = new Map(location.map(r => [r["데이터 고유번호"], r]));
  return info.map(r => {
    const l = loc.get(r["데이터 고유번호"]) || {};
    return {
      id: r["데이터 고유번호"],
      name: text(r["장소명"]),
      lat: Number(r["위도"]),
      lng: Number(r["경도"]),
      category: text(r["분류"]),
      dir1: text(r["디렉토리1"]),
      dir2: text(r["디렉토리2"]),
      title: text(r["제목"]),
      subtitle: text(r["부제목"]),
      author: text(r["저작자"]),
      subject: text(r["주제"]),
      content: text(r["내용"]),
      date: text(r["발행일"]),
      type: text(r["자료유형"]),
      scope: text(r["범위"]),
      zip: text(l["우편번호"]),
      addr: text(l["위치"]),
      url: text(l["데이터 상세보기 URL"] || r["링크"]),
    };
  }).filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lng));
}

let cache = null;
async function getData() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const [info, location] = await Promise.all([fetchAll(API.info), fetchAll(API.location)]);
  cache = { at: Date.now(), data: merge(info, location) };
  return cache.data;
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const PUBLIC = new Set(["/index.html", "/family.html"]);

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
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(path.join(ROOT, file)));
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
