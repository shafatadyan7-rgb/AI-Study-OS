import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { resolveSession, SESSION_COOKIE } from '@/lib/auth/session';

/**
 * Presentation Mode still requires a signed-in session — the presenter signs
 * in as the seeded demo account first. This is a full-screen layout with no
 * sidebar: the carnival display should show nothing but the story.
 */
export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const user = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  if (!user) redirect('/login');
  return <>{children}</>;
}
