CREATE TABLE IF NOT EXISTS import_job_events (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN ('queued', 'running', 'progress', 'succeeded', 'failed', 'cancelled', 'recovered')
  ),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_job_events_job_stream_idx
  ON import_job_events(job_id, id);
