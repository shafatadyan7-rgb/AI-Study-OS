import { cookies } from 'next/headers';
import { resolveSession, SESSION_COOKIE, type AuthUser } from './session';

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) { super(message); }
}

export async function requireUser(): Promise<AuthUser> {
  const jar = await cookies();
  const user = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  if (!user) throw new AuthError(401, 'Sign in to continue.');
  return user;
}

export async function requireRole(...roles: AuthUser['role'][]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError(403, 'You do not have access to this resource.');
  return user;
}

/**
 * Ownership assertion used by every resource handler.
 *
 * This is the single most security-critical function in the codebase: it is the
 * difference between Student A reading their own textbook and reading Student
 * B's. It is intentionally not "helpful" — it throws rather than filtering, so
 * a missing call fails loudly in tests rather than silently leaking.
 */
export function assertOwnership(user: AuthUser, record: { ownerId: string } | null | undefined): void {
  if (!record) throw new AuthError(403, 'Not found or not yours.');
  if (record.ownerId !== user.id) throw new AuthError(403, 'Not found or not yours.');
}
