import type {
  AdminStudentV1,
  BulkCreateAdminStudentsRequestV1,
  BulkCreateAdminStudentsResponseV1,
  CreateAdminStudentRequestV1,
  ListAdminStudentsRequestV1,
  ResetAdminStudentPasswordRequestV1,
  UpdateAdminStudentRequestV1,
} from '@bkyexam-practice/shared';
import { hashPassword } from '../../auth/password.js';
import type { AdminStudentRepository } from './types.js';
import { normalizeCreateClassName, normalizeDisplayName, normalizeNullableText } from './utils.js';

export function createAdminStudentService(repository: AdminStudentRepository) {
  return {
    listStudents(filters: ListAdminStudentsRequestV1) {
      return repository.listStudents(filters);
    },

    findStudentById(studentId: string) {
      return repository.findStudentById(studentId);
    },

    async createStudent(
      request: CreateAdminStudentRequestV1,
      actor: { id: string; displayName: string },
      now = new Date(),
    ) {
      const loginName = request.loginName.trim();
      const passwordResetRequired = request.passwordResetRequired;

      return repository.createStudent({
        loginName,
        displayName: normalizeDisplayName(request.displayName, loginName),
        passwordHash: await hashPassword(request.initialPassword),
        className: normalizeCreateClassName(request.className, loginName),
        groupName: normalizeNullableText(request.groupName),
        passwordResetRequired,
        passwordChangedAt: passwordResetRequired ? null : now,
        createdByAdminId: actor.id,
        createdByAdminDisplayName: actor.displayName,
        now,
      });
    },

    async bulkCreateStudents(
      request: BulkCreateAdminStudentsRequestV1,
      actor: { id: string; displayName: string },
      now = new Date(),
    ): Promise<BulkCreateAdminStudentsResponseV1> {
      const created: AdminStudentV1[] = [];
      const skipped: BulkCreateAdminStudentsResponseV1['skipped'] = [];
      const failed: BulkCreateAdminStudentsResponseV1['failed'] = [];
      const seenLoginNames = new Set<string>();

      for (const item of request.students) {
        const loginName = item.loginName.trim();
        if (seenLoginNames.has(loginName)) {
          failed.push({ loginName, error: 'Duplicate loginName in request' });
          continue;
        }
        seenLoginNames.add(loginName);

        const initialPassword = item.initialPassword ?? request.options.defaultInitialPassword;
        if (!initialPassword) {
          failed.push({ loginName, error: 'initialPassword is required' });
          continue;
        }

        const result = await repository.createStudent({
          loginName,
          displayName: normalizeDisplayName(item.displayName, loginName),
          passwordHash: await hashPassword(initialPassword),
          className: normalizeCreateClassName(item.className, loginName),
          groupName: normalizeNullableText(item.groupName),
          passwordResetRequired: request.options.passwordResetRequired,
          passwordChangedAt: request.options.passwordResetRequired ? null : now,
          createdByAdminId: actor.id,
          createdByAdminDisplayName: actor.displayName,
          now,
        });

        if (result.status === 'created') {
          created.push(result.student);
        } else if (request.options.skipExisting) {
          skipped.push({ loginName, reason: 'loginName already exists' });
        } else {
          failed.push({ loginName, error: 'loginName already exists' });
        }
      }

      return { created, skipped, failed };
    },

    async updateStudent(studentId: string, request: UpdateAdminStudentRequestV1, now = new Date()) {
      return repository.updateStudent({
        studentId,
        changes: {
          displayName: request.displayName?.trim(),
          status: request.status,
          className: request.className === undefined ? undefined : normalizeNullableText(request.className),
          groupName: request.groupName === undefined ? undefined : normalizeNullableText(request.groupName),
        },
        now,
      });
    },

    async resetStudentPassword(studentId: string, request: ResetAdminStudentPasswordRequestV1, now = new Date()) {
      return repository.resetStudentPassword({
        studentId,
        passwordHash: await hashPassword(request.newPassword),
        revokeExistingSessions: request.revokeExistingSessions,
        now,
      });
    },

    revokeStudentSessions(studentId: string, now = new Date()) {
      return repository.revokeStudentSessions(studentId, now);
    },
  };
}
