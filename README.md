# GlobalCare Dashboard

A nursing-job discovery dashboard for exploring public listings. It runs as a single Cloudflare Worker that serves the static dashboard, a read-only jobs API, and a daily collector backed by a D1 database.

## Project status

The dashboard is deployed from this repository through Cloudflare's Git integration. Listings only appear after the D1 database has data, which the daily collector (or a manual trigger) provides. Until then the dashboard shows clearly labelled sample cards.

## Features

- Responsive Persian (RTL) job-search dashboard
- Clearly labelled sample cards when the API has no data
- `/api/jobs` read-only endpoint backed by D1
- Scheduled daily collection from public job feeds (every 6 hours)
- D1 database schema

## Repository layout

- `src/dashboard.html` — dashboard UI (served by the Worker, only after login)
- `public/assets/` — decorative images (public, no private data)
- `src/index.js` — Worker entry: `/api/jobs`, `/api/collect`, static assets, cron handler
- `src/apply.js` — cover letters, applications, employer replies, CV storage (all behind login)
- `src/collect.js` — feed collector that writes to D1
- `wrangler.jsonc` — Worker, assets, D1 binding and cron configuration
- `sql/schema.sql` — D1 schema
- `README_FA.md` — Persian setup guide

## Important limitations

Listings are informational and may be incomplete or stale. Verify each role and eligibility requirements on the employer's official website. The collector uses public feeds and keyword-based filtering; it is not a comprehensive search of every employer or country. The dashboard does not submit job applications: it drafts a cover letter per listing (Cloudflare Workers AI, with a plain template fallback), the applicant sends the application herself on the employer's site, then records it here. Employer replies are pasted into the Notices page and linked to the application by a reference code (IMATI-XXXXXX). Personal data (CV text, letters) is stored only in D1 behind the login, never in this repository.

## Setup overview

1. Create a D1 database and run `sql/schema.sql` in its Console.
2. Put the database ID in `wrangler.jsonc`.
3. Connect this repository to a Cloudflare Worker named `globalcare-dashboard` (Workers & Pages → Git integration).
   Target countries: US, UK, Australia, Netherlands, Turkey (Turkey has no free job API, so its listings come from search links and the manual "add listing" button).
4. Set a `APP_PASSWORD` secret (Workers & Pages → the Worker → Settings → Variables and Secrets → type **Secret**). Without it the site shows only a setup notice. Everything, including the API, requires this password.
5. Optional, for real listings: create a free Adzuna developer account and set two Secrets, `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. Check Adzuna's terms and keep the "Jobs by Adzuna" attribution. Without the keys only the small public Arbeitnow feeds are used.
6. Optional extra sources, each only active when its free API key is set as a Secret: `REED_API_KEY` (UK, Reed) and `JOOBLE_API_KEY` (Jooble, all four countries). Indeed and LinkedIn have no public job API and forbid scraping, so listings found there are added with the "add listing" button.
7. Optionally set an `ADMIN_TOKEN` secret to allow a manual `POST /api/collect` with `Authorization: Bearer <token>`.

Never commit API tokens, passwords, or other secrets.
