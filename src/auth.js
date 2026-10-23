// Password login for the dashboard.
// The only secret is APP_PASSWORD (set in the Cloudflare dashboard, never in git).
// A successful login sets a signed, HttpOnly cookie; changing the password logs everyone out.

const enc = new TextEncoder();
const COOKIE = 'gc_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

async function hmacKey(password) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('globalcare-session:' + password));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(password, text) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(password), enc.encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function passwordMatches(input, password) {
  const a = await sign(password, 'pw:' + input);
  const b = await sign(password, 'pw:' + password);
  return safeEqual(a, b);
}

export async function sessionCookie(password) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const sig = await sign(password, 'exp:' + exp);
  return `${COOKIE}=${exp}.${sig}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedCookie() {
  return `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function isLoggedIn(request, password) {
  const header = request.headers.get('Cookie') || '';
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  if (!match) return false;
  const [exp, sig] = match.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(await sign(password, 'exp:' + exp), sig);
}

const SHELL = (body) => `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>GlobalCare — ورود</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;color:#f3f1ff;font-family:Vazirmatn,Tahoma,"Segoe UI",sans-serif;
background:linear-gradient(180deg,#f0b6d3 0%,#b79af0 20%,#7480e6 42%,#3f4cae 68%,#1a2160 100%)}
.card{width:min(400px,100%);border:1px solid rgba(143,128,255,.35);border-radius:24px;padding:30px 26px;background:linear-gradient(165deg,rgba(21,18,70,.9),rgba(9,8,38,.94));box-shadow:0 30px 80px rgba(8,6,40,.6)}
.logo{display:flex;align-items:center;gap:12px;direction:ltr;margin-bottom:22px}.logo svg{width:44px;height:44px}.logo b{display:block;font:600 20px Inter,sans-serif}.logo small{color:#aeaadb;font:13px Inter,sans-serif}
h1{margin:0 0 6px;font-size:20px;font-weight:800}p{margin:0 0 18px;color:#aeaadb;font-size:13px;line-height:1.9}
label{display:block;font-size:13px;margin-bottom:8px}input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(143,128,255,.4);background:#0a083099;color:inherit;font:inherit;direction:ltr;text-align:left}
input:focus-visible,button:focus-visible{outline:2px solid #b9a7ff;outline-offset:2px}
button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:12px;background:linear-gradient(90deg,#7c5cff,#6a4ae6);color:#fff;font:700 14px Vazirmatn,Tahoma,sans-serif;cursor:pointer}
.err{margin:0 0 14px;padding:10px 12px;border:1px solid #8a2c55;background:#4d1833aa;border-radius:10px;color:#fda4af;font-size:13px}
code{direction:ltr;unicode-bidi:isolate;background:#ffffff14;border-radius:6px;padding:1px 6px}
</style></head><body><main class="card">
<div class="logo"><svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><path d="M24 42S6 31 6 17.5A9.5 9.5 0 0 1 24 13a9.5 9.5 0 0 1 18 4.5C42 31 24 42 24 42Z" fill="url(#g)"/><path d="M9 24h9l3-6 5 12 3-6h10" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><div><b>GlobalCare</b><small>Nursing Job Pipeline</small></div></div>
${body}</main></body></html>`;

const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

export function loginPage(error = '') {
  const html = SHELL(`<h1>ورود به داشبورد</h1><p>برای دیدن فرصت‌ها و درخواست‌ها، رمز عبور را وارد کن.</p>
${error ? `<div class="err" role="alert">${error}</div>` : ''}
<form method="post" action="/login"><label for="p">رمز عبور</label><input id="p" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">ورود</button></form>`);
  return new Response(html, { status: error ? 401 : 200, headers: HEADERS });
}

export function setupPage() {
  const html = SHELL(`<h1>ورود هنوز تنظیم نشده</h1><p>برای امنیت، تا وقتی رمز تعریف نشود هیچ‌چیز نمایش داده نمی‌شود.<br>در Cloudflare: Workers &amp; Pages ← این Worker ← Settings ← Variables and Secrets، یک <b>Secret</b> با نام <code>APP_PASSWORD</code> بساز و رمز دلخواه را بگذار.</p>`);
  return new Response(html, { status: 503, headers: HEADERS });
}
