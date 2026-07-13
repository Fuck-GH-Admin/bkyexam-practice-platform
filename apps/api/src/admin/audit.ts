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

export type AuditService = ReturnType<typeof createAuditService>;

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
): AuditLogRepository & { entries: AuditLogEntry[] } {
  return {
    entries,
    async append(entry) {
      entries.push({
        ...entry,
        metadata: { ...entry.metadata },
      });
    },
  };
}

export function createPgAuditLogRepository(client: QueryClient): AuditLogRepository {
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
  };
}
