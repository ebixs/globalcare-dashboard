CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  country TEXT NOT NULL CHECK(country IN ('us','uk','au','nl')),
  source TEXT,
  url TEXT NOT NULL,
  posted_at TEXT,
  collected_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_country_date ON jobs(country, posted_at DESC);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
