'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';

export default function SettingsPage() {
  const router = useRouter();
  const logout = async () => {
    await api.auth.logout().catch(() => {});
    router.push('/login');
    router.refresh();
  };

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}><h1>Settings</h1></header>
      <div className="card" style={{ maxWidth: 420 }}>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Profile, language, appearance, AI and notification preferences are not yet
          built — this page is intentionally minimal rather than simulated.
        </p>
        <button className="btn danger" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
