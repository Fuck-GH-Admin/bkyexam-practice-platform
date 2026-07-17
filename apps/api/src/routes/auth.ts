import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ApiErrorResponseV1Schema,
  ChangeStudentPasswordRequestV1Schema,
  ChangeStudentPasswordResponseV1Schema,
  AuthLoginResponseV1Schema,
  AuthLogoutResponseV1Schema,
  AuthMeResponseV1Schema,
} from '@bkyexam-practice/shared';
import type { createSessionService } from '../auth/session.js';
import {
  createStudentAuthService,
  STUDENT_AUTH_ERRORS,
  type StudentAuthRecord,
  type StudentAuthRepository,
  type StudentAuthServiceOptions,
} from '../auth/studentAuth.js';

export const sessionCookieName = 'bky_session';

function errorResponse(error: string) {
  return ApiErrorResponseV1Schema.parse({ error });
}

interface AuthRoutesOptions {
  repository?: StudentAuthRepository;
  sessionService?: ReturnType<typeof createSessionService>;
  cookieSecure?: boolean;
  studentAuthOptions?: StudentAuthServiceOptions;
}

export function createMemoryStudentAuthRepository(): StudentAuthRepository {
  const students = new Map<string, StudentAuthRecord>();

  return {
    async findByLoginName(loginName) {
      return students.get(loginName) ?? null;
    },
    async findById(studentId) {
      return [...students.values()].find((student) => student.id === studentId) ?? null;
    },
    async createStudent(student) {
      const createdStudent = {
        id: student.loginName,
        ...student,
        className: student.className ?? null,
        groupName: student.groupName ?? null,
        passwordResetRequired: student.passwordResetRequired ?? false,
        status: 'active' as const,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: null,
      };
      students.set(createdStudent.loginName, createdStudent);
      return createdStudent;
    },
    async recordLoginFailure(input) {
      const student = students.get(input.loginName);
      if (!student) return;

      students.set(input.loginName, {
        ...student,
        failedLoginCount: input.failedLoginCount,
        failedLoginWindowStartedAt: input.failedLoginWindowStartedAt,
        lockedUntil: input.lockedUntil,
      });
    },
    async recordLoginSuccess(input) {
      const student = students.get(input.loginName);
      if (!student) return;

      students.set(input.loginName, {
        ...student,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: input.now,
      });
    },
    async updateStudentPassword(input) {
      const student = [...students.values()].find((candidate) => candidate.id === input.studentId);
      if (!student) return null;

      const updated: StudentAuthRecord = {
        ...student,
        passwordHash: input.passwordHash,
        passwordResetRequired: false,
        passwordChangedAt: input.passwordChangedAt,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
      };
      students.set(updated.loginName, updated);
      return updated;
    },
  };
}

export async function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions = {}) {
  const authRepository = options.repository ?? createMemoryStudentAuthRepository();
  const authService = createStudentAuthService(authRepository, options.studentAuthOptions);
  const sessionService = options.sessionService;

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || !('loginName' in body)) {
      return reply.status(400).send(errorResponse('loginName is required'));
    }

    const { loginName, password } = body as { loginName: unknown; password?: unknown };
    if (typeof loginName !== 'string' || (password !== undefined && typeof password !== 'string')) {
      return reply.status(400).send(errorResponse('Invalid login request'));
    }

    let loginResult: Awaited<ReturnType<typeof authService.login>>;
    try {
      loginResult = await authService.login({ loginName, password });
    } catch (error) {
      return sendStudentAuthError(reply, error);
    }

    const responsePayload = AuthLoginResponseV1Schema.parse(loginResult);

    if (sessionService) {
      const sessionStudent = await authRepository.findByLoginName(loginResult.student.loginName);
      const session = await sessionService.createSession(sessionStudent?.id ?? loginResult.student.loginName);
      reply.setCookie(sessionCookieName, session.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: options.cookieSecure ?? false,
        expires: session.expiresAt,
      });
    }

    return responsePayload;
  });

  app.post('/api/auth/password/change', async (request, reply) => {
    const student = await sessionService?.resolveStudent(request.cookies[sessionCookieName]);
    if (!student) {
      return reply.status(401).send(errorResponse('Unauthenticated'));
    }

    const parsedRequest = ChangeStudentPasswordRequestV1Schema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.status(400).send(errorResponse('Invalid password change request'));
    }

    try {
      await authService.changePassword({
        studentId: student.id,
        currentPassword: parsedRequest.data.currentPassword,
        newPassword: parsedRequest.data.newPassword,
      });
    } catch (error) {
      return sendStudentAuthError(reply, error);
    }

    return ChangeStudentPasswordResponseV1Schema.parse({
      success: true,
      passwordResetRequired: false,
    });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const student = await sessionService?.resolveStudent(request.cookies[sessionCookieName]);
    if (!student) {
      return reply.status(401).send(errorResponse('Unauthenticated'));
    }

    const { passwordResetRequired, ...studentPayload } = student;
    return AuthMeResponseV1Schema.parse({
      student: studentPayload,
      passwordResetRequired: passwordResetRequired ?? false,
    });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[sessionCookieName];
    await sessionService?.revokeSession(token);
    reply.clearCookie(sessionCookieName, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: options.cookieSecure ?? false,
    });

    return AuthLogoutResponseV1Schema.parse({ success: true });
  });
}

function sendStudentAuthError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof Error)) {
    return reply.status(401).send(errorResponse(STUDENT_AUTH_ERRORS.invalidCredentials));
  }

  if (
    error.message === STUDENT_AUTH_ERRORS.loginNameRequired
    || error.message === STUDENT_AUTH_ERRORS.passwordRequired
    || error.message === STUDENT_AUTH_ERRORS.currentPasswordRequired
    || error.message === STUDENT_AUTH_ERRORS.newPasswordTooShort
    || error.message === STUDENT_AUTH_ERRORS.newPasswordMustDiffer
  ) {
    return reply.status(400).send(errorResponse(error.message));
  }
  if (error.message === STUDENT_AUTH_ERRORS.accountDisabled) {
    return reply.status(403).send(errorResponse(STUDENT_AUTH_ERRORS.accountDisabled));
  }
  if (error.message === STUDENT_AUTH_ERRORS.accountLocked) {
    return reply.status(423).send(errorResponse(STUDENT_AUTH_ERRORS.accountLocked));
  }

  return reply.status(401).send(errorResponse(STUDENT_AUTH_ERRORS.invalidCredentials));
}
