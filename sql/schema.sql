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

-- Added for cover letters / applications / employer replies (the Worker also creates these on first use).
CREATE TABLE IF NOT EXISTS profile (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT, job_id TEXT, title TEXT, company TEXT, location TEXT, country TEXT,
  url TEXT, letter TEXT, cv_snapshot TEXT, status TEXT DEFAULT 'sent', sent_at TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER, from_name TEXT, subject TEXT, body TEXT,
  received_at TEXT, created_at TEXT, is_read INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_notices_app ON notices(application_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_job ON applications(job_id);
