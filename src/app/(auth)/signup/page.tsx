'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', role: 'student' as const, classLabel: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not create your account.');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
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
        <h1 style={{ fontSize: 18, marginBottom: 14 }}>Create your account</h1>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label htmlFor="name" className="dim" style={{ fontSize: 12 }}>Name</label>
          <input id="name" required value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />

          <label htmlFor="role" className="dim" style={{ fontSize: 12 }}>I am a</label>
          <select id="role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof f.role }))}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
            <option value="parent">Parent</option>
          </select>

          {form.role === 'student' && (
            <>
              <label htmlFor="class" className="dim" style={{ fontSize: 12 }}>Class (optional)</label>
              <input id="class" value={form.classLabel} onChange={(e) => setForm((f) => ({ ...f, classLabel: e.target.value }))} placeholder="e.g. Class 9" />
            </>
          )}

          <label htmlFor="email2" className="dim" style={{ fontSize: 12 }}>Email</label>
          <input id="email2" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} autoComplete="email" />

          <label htmlFor="password2" className="dim" style={{ fontSize: 12 }}>Password</label>
          <input id="password2" type="password" required minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" />

          {error && <p className="error" role="alert">{error}</p>}

          <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 6, justifyContent: 'center' }}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="dim" style={{ marginTop: 16, fontSize: 12.5 }}>
          Already have an account? <a href="/login" style={{ color: 'var(--cyan)' }}>Sign in</a>
        </p>
      </div>
    </main>
  );
}
