ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS worker_id text;

ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

CREATE INDEX IF NOT EXISTS import_jobs_worker_scan_idx
  ON import_jobs(status, heartbeat_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS import_jobs_one_active_kind_idx
  ON import_jobs(kind)
  WHERE status IN ('queued', 'running');
