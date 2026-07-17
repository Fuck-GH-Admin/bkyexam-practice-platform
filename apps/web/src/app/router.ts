export type StudentRoute =
  | { view: 'home' }
  | { view: 'accountPassword' }
  | { view: 'banks' }
  | { view: 'wrong' }
  | { view: 'history' }
  | { view: 'practice'; sessionId: string };

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseStudentRoute(pathname: string): StudentRoute {
  const normalized = normalizePath(pathname);
  if (normalized === '/') return { view: 'home' };
  if (normalized === '/account/password') return { view: 'accountPassword' };
  if (normalized === '/banks') return { view: 'banks' };
  if (normalized === '/wrong-questions') return { view: 'wrong' };
  if (normalized === '/history') return { view: 'history' };

  const practiceMatch = normalized.match(/^\/practice\/([^/]+)$/);
  if (practiceMatch?.[1] && canonicalUuidPattern.test(practiceMatch[1])) {
    return { view: 'practice', sessionId: practiceMatch[1] };
  }

  return { view: 'home' };
}

export function buildStudentPath(route: StudentRoute): string {
  if (route.view === 'accountPassword') return '/account/password';
  if (route.view === 'banks') return '/banks';
  if (route.view === 'wrong') return '/wrong-questions';
  if (route.view === 'history') return '/history';
  if (route.view === 'practice') return `/practice/${route.sessionId}`;
  return '/';
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}
