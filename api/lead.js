/**
 * Vercel Serverless Function: POST /api/lead
 * Sayt formasidan kelgan arizani Telegram botga yuboradi.
 *
 * Kerakli environment o'zgaruvchilar (Vercel → Settings → Environment Variables):
 *   TELEGRAM_BOT_TOKEN  — @BotFather bergan token
 *   TELEGRAM_CHAT_ID    — arizalar tushadigan chat / guruh / kanal ID
 *   ALLOWED_ORIGINS     — (ixtiyoriy) vergul bilan: https://icanuz.uz,https://www.icanuz.uz
 *
 * Token hech qachon brauzerga chiqmaydi — faqat shu server kodida ishlatiladi.
 */

"use strict";

const COURSES = new Set([
  "",
  "Umumiy dasturlash va AI Engineering (8 oy)",
  "Graphic Design + AI (4 oy)",
]);

const NAME_RE = /^[\p{L}\s'’‘ʻʼ`.-]{2,50}$/u;
const PHONE_RE = /^998\d{9}$/;
const MIN_FILL_MS = 2500; // botlar formani juda tez to'ldiradi
const RATE_LIMIT = 5; // bitta IP uchun
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 daqiqa ichida

// Best-effort rate limit (bitta serverless instansiya doirasida ishlaydi)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_LIMIT;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Reklama manbasi: UTM teglar yoki Facebook/Instagram'dan kelganini aniqlaydi
const SRC_NAMES = { fb: "Facebook", facebook: "Facebook", ig: "Instagram", instagram: "Instagram", msg: "Messenger", an: "Audience Network" };
function sourceLines(src, esc) {
  const s = src && typeof src === "object" ? src : {};
  const g = (k) => String(s[k] || "").trim().slice(0, 100);
  const source = g("utm_source"), medium = g("utm_medium"), campaign = g("utm_campaign"), content = g("utm_content"), ref = g("ref");
  let where;
  if (source) where = SRC_NAMES[source.toLowerCase()] || source;
  else if (s.fbclid) where = "Facebook/Instagram";
  else if (/(^|\.)(facebook|instagram)\.com$/i.test(ref)) where = /instagram/i.test(ref) ? "Instagram" : "Facebook";
  else if (ref) where = ref;
  else where = "To‘g‘ridan-to‘g‘ri (organik)";
  if (medium && /^(paid|cpc|ads?|reklama)$/i.test(medium)) where += " — reklama";
  const out = [`📣 <b>Manba:</b> ${esc(where)}`];
  if (campaign) out.push(`🎯 <b>Kampaniya:</b> ${esc(campaign)}`);
  if (content) out.push(`🖼 <b>Reklama:</b> ${esc(content)}`);
  return out;
}

function formatPhone(p) {
  // 998874007711 -> +998 87 400 77 11
  return `+998 ${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8, 10)} ${p.slice(10, 12)}`;
}

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "");
  return xf.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // oddiy HTML forma (JS'siz) ba'zan Origin yubormaydi
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  if (host === req.headers.host) return true;
  const list = String(process.env.ALLOWED_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(origin);
}

function send(req, res, status, data) {
  const wantsHtml = !String(req.headers["content-type"] || "").includes("application/json");
  if (wantsHtml) {
    // JS o'chirilgan brauzerlar uchun: oddiy forma yuborilganda sahifaga qaytaramiz
    res.statusCode = 303;
    res.setHeader("Location", data.ok ? "/rahmat" : "/#ariza");
    return res.end();
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(req, res, 405, { ok: false, error: "Ruxsat etilmagan so‘rov." });
  }

  if (!originAllowed(req)) {
    return send(req, res, 403, { ok: false, error: "Ruxsat etilmagan manba." });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID sozlanmagan");
    return send(req, res, 500, { ok: false, error: "Server sozlanmagan. Iltimos, qo‘ng‘iroq qiling." });
  }

  let body = req.body;
  if (typeof body === "string") {
    if (body.length > 2000) return send(req, res, 413, { ok: false, error: "So‘rov juda katta." });
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body && typeof body === "object" ? body : {};

  // Honeypot: odam ko'rmaydigan maydon to'ldirilgan bo'lsa — bot. Jim "muvaffaqiyat" qaytaramiz.
  if (body.website) return send(req, res, 200, { ok: true });

  const ts = Number(body.ts);
  if (Number.isFinite(ts) && ts > 0 && Date.now() - ts < MIN_FILL_MS) {
    return send(req, res, 200, { ok: true });
  }

  if (rateLimited(clientIp(req))) {
    return send(req, res, 429, { ok: false, error: "Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring." });
  }

  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  let phone = String(body.phone || "").replace(/\D/g, "");
  if (phone.length === 9) phone = "998" + phone;
  const course = String(body.course || "");

  if (!NAME_RE.test(name)) {
    return send(req, res, 400, { ok: false, error: "Ismni to‘g‘ri kiriting." });
  }
  if (!PHONE_RE.test(phone)) {
    return send(req, res, 400, { ok: false, error: "Telefon raqamni to‘g‘ri kiriting." });
  }
  if (!COURSES.has(course)) {
    return send(req, res, 400, { ok: false, error: "Kurs noto‘g‘ri tanlangan." });
  }

  const time = new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());

  const text = [
    "🆕 <b>Yangi ariza — bepul konsultatsiya</b>",
    "",
    `👤 <b>Ism:</b> ${escapeHtml(name)}`,
    `📞 <b>Telefon:</b> ${formatPhone(phone)}`,
    `📚 <b>Kurs:</b> ${escapeHtml(course || "Tanlanmagan")}`,
    `🕒 <b>Vaqt:</b> ${escapeHtml(time)} (Toshkent)`,
    "🌐 <b>Sayt:</b> kurs landing page",
    ...sourceLines(body.src, escapeHtml),
  ].join("\n");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: ctrl.signal,
    });
    const data = await tg.json().catch(() => ({}));
    if (!tg.ok || !data.ok) {
      // Tokenni logga chiqarmaymiz — faqat Telegram javobining tavsifi
      console.error("Telegram xatosi:", tg.status, data && data.description);
      return send(req, res, 502, { ok: false, error: "Ariza yuborilmadi. Iltimos, qayta urinib ko‘ring." });
    }
    return send(req, res, 200, { ok: true });
  } catch (err) {
    console.error("Telegram'ga ulanishda xato:", err && err.name);
    return send(req, res, 502, { ok: false, error: "Ariza yuborilmadi. Iltimos, qayta urinib ko‘ring." });
  } finally {
    clearTimeout(timer);
  }
};
