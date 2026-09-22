import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { resolveSession, SESSION_COOKIE } from '@/lib/auth/session';
import { AppShell } from '@/components/AppShell';

/**
 * Server-side auth gate for every route in the (app) group. Authorisation
 * happens here, before any page component renders — a client-side redirect
 * would still have shipped the page's data to an unauthenticated browser.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const user = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  if (!user) redirect('/login');

  return <AppShell user={user}>{children}</AppShell>;
}
