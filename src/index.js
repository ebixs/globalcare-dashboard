import { collect } from './collect.js';

const COUNTRIES = ['us', 'uk', 'au', 'nl'];

const cors = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
});

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
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  const meta = await env.DB.prepare('SELECT value FROM metadata WHERE key = ?').bind('last_success').first();
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

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, { headers: cors() });
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      let db = false;
      try { if (env.DB) { await env.DB.prepare('SELECT 1').first(); db = true; } } catch (e) { db = false; }
      return Response.json({ ok: true, db }, { headers: cors() });
    }

    if (url.pathname === '/api/jobs' && request.method === 'GET') {
      try {
        return await listJobs(url, env);
      } catch (e) {
        return Response.json({ error: String(e.message || e).slice(0, 200), jobs: [], count: 0 }, { status: 500, headers: cors() });
      }
    }

    // Manual collection trigger, protected by the ADMIN_TOKEN secret.
    if (url.pathname === '/api/collect' && request.method === 'POST') {
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

    if (url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404, headers: cors() });
    }

    // Everything else is the static dashboard.
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(collect(env));
  }
};
