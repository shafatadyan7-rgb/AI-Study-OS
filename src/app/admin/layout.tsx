import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { resolveSession, SESSION_COOKIE } from '@/lib/auth/session';
import { AppShell } from '@/components/AppShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const user = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');
  return <AppShell user={user}>{children}</AppShell>;
}
