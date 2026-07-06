ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS current_sort integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practice_sessions_current_sort_positive_check'
  ) THEN
    ALTER TABLE practice_sessions
      ADD CONSTRAINT practice_sessions_current_sort_positive_check CHECK (current_sort > 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS practice_session_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  draft_answer text NOT NULL DEFAULT '',
  marked_for_review boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_session_drafts_session_id_idx ON practice_session_drafts(session_id);
CREATE INDEX IF NOT EXISTS practice_session_drafts_student_id_idx ON practice_session_drafts(student_id);
CREATE INDEX IF NOT EXISTS practice_session_drafts_question_id_idx ON practice_session_drafts(question_id);
CREATE UNIQUE INDEX IF NOT EXISTS practice_session_drafts_session_question_unique_idx ON practice_session_drafts(session_id, question_id);
