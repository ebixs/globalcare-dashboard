# GlobalCare Dashboard

A nursing-job discovery dashboard for exploring public listings and preparing a deployment with Cloudflare Pages, D1, and a scheduled Worker.

## Project status

This repository contains the application source and deployment configuration. A GitHub commit alone does not publish the site; Cloudflare configuration and a successful deployment are still required.

## Features

- Responsive job-search dashboard
- Public job-feed fallback when the API is unavailable
- Cloudflare Pages Functions API endpoint
- Worker-based scheduled job collection
- D1 database schema

## Repository layout

- `index.html` — dashboard UI
- `functions/api/jobs.js` — Pages API endpoint
- `collector/worker.js` — scheduled collector
- `collector/wrangler.toml` — Worker configuration template
- `sql/schema.sql` — D1 schema
- `.github/workflows/deploy-pages.yml` — GitHub Actions deployment workflow
- `README_FA.md` — Persian setup and deployment guide

## Important limitations

Listings are informational and may be incomplete or stale. Verify each role and eligibility requirements on the employer's official website. The current collector uses public feeds and keyword-based filtering; it is not a comprehensive search of every employer or country. The dashboard does not submit job applications.

## Deployment overview

1. Read `README_FA.md` and configure the required Cloudflare resources.
2. Set the repository secrets and variables required by `.github/workflows/deploy-pages.yml`.
3. Configure the D1 database and Worker bindings using the provided templates.
4. Push to `main`, then verify the GitHub Actions run and deployed Pages URL.

Never commit API tokens, passwords, or other secrets.
