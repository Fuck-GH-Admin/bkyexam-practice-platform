ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_login_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

UPDATE admin_users
SET password_changed_at = COALESCE(password_changed_at, created_at),
    updated_at = GREATEST(updated_at, created_at)
WHERE password_changed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_users_failed_login_count_check'
  ) THEN
    ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_failed_login_count_check CHECK (failed_login_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS admin_users_locked_until_idx
  ON admin_users(locked_until)
  WHERE locked_until IS NOT NULL;
