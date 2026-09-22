import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, SESSION_COOKIE } from '@/lib/auth/session';
import { LoginSchema } from '@/lib/auth/onboarding';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';

export async function POST(req: NextRequest) {
  try {
    const body = LoginSchema.parse(await req.json());
    await rateLimit(`login:${body.email}`, LIMITS.auth.limit, LIMITS.auth.window);

    const user = await db.query.users.findFirst({ where: eq(users.email, body.email) });
    // Constant-shape failure: a missing user and a wrong password return the
    // same message, so the endpoint cannot be used to enumerate accounts.
    const ok = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !ok) {
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 });
    }

    const { cookieValue, expiresAt } = await createSession(user.id);
    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set(SESSION_COOKIE, cookieValue, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires: expiresAt, path: '/',
    });
    return res;
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    return handleError(err, 'api.login.failed');
  }
}
