CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('full_corpus_import')),
  mode text NOT NULL CHECK (mode IN ('dry_run', 'import')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  source_dir text NOT NULL,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_admin_id uuid REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS import_jobs_status_created_at_idx ON import_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_created_by_idx ON import_jobs(created_by_admin_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS import_jobs_one_running_kind_idx ON import_jobs(kind) WHERE status = 'running';
