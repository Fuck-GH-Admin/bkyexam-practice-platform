CREATE TABLE IF NOT EXISTS student_learning_goals (
  student_id uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  daily_attempts_target integer CHECK (
    daily_attempts_target IS NULL
    OR daily_attempts_target BETWEEN 1 AND 500
  ),
  weekly_active_days_target integer CHECK (
    weekly_active_days_target IS NULL
    OR weekly_active_days_target BETWEEN 1 AND 7
  ),
  wrong_questions_review_target integer CHECK (
    wrong_questions_review_target IS NULL
    OR wrong_questions_review_target BETWEEN 1 AND 100
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_learning_goals_updated_at_idx
  ON student_learning_goals(updated_at DESC);
