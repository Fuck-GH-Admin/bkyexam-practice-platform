CREATE TABLE IF NOT EXISTS question_quality_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  bank_id uuid REFERENCES classifications(id),
  flag_type text NOT NULL CHECK (
    flag_type IN (
      'bad_answer',
      'missing_option',
      'bad_option',
      'garbled_content',
      'duplicate_question',
      'wrong_type',
      'needs_manual_review'
    )
  ),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'blocking')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  note text NOT NULL DEFAULT '',
  excluded_from_practice boolean NOT NULL DEFAULT false,
  created_by_admin_id uuid REFERENCES admin_users(id),
  resolved_by_admin_id uuid REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS question_quality_flags_question_id_idx
  ON question_quality_flags(question_id);
CREATE INDEX IF NOT EXISTS question_quality_flags_bank_status_idx
  ON question_quality_flags(bank_id, status);
CREATE INDEX IF NOT EXISTS question_quality_flags_type_status_idx
  ON question_quality_flags(flag_type, status);
CREATE INDEX IF NOT EXISTS question_quality_flags_excluded_open_idx
  ON question_quality_flags(question_id)
  WHERE excluded_from_practice = true AND status = 'open';
