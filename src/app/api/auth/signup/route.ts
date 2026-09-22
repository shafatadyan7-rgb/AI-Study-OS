import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, profiles, studentProfiles } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { SignupSchema } from '@/lib/auth/onboarding';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';

export async function POST(req: NextRequest) {
  try {
    const body = SignupSchema.parse(await req.json());
    // Rate-limit by IP-ish key before touching the database at all.
    await rateLimit(`signup:${req.headers.get('x-forwarded-for') ?? 'unknown'}`, LIMITS.auth.limit, LIMITS.auth.window);

    const existing = await db.query.users.findFirst({ where: eq(users.email, body.email) });
    if (existing) {
      // Same shape as any other validation error — do not reveal which emails are registered.
      return NextResponse.json({ error: 'Could not create that account.' }, { status: 400 });
    }

    const passwordHash = await hashPassword(body.password);
    const [user] = await db.insert(users).values({
      email: body.email, passwordHash, role: body.role,
    }).returning({ id: users.id });

    await db.insert(profiles).values({
      userId: user!.id, displayName: body.displayName, preferredLanguage: body.preferredLanguage,
    });

    if (body.role === 'student') {
      await db.insert(studentProfiles).values({ userId: user!.id, classLabel: body.classLabel ?? null });
    }

    const { cookieValue, expiresAt } = await createSession(user!.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, cookieValue, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires: expiresAt, path: '/',
    });
    return res;
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    return handleError(err, 'api.signup.failed');
  }
}
