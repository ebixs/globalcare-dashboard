export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });
  if (url.pathname === '/api/jobs') {
    if (!env.DB) return Response.json({ error: 'D1 binding DB is not configured', jobs: [], count: 0 }, { status: 503, headers: cors() });
    const country = (url.searchParams.get('country') || '').toLowerCase();
    const q = (url.searchParams.get('q') || '').slice(0, 100);
    let sql = 'SELECT title, company, location, country, source, url, posted_at, collected_at FROM jobs WHERE 1=1';
    const args = [];
    if (['us','uk','au','nl'].includes(country)) { sql += ' AND country = ?'; args.push(country); }
    if (q) { sql += ' AND (title LIKE ? OR company LIKE ? OR location LIKE ?)'; args.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    sql += ' ORDER BY COALESCE(posted_at, collected_at) DESC LIMIT 200';
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    const meta = await env.DB.prepare('SELECT value FROM metadata WHERE key = ?').bind('last_success').first();
    return Response.json({ jobs: results, count: results.length, last_success: meta?.value || null, source_coverage: 'Public Arbeitnow feeds only; not comprehensive.' }, { headers: cors() });
  }
  return new Response('Not found', { status: 404, headers: cors() });
}
function cors(){ return { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Cache-Control':'no-store' }; }
