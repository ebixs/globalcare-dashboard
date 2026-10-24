import { collect } from './collect.js';
import dashboardHtml from './dashboard.html';
import { isLoggedIn, passwordMatches, sessionCookie, clearedCookie, loginPage, setupPage } from './auth.js';

const COUNTRIES = ['us', 'uk', 'au', 'nl'];

const cors = () => ({ 'Cache-Control': 'no-store' });

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('Database timeout')), ms))
]);

async function listJobs(url, env) {
  if (!env.DB) {
    return Response.json({ error: 'D1 binding DB is not configured', jobs: [], count: 0 }, { status: 503, headers: cors() });
  }
  const country = (url.searchParams.get('country') || '').toLowerCase();
  const q = (url.searchParams.get('q') || '').slice(0, 100);
  let sql = 'SELECT title, company, location, country, source, url, posted_at, collected_at FROM jobs WHERE 1=1';
  const args = [];
  if (COUNTRIES.includes(country)) { sql += ' AND country = ?'; args.push(country); }
  if (q) { sql += ' AND (title LIKE ? OR company LIKE ? OR location LIKE ?)'; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY COALESCE(posted_at, collected_at) DESC LIMIT 200';
  const { results } = await withTimeout(env.DB.prepare(sql).bind(...args).all(), 6000);
  const meta = await withTimeout(env.DB.prepare('SELECT value FROM metadata WHERE key = ?').bind('last_success').first(), 6000);
  return Response.json({
    jobs: results,
    count: results.length,
    last_success: meta?.value || null,
    source_coverage: 'Public Arbeitnow feeds only; not comprehensive.'
  }, { headers: cors() });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const isApi = path.startsWith('/api/');

    // Manual collection trigger: its own bearer token, independent of the login.
    if (path === '/api/collect' && request.method === 'POST') {
      if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
        return new Response('Unauthorized', { status: 401, headers: cors() });
      }
      try {
        await collect(env);
        return Response.json({ ok: true, message: 'Collection finished' }, { headers: cors() });
      } catch (e) {
        return Response.json({ ok: false, error: String(e.message || e).slice(0, 200) }, { status: 500, headers: cors() });
      }
    }

    // Reveals nothing private: only whether the Worker, database and tables respond.
    if (path === '/api/health' && request.method === 'GET') {
      const check = async (sql) => { try { await withTimeout(env.DB.prepare(sql).first(), 4000); return true; } catch (e) { console.error('health check failed', sql, String(e && e.message || e)); return false; } };
      const hasDb = Boolean(env.DB);
      const jobs = hasDb ? await check('SELECT 1 FROM jobs LIMIT 1') : false;
      const metadata = hasDb ? await check('SELECT 1 FROM metadata LIMIT 1') : false;
      return Response.json({ ok: true, db: hasDb, tables: { jobs, metadata }, login: Boolean(env.APP_PASSWORD) }, { headers: cors() });
    }

    // Fail closed: without APP_PASSWORD nothing else is served.
    const password = env.APP_PASSWORD;
    if (!password) {
      return isApi ? Response.json({ error: 'Login is not configured' }, { status: 503, headers: cors() }) : setupPage();
    }

    if (path === '/login' && request.method === 'POST') {
      let input = '';
      try { input = String((await request.formData()).get('password') || '').slice(0, 200); } catch (e) { input = ''; }
      if (input && await passwordMatches(input, password)) {
        return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': await sessionCookie(password), 'Cache-Control': 'no-store' } });
      }
      await new Promise(r => setTimeout(r, 800)); // slow down guessing
      return loginPage('رمز عبور درست نیست.');
    }

    if (path === '/logout' && request.method === 'POST') {
      return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': clearedCookie(), 'Cache-Control': 'no-store' } });
    }

    if (!(await isLoggedIn(request, password))) {
      return isApi ? Response.json({ error: 'Login required' }, { status: 401, headers: cors() }) : loginPage();
    }

    if (path === '/api/jobs' && request.method === 'GET') {
      try {
        return await listJobs(url, env);
      } catch (e) {
        console.error('jobs query failed', String(e && e.message || e));
        return Response.json({ error: String(e.message || e).slice(0, 200), jobs: [], count: 0 }, { status: 500, headers: cors() });
      }
    }

    if (isApi) return new Response('Not found', { status: 404, headers: cors() });

    // The dashboard page is served by the Worker, so it is only visible after login.
    if ((path === '/' || path === '/index.html') && request.method === 'GET') {
      return new Response(dashboardHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    // Decorative images only (no private data).
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(collect(env));
  }
};
