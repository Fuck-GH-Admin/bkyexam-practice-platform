CREATE TABLE IF NOT EXISTS question_overrides (
  question_id uuid PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  content_override text,
  answer_raw_override text,
  analyze_raw_override text,
  note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by_admin_id uuid REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (content_override IS NULL OR length(content_override) > 0)
);

CREATE TABLE IF NOT EXISTS question_option_overrides (
  option_id uuid PRIMARY KEY REFERENCES question_options(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  content_override text NOT NULL CHECK (length(content_override) > 0),
  updated_by_admin_id uuid REFERENCES admin_users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_overrides_updated_by_admin_id_idx
  ON question_overrides(updated_by_admin_id);

CREATE INDEX IF NOT EXISTS question_overrides_updated_at_idx
  ON question_overrides(updated_at DESC);

CREATE INDEX IF NOT EXISTS question_option_overrides_question_id_idx
  ON question_option_overrides(question_id);

CREATE INDEX IF NOT EXISTS question_option_overrides_updated_by_admin_id_idx
  ON question_option_overrides(updated_by_admin_id);
