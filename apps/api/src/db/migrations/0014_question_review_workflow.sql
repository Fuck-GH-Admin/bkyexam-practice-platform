CREATE TABLE IF NOT EXISTS question_override_revisions (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  base_version integer NOT NULL CHECK (base_version >= 0),
  status text NOT NULL CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected')),
  content_override text,
  answer_raw_override text,
  analyze_raw_override text,
  option_content_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  diff jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  created_by_admin_id uuid REFERENCES admin_users(id),
  submitted_at timestamptz,
  reviewed_by_admin_id uuid REFERENCES admin_users(id),
  reviewed_at timestamptz,
  review_note text NOT NULL DEFAULT '',
  applied_version integer CHECK (applied_version IS NULL OR applied_version >= 1),
  rollback_from_revision_id uuid REFERENCES question_override_revisions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (content_override IS NULL OR length(content_override) > 0),
  CHECK (jsonb_typeof(option_content_overrides) = 'array'),
  CHECK (jsonb_typeof(diff) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS question_override_revisions_one_active_idx
  ON question_override_revisions(question_id)
  WHERE status IN ('draft', 'pending_review');

CREATE INDEX IF NOT EXISTS question_override_revisions_question_history_idx
  ON question_override_revisions(question_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS question_override_revisions_pending_idx
  ON question_override_revisions(status, submitted_at, created_at)
  WHERE status = 'pending_review';

CREATE INDEX IF NOT EXISTS question_override_revisions_created_by_idx
  ON question_override_revisions(created_by_admin_id);

CREATE INDEX IF NOT EXISTS question_override_revisions_reviewed_by_idx
  ON question_override_revisions(reviewed_by_admin_id);
