import type {
  AdminBankMappingDetailV1,
  AdminBankMappingListItemV1,
  BulkUpdateAdminBankMappingStatusChangesV1,
  BulkUpdateAdminBankMappingStatusRequestV1,
  ListAdminBankMappingsRequestV1,
  UpdateAdminBankMappingChangesV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../../db/client.js';

export type AdminBankMappingListFilters = ListAdminBankMappingsRequestV1;
export type AdminBankMappingUpdateChanges = UpdateAdminBankMappingChangesV1;
export type AdminBankMappingBulkStatusChanges = BulkUpdateAdminBankMappingStatusChangesV1;

export interface AdminBankMappingActor {
  id: string;
  displayName: string;
}

export interface UpdateAdminBankMappingInput {
  bankId: string;
  expectedVersion: number;
  changes: AdminBankMappingUpdateChanges;
  actor: AdminBankMappingActor;
}

export type UpdateAdminBankMappingResult =
  | {
    status: 'updated';
    before: AdminBankMappingDetailV1;
    after: AdminBankMappingDetailV1;
  }
  | { status: 'not_found' }
  | { status: 'version_conflict' }
  | { status: 'active_without_objective_questions' };

export interface BulkUpdateAdminBankMappingStatusInput {
  items: BulkUpdateAdminBankMappingStatusRequestV1['items'];
  changes: AdminBankMappingBulkStatusChanges;
  actor: AdminBankMappingActor;
}

export interface BulkUpdateAdminBankMappingStatusResult {
  updated: Array<{
    bankId: string;
    version: number;
    before: AdminBankMappingDetailV1;
    after: AdminBankMappingDetailV1;
  }>;
  failed: Array<{ bankId: string; error: string }>;
}

export interface AdminBankMappingPage {
  bankMappings: AdminBankMappingListItemV1[];
  page: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AdminBankMappingRepository {
  listBankMappings(filters: AdminBankMappingListFilters): Promise<AdminBankMappingPage>;
  findBankMappingById(bankId: string): Promise<AdminBankMappingDetailV1 | null>;
  updateBankMapping(input: UpdateAdminBankMappingInput): Promise<UpdateAdminBankMappingResult>;
  bulkUpdateBankMappingStatus(
    input: BulkUpdateAdminBankMappingStatusInput,
  ): Promise<BulkUpdateAdminBankMappingStatusResult>;
}

export interface QueryRows<T> {
  rows: T[];
}

export interface AdminBankMappingRow {
  bank_id: string;
  raw_name: string;
  bank_name: string;
  subject_category: string;
  subject_name: string;
  parent_id: string | null;
  parent_name?: string | null;
  q_group: number | string;
  visible: boolean;
  status: string;
  difficulty: string;
  exam_purpose: string;
  question_types: unknown;
  audience: string;
  keywords: unknown;
  description: string;
  notes: string;
  question_count: number | string;
  descendant_question_count: number | string;
  objective_question_count: number | string | null;
  question_type_counts?: unknown;
  version: number | string;
  updated_at: Date | string;
  updated_by_admin_id: string | null;
  updated_by_display_name: string | null;
}
