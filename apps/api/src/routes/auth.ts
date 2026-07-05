import type { FastifyInstance } from 'fastify';
import type { createSessionService } from '../auth/session.js';
import {
  createStudentAuthService,
  type StudentAuthRecord,
  type StudentAuthRepository,
} from '../auth/studentAuth.js';

export const sessionCookieName = 'bky_session';

interface AuthRoutesOptions {
  repository?: StudentAuthRepository;
  sessionService?: ReturnType<typeof createSessionService>;
  cookieSecure?: boolean;
}

export function createMemoryStudentAuthRepository(): StudentAuthRepository {
  const students = new Map<string, StudentAuthRecord>();

  return {
    async findByLoginName(loginName) {
      return students.get(loginName) ?? null;
    },
    async createStudent(student) {
      const createdStudent = { ...student };
      students.set(createdStudent.loginName, createdStudent);
      return createdStudent;
    },
  };
}

export async function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions = {}) {
  const authRepository = options.repository ?? createMemoryStudentAuthRepository();
  const authService = createStudentAuthService(authRepository);
  const sessionService = options.sessionService;

  app.post('/api/auth/login', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || !('loginName' in body)) {
      return reply.status(400).send({ error: 'loginName is required' });
    }

    const { loginName, password } = body as { loginName: unknown; password?: unknown };
    if (typeof loginName !== 'string' || (password !== undefined && typeof password !== 'string')) {
      return reply.status(400).send({ error: 'Invalid login request' });
    }

    try {
      const student = await authService.login({ loginName, password });
      if (sessionService) {
        const sessionStudent = await authRepository.findByLoginName(student.loginName);
        const session = await sessionService.createSession(sessionStudent?.id ?? student.loginName);
        reply.setCookie(sessionCookieName, session.token, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: options.cookieSecure ?? false,
          expires: session.expiresAt,
        });
      }

      return { student };
    } catch (error) {
      if (error instanceof Error && error.message === 'loginName is required') {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(401).send({ error: 'Invalid login credentials' });
    }
  });

  app.get('/api/auth/me', async (request, reply) => {
    const student = await sessionService?.resolveStudent(request.cookies[sessionCookieName]);
    if (!student) {
      return reply.status(401).send({ error: 'Unauthenticated' });
    }

    return { student };
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

    return { success: true };
  });
}
