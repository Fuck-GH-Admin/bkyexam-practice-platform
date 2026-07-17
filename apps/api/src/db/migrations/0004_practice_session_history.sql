ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'bank';

UPDATE practice_sessions
SET origin = 'bank'
WHERE origin IS NULL
  OR origin NOT IN ('bank', 'wrongbook');

ALTER TABLE practice_sessions
  ALTER COLUMN origin SET DEFAULT 'bank',
  ALTER COLUMN origin SET NOT NULL;

UPDATE practice_sessions
SET completed_at = COALESCE(completed_at, updated_at, created_at)
WHERE status = 'completed'
  AND completed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practice_sessions_origin_check'
  ) THEN
    ALTER TABLE practice_sessions
      ADD CONSTRAINT practice_sessions_origin_check CHECK (origin IN ('bank', 'wrongbook'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS practice_sessions_student_status_updated_at_idx
  ON practice_sessions(student_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS practice_sessions_student_completed_at_idx
  ON practice_sessions(student_id, completed_at DESC, id DESC)
  WHERE status = 'completed';
