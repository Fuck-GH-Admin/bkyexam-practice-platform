import type {
  AdminQuestionReviewDetailV1,
  AdminQuestionReviewFlagV1,
  AdminQuestionReviewItemV1,
  ListAdminQuestionReviewsRequestV1,
  UpdateAdminQuestionOverrideRequestV1,
  UpdateAdminQuestionReviewRequestV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../../db/client.js';

export type AdminQuestionReviewListFilters = ListAdminQuestionReviewsRequestV1;

export interface AdminQuestionReviewPage {
  questions: AdminQuestionReviewItemV1[];
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AdminQuestionReviewActor {
  id: string;
  displayName: string;
}

export interface UpdateAdminQuestionReviewInput {
  questionId: string;
  changes: UpdateAdminQuestionReviewRequestV1;
  actor: AdminQuestionReviewActor;
}

export type UpdateAdminQuestionReviewResult =
  | {
    status: 'updated';
    before: AdminQuestionReviewDetailV1;
    after: AdminQuestionReviewDetailV1;
    addedFlags: AdminQuestionReviewFlagV1[];
    resolvedFlags: AdminQuestionReviewFlagV1[];
    ignoredFlags: AdminQuestionReviewFlagV1[];
  }
  | { status: 'question_not_found' }
  | { status: 'flag_not_found' };

export interface UpdateAdminQuestionOverrideInput {
  questionId: string;
  changes: UpdateAdminQuestionOverrideRequestV1;
  actor: AdminQuestionReviewActor;
}

export type UpdateAdminQuestionOverrideResult =
  | {
    status: 'updated';
    before: AdminQuestionReviewDetailV1;
    after: AdminQuestionReviewDetailV1;
  }
  | { status: 'question_not_found' }
  | { status: 'version_conflict'; current: AdminQuestionReviewDetailV1 }
  | { status: 'option_not_found' };

export interface AdminQuestionReviewRepository {
  listQuestionReviews(filters: AdminQuestionReviewListFilters): Promise<AdminQuestionReviewPage>;
  getQuestionReview(questionId: string): Promise<AdminQuestionReviewDetailV1 | null>;
  updateQuestionReview(input: UpdateAdminQuestionReviewInput): Promise<UpdateAdminQuestionReviewResult>;
  updateQuestionOverride(input: UpdateAdminQuestionOverrideInput): Promise<UpdateAdminQuestionOverrideResult>;
}

export interface QueryRows<T> {
  rows: T[];
}

export interface QuestionReviewRow {
  question_id: string;
  bank_id: string;
  bank_name: string;
  question_type: string;
  content_preview: string;
  option_count: string | number;
  answer_preview: string;
  flags: unknown;
  excluded_from_practice: boolean | null;
}

export interface QuestionContextRow {
  question_id: string;
  bank_id: string;
  bank_name: string;
  question_type: string;
  content_preview: string;
  option_count: string | number;
  answer_preview: string;
}

export interface QuestionCoreRow {
  question_id: string;
  bank_id: string;
  bank_name: string;
  question_type: string;
  option_count: string | number;
  effective_content: string;
  effective_answer_raw: string;
  effective_analyze_raw: string | null;
  override_version: string | number | null;
  content_override: string | null;
  answer_raw_override: string | null;
  analyze_raw_override: string | null;
  override_note: string | null;
  override_updated_at: Date | string | null;
  override_updated_by_admin_id: string | null;
  override_updated_by_display_name: string | null;
  excluded_from_practice: boolean | null;
}

export interface QuestionOptionRow {
  id: string;
  question_id: string;
  sort: string | number;
  content: string;
  override_content: string | null;
}

export interface FlagRow {
  id: string;
  flag_type: string;
  severity: string;
  status: string;
  note: string;
  created_at: Date | string;
  created_by_admin_id: string | null;
  created_by_display_name: string | null;
  resolved_at: Date | string | null;
  resolved_by_admin_id: string | null;
  resolved_by_display_name: string | null;
}

export type TransactionClient = QueryClient & { release?: () => void };

export interface ConnectableQueryClient extends QueryClient {
  connect(): Promise<TransactionClient>;
}
