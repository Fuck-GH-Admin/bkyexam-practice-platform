CREATE TABLE IF NOT EXISTS student_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS student_sessions_student_id_idx ON student_sessions(student_id);
CREATE INDEX IF NOT EXISTS student_sessions_expires_at_idx ON student_sessions(expires_at);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  bank_id uuid NOT NULL REFERENCES classifications(id),
  mode text NOT NULL CHECK (mode IN ('random', 'sequential')),
  question_limit integer NOT NULL DEFAULT 70 CHECK (question_limit > 0),
  question_count integer NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  completed_count integer NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS practice_sessions_student_id_idx ON practice_sessions(student_id);
CREATE INDEX IF NOT EXISTS practice_sessions_bank_id_idx ON practice_sessions(bank_id);
CREATE INDEX IF NOT EXISTS practice_sessions_status_idx ON practice_sessions(status);

CREATE TABLE IF NOT EXISTS practice_session_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  sort integer NOT NULL CHECK (sort > 0),
  answered_at timestamptz,
  is_correct boolean,
  UNIQUE (session_id, question_id),
  UNIQUE (session_id, sort)
);

CREATE INDEX IF NOT EXISTS practice_session_questions_session_id_idx ON practice_session_questions(session_id);
CREATE INDEX IF NOT EXISTS practice_session_questions_question_id_idx ON practice_session_questions(question_id);
