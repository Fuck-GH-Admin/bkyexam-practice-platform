CREATE TABLE IF NOT EXISTS classifications (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  parent_id uuid,
  q_group integer NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY,
  classification_id uuid NOT NULL REFERENCES classifications(id),
  q_type integer NOT NULL,
  normalized_type text NOT NULL,
  q_group integer NOT NULL,
  content text NOT NULL,
  answer_raw text NOT NULL DEFAULT '',
  analyze_raw text,
  use_count integer NOT NULL DEFAULT 0,
  difficulty numeric,
  searchable_text text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS question_options (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions(id),
  sort integer NOT NULL,
  content text NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_mappings (
  bank_id uuid PRIMARY KEY REFERENCES classifications(id),
  subject_category text NOT NULL,
  subject_name text NOT NULL DEFAULT '未分类',
  bank_name text NOT NULL,
  raw_name text NOT NULL,
  parent_id uuid,
  q_group integer NOT NULL,
  visible boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'review',
  difficulty text NOT NULL DEFAULT 'unknown',
  exam_purpose text NOT NULL DEFAULT 'unknown',
  question_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  audience text NOT NULL DEFAULT 'unknown',
  keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  question_count integer NOT NULL DEFAULT 0,
  descendant_question_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY,
  login_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id),
  question_id uuid NOT NULL REFERENCES questions(id),
  bank_id uuid NOT NULL REFERENCES classifications(id),
  answer text NOT NULL DEFAULT '',
  is_correct boolean,
  source text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wrong_questions (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id),
  question_id uuid NOT NULL REFERENCES questions(id),
  bank_id uuid NOT NULL REFERENCES classifications(id),
  wrong_count integer NOT NULL DEFAULT 1,
  last_answer text NOT NULL DEFAULT '',
  mastered boolean NOT NULL DEFAULT false,
  mastered_at timestamptz,
  source text NOT NULL DEFAULT 'auto',
  last_wrong_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classifications_parent_id_idx ON classifications(parent_id);
CREATE INDEX IF NOT EXISTS classifications_q_group_idx ON classifications(q_group);

CREATE INDEX IF NOT EXISTS questions_classification_id_idx ON questions(classification_id);
CREATE INDEX IF NOT EXISTS questions_normalized_type_idx ON questions(normalized_type);

CREATE INDEX IF NOT EXISTS question_options_question_id_idx ON question_options(question_id);

CREATE INDEX IF NOT EXISTS bank_mappings_subject_category_idx ON bank_mappings(subject_category);
CREATE INDEX IF NOT EXISTS bank_mappings_visible_idx ON bank_mappings(visible);

CREATE INDEX IF NOT EXISTS practice_attempts_student_id_idx ON practice_attempts(student_id);
CREATE INDEX IF NOT EXISTS practice_attempts_question_id_idx ON practice_attempts(question_id);

CREATE INDEX IF NOT EXISTS wrong_questions_student_id_idx ON wrong_questions(student_id);
CREATE INDEX IF NOT EXISTS wrong_questions_bank_id_idx ON wrong_questions(bank_id);
CREATE UNIQUE INDEX IF NOT EXISTS wrong_questions_student_question_bank_unique_idx ON wrong_questions(student_id, question_id, bank_id);
