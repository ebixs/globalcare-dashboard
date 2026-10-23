-- Run once in the D1 Console if the jobs table was created from the older schema
-- (it only allowed us, uk, au, nl). Safe on an empty table.
DROP TABLE IF EXISTS jobs_old;
ALTER TABLE jobs RENAME TO jobs_old;
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  country TEXT NOT NULL CHECK(country IN ('us','uk','au','ca','nl','no')),
  source TEXT,
  url TEXT NOT NULL,
  posted_at TEXT,
  collected_at TEXT NOT NULL
);
INSERT INTO jobs SELECT * FROM jobs_old;
DROP TABLE jobs_old;
DROP INDEX IF EXISTS idx_jobs_country_date;
CREATE INDEX idx_jobs_country_date ON jobs(country, posted_at DESC);
