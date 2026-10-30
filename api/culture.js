// Vercel 서버리스 함수: GET /api/culture
import { loadCulture } from "../lib/culture.js";

export default async function handler(req, res) {
  try {
    const data = await loadCulture();
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(data);
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: e.message });
  }
}
