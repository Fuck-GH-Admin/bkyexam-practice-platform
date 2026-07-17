CREATE TABLE IF NOT EXISTS question_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  bank_id uuid NOT NULL REFERENCES classifications(id),
  favorite boolean NOT NULL DEFAULT false,
  long_term_review boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'practice_review', 'wrongbook')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (favorite = true OR long_term_review = true),
  UNIQUE (student_id, question_id, bank_id)
);

CREATE INDEX IF NOT EXISTS question_bookmarks_student_updated_at_idx
  ON question_bookmarks(student_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS question_bookmarks_student_bank_idx
  ON question_bookmarks(student_id, bank_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS question_bookmarks_question_id_idx
  ON question_bookmarks(question_id);
