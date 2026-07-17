import type {
  AdminAuditLogEntryV1,
  AdminAuditLogListResponseV1,
  ListAdminAuditLogsRequestV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../db/client.js';

export type AuditResult = 'success' | 'failure';

export interface AuditLogInput {
  actorAdminId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  result?: AuditResult;
  createdAt?: Date;
}

export interface AuditLogEntry {
  actorAdminId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  before: unknown | null;
  after: unknown | null;
  metadata: Record<string, unknown>;
  result: AuditResult;
  createdAt: Date;
}

export interface AuditLogRepository {
  append(entry: AuditLogEntry): Promise<void>;
}

export interface AuditLogReadRepository {
  listAuditLogs(filters: ListAdminAuditLogsRequestV1): Promise<AdminAuditLogListResponseV1>;
}

export type AuditService = ReturnType<typeof createAuditService>;

interface QueryRows<T> {
  rows: T[];
}

interface AuditLogRow {
  id: string;
  actor_admin_id: string | null;
  actor_login_name: string | null;
  actor_display_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  before: unknown | null;
  after: unknown | null;
  metadata: unknown;
  result: AuditResult;
  created_at: Date | string;
}

function assertNonEmpty(value: string, name: string) {
  if (!value.trim()) {
    throw new Error(`${name} is required`);
  }
}

export function createAuditService(repository: AuditLogRepository) {
  return {
    async record(input: AuditLogInput, now = new Date()) {
      assertNonEmpty(input.action, 'action');
      assertNonEmpty(input.resourceType, 'resourceType');
      assertNonEmpty(input.resourceId, 'resourceId');

      await repository.append({
        actorAdminId: input.actorAdminId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: input.before ?? null,
        after: input.after ?? null,
        metadata: input.metadata ?? {},
        result: input.result ?? 'success',
        createdAt: input.createdAt ?? now,
      });
    },
  };
}

export function createMemoryAuditLogRepository(
  entries: AuditLogEntry[] = [],
): AuditLogRepository & AuditLogReadRepository & { entries: AuditLogEntry[] } {
  return {
    entries,
    async append(entry) {
      entries.push({
        ...entry,
        metadata: { ...entry.metadata },
      });
    },
    async listAuditLogs(filters) {
      const indexedEntries = entries.map((entry, index) => ({ entry, index }));
      const filtered = indexedEntries
        .filter(({ entry }) => matchesMemoryFilter(entry, filters))
        .sort((left, right) => right.entry.createdAt.getTime() - left.entry.createdAt.getTime());
      const pageEntries = filtered.slice(filters.offset, filters.offset + filters.limit + 1);
      const hasMore = pageEntries.length > filters.limit;

      return {
        auditLogs: pageEntries.slice(0, filters.limit).map(({ entry, index }) => mapMemoryAuditLogEntry(entry, index)),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore,
        },
      };
    },
  };
}

export function createPgAuditLogRepository(client: QueryClient): AuditLogRepository & AuditLogReadRepository {
  return {
    async append(entry) {
      await client.query(
        `
          INSERT INTO audit_logs (
            actor_admin_id,
            action,
            resource_type,
            resource_id,
            "before",
            "after",
            metadata,
            result,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
        `,
        [
          entry.actorAdminId,
          entry.action,
          entry.resourceType,
          entry.resourceId,
          JSON.stringify(entry.before),
          JSON.stringify(entry.after),
          JSON.stringify(entry.metadata),
          entry.result,
          entry.createdAt,
        ],
      );
    },
    async listAuditLogs(filters) {
      const params: unknown[] = [];
      const where: string[] = [];

      if (filters.actorAdminId) {
        addFilter(params, where, (placeholder) => `audit_logs.actor_admin_id = ${placeholder}`, filters.actorAdminId);
      }
      if (filters.action) {
        addFilter(params, where, (placeholder) => `audit_logs.action = ${placeholder}`, filters.action);
      }
      if (filters.resourceType) {
        addFilter(params, where, (placeholder) => `audit_logs.resource_type = ${placeholder}`, filters.resourceType);
      }
      if (filters.resourceId) {
        addFilter(params, where, (placeholder) => `audit_logs.resource_id = ${placeholder}`, filters.resourceId);
      }
      if (filters.result) {
        addFilter(params, where, (placeholder) => `audit_logs.result = ${placeholder}`, filters.result);
      }
      if (filters.createdFrom) {
        addFilter(params, where, (placeholder) => `audit_logs.created_at >= ${placeholder}::timestamptz`, filters.createdFrom);
      }
      if (filters.createdTo) {
        addFilter(params, where, (placeholder) => `audit_logs.created_at <= ${placeholder}::timestamptz`, filters.createdTo);
      }

      params.push(filters.limit + 1);
      const limitPlaceholder = `$${params.length}`;
      params.push(filters.offset);
      const offsetPlaceholder = `$${params.length}`;

      const result = (await client.query(
        `
          SELECT
            audit_logs.id,
            audit_logs.actor_admin_id,
            actor.login_name AS actor_login_name,
            actor.display_name AS actor_display_name,
            audit_logs.action,
            audit_logs.resource_type,
            audit_logs.resource_id,
            audit_logs."before",
            audit_logs."after",
            audit_logs.metadata,
            audit_logs.result,
            audit_logs.created_at
          FROM audit_logs
          LEFT JOIN admin_users actor ON actor.id = audit_logs.actor_admin_id
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
          LIMIT ${limitPlaceholder}
          OFFSET ${offsetPlaceholder}
        `,
        params,
      )) as QueryRows<AuditLogRow>;

      const rows = result.rows.slice(0, filters.limit);

      return {
        auditLogs: rows.map(mapAuditLogRow),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.rows.length > filters.limit,
        },
      };
    },
  };
}

function addFilter(
  params: unknown[],
  where: string[],
  condition: (placeholder: string) => string,
  value: unknown,
) {
  params.push(value);
  where.push(condition(`$${params.length}`));
}

function matchesMemoryFilter(entry: AuditLogEntry, filters: ListAdminAuditLogsRequestV1) {
  if (filters.actorAdminId && entry.actorAdminId !== filters.actorAdminId) return false;
  if (filters.action && entry.action !== filters.action) return false;
  if (filters.resourceType && entry.resourceType !== filters.resourceType) return false;
  if (filters.resourceId && entry.resourceId !== filters.resourceId) return false;
  if (filters.result && entry.result !== filters.result) return false;
  if (filters.createdFrom && entry.createdAt < new Date(filters.createdFrom)) return false;
  if (filters.createdTo && entry.createdAt > new Date(filters.createdTo)) return false;
  return true;
}

function mapMemoryAuditLogEntry(entry: AuditLogEntry, index: number): AdminAuditLogEntryV1 {
  return {
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    actor: isCanonicalUuid(entry.actorAdminId)
      ? {
        id: entry.actorAdminId,
        loginName: 'unknown',
        displayName: 'Unknown admin',
      }
      : null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    before: entry.before,
    after: entry.after,
    metadata: { ...entry.metadata },
    result: entry.result,
    createdAt: entry.createdAt.toISOString(),
  };
}

function mapAuditLogRow(row: AuditLogRow): AdminAuditLogEntryV1 {
  return {
    id: row.id,
    actor: row.actor_admin_id
      ? {
        id: row.actor_admin_id,
        loginName: row.actor_login_name ?? 'unknown',
        displayName: row.actor_display_name ?? 'Unknown admin',
      }
      : null,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    before: row.before,
    after: row.after,
    metadata: asRecord(row.metadata),
    result: row.result,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isCanonicalUuid(value: string | null): value is string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value ?? '');
}
