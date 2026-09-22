import { randomBytes, createHmac } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users, profiles } from '@/db/schema';

const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'studyos_session';

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is missing or too short.');
  return s;
}

/**
 * Cookie value is `id.signature`. The id alone is stored in the database, so a
 * stolen database row cannot be replayed without the signing secret, and a
 * forged cookie cannot be minted without it either.
 */
function sign(id: string): string {
  return createHmac('sha256', secret()).update(id).digest('base64url');
}

export async function createSession(userId: string): Promise<{ cookieValue: string; expiresAt: Date }> {
  const id = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { cookieValue: `${id}.${sign(id)}`, expiresAt };
}

export type AuthUser = {
  id: string;
  email: string;
  role: 'student' | 'teacher' | 'parent' | 'admin';
  displayName: string;
  preferredLanguage: string;
};

export async function resolveSession(cookieValue: string | undefined): Promise<AuthUser | null> {
  if (!cookieValue) return null;
  const [id, sig] = cookieValue.split('.');
  if (!id || !sig) return null;
  // Reject forged ids before touching the database.
  if (sign(id) !== sig) return null;

  const rows = await db
    .select({
      userId: users.id, email: users.email, role: users.role,
      displayName: profiles.displayName, lang: profiles.preferredLanguage,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return {
    id: row.userId, email: row.email, role: row.role,
    displayName: row.displayName, preferredLanguage: row.lang,
  };
}

export async function destroySession(cookieValue: string | undefined): Promise<void> {
  const id = cookieValue?.split('.')[0];
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
