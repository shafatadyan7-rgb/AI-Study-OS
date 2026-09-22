import { NextResponse, type NextRequest } from 'next/server';
import { destroySession, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
