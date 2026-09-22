'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new ApiError(res.status, json.error ?? 'Could not sign in.');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="card auth-card">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <span className="orb" aria-hidden="true" />
          <span className="brand-name">AI StudyOS</span>
        </div>
        <h1 style={{ fontSize: 18, marginBottom: 4 }}>Sign in</h1>
        <p className="muted" style={{ marginBottom: 18, fontSize: 12.5 }}>
          Your personal AI learning operating system.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label htmlFor="email" className="dim" style={{ fontSize: 12 }}>Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

          <label htmlFor="password" className="dim" style={{ fontSize: 12 }}>Password</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

          {error && <p className="error" role="alert">{error}</p>}

          <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 6, justifyContent: 'center' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="dim" style={{ marginTop: 16, fontSize: 12.5 }}>
          No account? <a href="/signup" style={{ color: 'var(--cyan)' }}>Create one</a>
        </p>
      </div>
    </main>
  );
}
