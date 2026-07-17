ALTER TABLE students
  ADD COLUMN IF NOT EXISTS class_name text,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_login_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by_admin_id uuid REFERENCES admin_users(id);

UPDATE students
SET class_name = '2班',
    updated_at = now()
WHERE class_name IS NULL
  AND login_name ~ '^\d{12}$'
  AND login_name >= '202502040201'
  AND login_name <= '202502040230';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_status_check'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_status_check CHECK (status IN ('active', 'disabled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_failed_login_count_check'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_failed_login_count_check CHECK (failed_login_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS students_status_idx ON students(status);
CREATE INDEX IF NOT EXISTS students_class_name_idx ON students(class_name);
CREATE INDEX IF NOT EXISTS students_group_name_idx ON students(group_name);
CREATE INDEX IF NOT EXISTS students_locked_until_idx ON students(locked_until)
  WHERE locked_until IS NOT NULL;
