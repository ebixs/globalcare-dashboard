const FEEDS = [
  { name: 'Arbeitnow EU', url: 'https://www.arbeitnow.com/api/job-board-api' },
  { name: 'Arbeitnow UK', url: 'https://www.arbeitnow.co.uk/api/job-board-api' }
];
const NURSING = /\bnurs(e|ing|es)\b|registered nurse|staff nurse|healthcare assistant|care assistant|midwi(fe|fery)|verpleegkundige|pflegefach|pflegekraft|clinical support worker|patient care/i;
function countryOf(s='') { s=s.toLowerCase(); if (/united states|\busa\b|u\.s\.a|america|new york|california|texas|florida|boston|chicago/.test(s)) return 'us'; if (/united kingdom|\buk\b|england|scotland|wales|northern ireland|london|manchester|birmingham/.test(s)) return 'uk'; if (/australia|sydney|melbourne|brisbane|perth|adelaide/.test(s)) return 'au'; if (/netherlands|nederland|holland|amsterdam|rotterdam|utrecht|eindhoven/.test(s)) return 'nl'; if (/canada|toronto|vancouver|montreal|calgary|ottawa|edmonton|ontario|british columbia|alberta|quebec/.test(s)) return 'ca'; if (/norway|norge|oslo|bergen|trondheim|stavanger|tromsø|tromso/.test(s)) return 'no'; return 'other'; }
export async function collect(env) {
 if (!env.DB) throw new Error('D1 binding DB is not configured');
 const collected = new Date().toISOString(); let total = 0; const errors=[];
 for (const feed of FEEDS) { try { const r=await fetch(feed.url,{headers:{Accept:'application/json','User-Agent':'GlobalCareJobPipeline/1.0'}}); if(!r.ok) throw new Error(`HTTP ${r.status}`); const body=await r.json(); const items=Array.isArray(body.data)?body.data:(Array.isArray(body)?body:[]);
 for (const j of items) { const title=String(j.title||'').slice(0,300), company=String(j.company_name||j.company||'').slice(0,300), location=String(j.location||'').slice(0,300), desc=String(j.description||''); if(!NURSING.test(`${title} ${desc} ${(j.tags||[]).join(' ')}`)) continue; const country=countryOf(`${location} ${title} ${desc.slice(0,2000)}`); if(country==='other') continue; const link=String(j.url||''); if(!/^https?:\/\//i.test(link)) continue; const rawDate=j.created_at; let posted=null; if(rawDate){ const parsed=typeof rawDate==='number'?new Date(rawDate*1000):new Date(rawDate); if(!Number.isNaN(parsed.getTime())) posted=parsed.toISOString(); }
 try { await env.DB.prepare('INSERT INTO jobs (id,title,company,location,country,source,url,posted_at,collected_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,country=excluded.country,source=excluded.source,url=excluded.url,posted_at=excluded.posted_at,collected_at=excluded.collected_at').bind(link,title,company,location,country,feed.name,link,posted,collected).run(); total++; } catch(_rowErr) { /* skip rows the schema rejects, e.g. before the Canada/Norway migration */ } }
 } catch(e) { errors.push(`${feed.name}: ${String(e.message||e)}`); } }
 await env.DB.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('last_attempt',collected).run();
 if(total>0 || errors.length===0) await env.DB.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('last_success',collected).run();
 await env.DB.prepare('INSERT INTO metadata(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('last_run_summary',JSON.stringify({collected,matched:total,errors})).run();
}
