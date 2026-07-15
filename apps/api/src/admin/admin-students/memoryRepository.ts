import { randomUUID } from 'node:crypto';
import type { ListAdminStudentsRequestV1 } from '@bkyexam-practice/shared';
import type { AdminStudentRepository, MemoryAdminStudentRecord } from './types.js';
import { mapMemoryStudent } from './mappers.js';

export function createMemoryAdminStudentRepository(
  initialStudents: readonly (Partial<MemoryAdminStudentRecord> & {
    id: string;
    loginName: string;
    displayName: string;
    passwordHash?: string;
  })[] = [],
): AdminStudentRepository & { students: MemoryAdminStudentRecord[] } {
  const students: MemoryAdminStudentRecord[] = initialStudents.map((student) => ({
    passwordHash: 'hash',
    className: null,
    groupName: null,
    status: 'active',
    passwordResetRequired: false,
    passwordChangedAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdByAdminId: null,
    createdByAdminDisplayName: null,
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    updatedAt: new Date('2026-07-14T00:00:00.000Z'),
    activeSessionCount: 0,
    ...student,
  }));

  return {
    students,

    async listStudents(filters) {
      const filtered = students
        .filter((student) => matchesMemoryFilters(student, filters))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      const pageItems = filtered.slice(filters.offset, filters.offset + filters.limit + 1);

      return {
        students: pageItems.slice(0, filters.limit).map(mapMemoryStudent),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: pageItems.length > filters.limit,
        },
      };
    },

    async findStudentById(studentId) {
      const student = students.find((candidate) => candidate.id === studentId);
      return student ? mapMemoryStudent(student) : null;
    },

    async createStudent(input) {
      if (students.some((student) => student.loginName === input.loginName)) {
        return { status: 'login_name_conflict' };
      }

      const created: MemoryAdminStudentRecord = {
        id: randomUUID(),
        loginName: input.loginName,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        className: input.className,
        groupName: input.groupName,
        status: 'active',
        passwordResetRequired: input.passwordResetRequired,
        passwordChangedAt: input.passwordChangedAt,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdByAdminId: input.createdByAdminId,
        createdByAdminDisplayName: input.createdByAdminDisplayName ?? 'Admin',
        createdAt: input.now,
        updatedAt: input.now,
        activeSessionCount: 0,
      };
      students.push(created);

      return { status: 'created', student: mapMemoryStudent(created) };
    },

    async updateStudent(input) {
      const index = students.findIndex((student) => student.id === input.studentId);
      if (index < 0) return { status: 'not_found' };

      const before = mapMemoryStudent(students[index]);
      students[index] = {
        ...students[index],
        displayName: input.changes.displayName ?? students[index].displayName,
        status: input.changes.status ?? students[index].status,
        className: input.changes.className === undefined ? students[index].className : input.changes.className,
        groupName: input.changes.groupName === undefined ? students[index].groupName : input.changes.groupName,
        updatedAt: input.now,
      };

      return { status: 'updated', before, after: mapMemoryStudent(students[index]) };
    },

    async resetStudentPassword(input) {
      const index = students.findIndex((student) => student.id === input.studentId);
      if (index < 0) return { status: 'not_found' };

      const revokedSessions = input.revokeExistingSessions ? students[index].activeSessionCount : 0;
      students[index] = {
        ...students[index],
        passwordHash: input.passwordHash,
        passwordResetRequired: true,
        passwordChangedAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
        activeSessionCount: input.revokeExistingSessions ? 0 : students[index].activeSessionCount,
        updatedAt: input.now,
      };

      return {
        status: 'updated',
        student: mapMemoryStudent(students[index]),
        revokedSessions,
      };
    },

    async revokeStudentSessions(studentId, now) {
      const index = students.findIndex((student) => student.id === studentId);
      if (index < 0) return { status: 'not_found' };

      const revokedSessions = students[index].activeSessionCount;
      students[index] = {
        ...students[index],
        activeSessionCount: 0,
        updatedAt: now,
      };

      return {
        status: 'revoked',
        student: mapMemoryStudent(students[index]),
        studentId,
        revokedSessions,
      };
    },
  };
}

function matchesMemoryFilters(student: MemoryAdminStudentRecord, filters: ListAdminStudentsRequestV1) {
  if (filters.status && student.status !== filters.status) return false;
  if (filters.className && student.className !== filters.className) return false;
  if (filters.groupName && student.groupName !== filters.groupName) return false;
  if (
    filters.passwordResetRequired !== undefined
    && student.passwordResetRequired !== filters.passwordResetRequired
  ) return false;
  if (filters.lockedOnly && !student.lockedUntil) return false;
  if (filters.keyword) {
    const keyword = filters.keyword.toLocaleLowerCase();
    if (
      !student.loginName.toLocaleLowerCase().includes(keyword)
      && !student.displayName.toLocaleLowerCase().includes(keyword)
    ) return false;
  }
  return true;
}
