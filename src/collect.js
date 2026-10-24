// Collects public nursing-job listings into D1.
// Sources: Arbeitnow public feeds (no key) and Adzuna (needs ADZUNA_APP_ID / ADZUNA_APP_KEY secrets).

const ARBEITNOW_FEEDS = [
  { name: 'Arbeitnow EU', url: 'https://www.arbeitnow.com/api/job-board-api' },
  { name: 'Arbeitnow UK', url: 'https://www.arbeitnow.co.uk/api/job-board-api' }
];

// Adzuna country code -> dashboard country code, with the search terms to run.
const ADZUNA_MARKETS = [
  { code: 'gb', country: 'uk', terms: ['nurse'] },
  { code: 'us', country: 'us', terms: ['registered nurse'] },
  { code: 'au', country: 'au', terms: ['registered nurse'] },
  { code: 'nl', country: 'nl', terms: ['verpleegkundige', 'nurse'] }
];

const NURSING = /\bnurs(e|ing|es)\b|registered nurse|staff nurse|healthcare assistant|care assistant|midwi(fe|fery)|verpleegkundige|pflegefach|pflegekraft|clinical support worker|patient care/i;

function countryOf(s = '') {
  s = s.toLowerCase();
  if (/united states|\busa\b|u\.s\.a|america|new york|california|texas|florida|boston|chicago/.test(s)) return 'us';
  if (/united kingdom|\buk\b|england|scotland|wales|northern ireland|london|manchester|birmingham/.test(s)) return 'uk';
  if (/australia|sydney|melbourne|brisbane|perth|adelaide/.test(s)) return 'au';
  if (/netherlands|nederland|holland|amsterdam|rotterdam|utrecht|eindhoven/.test(s)) return 'nl';
  return 'other';
}

function toIso(raw) {
  if (!raw) return null;
  const d = typeof raw === 'number' ? new Date(raw * 1000) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const clean = (s) => String(s || '').replace(/app_(id|key)=[^&\s]+/g, 'app_$1=***');
const text = (v, n = 300) => String(v == null ? '' : v).slice(0, n);

async function collectArbeitnow(collected) {
  const rows = [], errors = [];
  for (const feed of ARBEITNOW_FEEDS) {
    try {
      const r = await fetch(feed.url, { headers: { Accept: 'application/json', 'User-Agent': 'GlobalCareJobPipeline/1.0' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      const items = Array.isArray(body.data) ? body.data : (Array.isArray(body) ? body : []);
      for (const j of items) {
        const title = text(j.title), company = text(j.company_name || j.company), location = text(j.location), desc = String(j.description || '');
        if (!NURSING.test(`${title} ${desc} ${(j.tags || []).join(' ')}`)) continue;
        const country = countryOf(`${location} ${title} ${desc.slice(0, 2000)}`);
        if (country === 'other') continue;
        const link = String(j.url || '');
        if (!/^https?:\/\//i.test(link)) continue;
        rows.push({ id: link, title, company, location, country, source: feed.name, url: link, posted: toIso(j.created_at), collected });
      }
    } catch (e) {
      errors.push(`${feed.name}: ${clean(e.message || e)}`);
    }
  }
  return { rows, errors };
}

async function collectAdzuna(env, collected) {
  const rows = [], errors = [];
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) return { rows, errors, configured: false };
  for (const m of ADZUNA_MARKETS) {
    for (const term of m.terms) {
      try {
        const u = new URL(`https://api.adzuna.com/v1/api/jobs/${m.code}/search/1`);
        u.searchParams.set('app_id', env.ADZUNA_APP_ID);
        u.searchParams.set('app_key', env.ADZUNA_APP_KEY);
        u.searchParams.set('what', term);
        u.searchParams.set('results_per_page', '50');
        u.searchParams.set('sort_by', 'date');
        u.searchParams.set('max_days_old', '30');
        const r = await fetch(u.toString(), { headers: { Accept: 'application/json', 'User-Agent': 'GlobalCareJobPipeline/1.0' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = await r.json();
        for (const j of Array.isArray(body.results) ? body.results : []) {
          const title = text(j.title);
          if (!NURSING.test(title)) continue;
          const link = String(j.redirect_url || '');
          if (!/^https?:\/\//i.test(link)) continue;
          rows.push({
            id: j.id ? `adzuna:${j.id}` : link,
            title,
            company: text(j.company && j.company.display_name),
            location: text(j.location && j.location.display_name),
            country: m.country,
            source: 'Adzuna',
            url: link,
            posted: toIso(j.created),
            collected
          });
        }
      } catch (e) {
        errors.push(`Adzuna ${m.code} "${term}": ${clean(e.message || e)}`);
      }
    }
  }
  return { rows, errors, configured: true };
}

async function upsert(env, rows) {
  const sql = 'INSERT INTO jobs (id,title,company,location,country,source,url,posted_at,collected_at) VALUES (?,?,?,?,?,?,?,?,?) ' +
    'ON CONFLICT(id) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,country=excluded.country,' +
    'source=excluded.source,url=excluded.url,posted_at=excluded.posted_at,collected_at=excluded.collected_at';
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50).map(r => env.DB.prepare(sql).bind(r.id, r.title, r.company, r.location, r.country, r.source, r.url, r.posted, r.collected));
    await env.DB.batch(batch);
  }
}

const setMeta = (env, key, value) =>
  env.DB.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run();

export async function collect(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  const collected = new Date().toISOString();
  await setMeta(env, 'last_attempt', collected);

  const [a, z] = await Promise.all([collectArbeitnow(collected), collectAdzuna(env, collected)]);
  const errors = [...a.errors, ...z.errors];

  const unique = new Map();
  for (const r of [...a.rows, ...z.rows]) unique.set(r.id, r);
  const rows = [...unique.values()];
  await upsert(env, rows);

  const sources = {};
  for (const r of rows) sources[r.source] = (sources[r.source] || 0) + 1;

  if (rows.length > 0 || errors.length === 0) await setMeta(env, 'last_success', collected);
  const summary = { collected, matched: rows.length, sources, adzuna: z.configured, errors };
  await setMeta(env, 'last_run_summary', JSON.stringify(summary));
  return summary;
}
