'use client';

import { useEffect, useState } from 'react';

interface Overview {
  userCount: number; textbookCount: number; failedJobsInWindow: number;
  recentJobs: { id: string; status: string; error: string | null; updatedAt: string }[];
}

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => { fetch('/api/admin/overview').then((r) => r.json()).then(setData); }, []);

  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Admin</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>System health — never textbook content or student conversations</p></div>
      </header>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="statrow">
          <div className="stat"><div className="num">{data.userCount}</div><div className="lbl">Users</div></div>
          <div className="stat"><div className="num">{data.textbookCount}</div><div className="lbl">Textbooks</div></div>
          <div className="stat"><div className="num" style={{ color: data.failedJobsInWindow > 0 ? 'var(--red)' : undefined }}>{data.failedJobsInWindow}</div><div className="lbl">Failed jobs (recent)</div></div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>Recent processing jobs</h2>
        {data.recentJobs.map((j) => (
          <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
            <span className={`badge ${j.status === 'ready' ? 'emerald' : j.status === 'failed' ? 'red' : 'amber'}`}>{j.status}</span>
            <span className="dim">{new Date(j.updatedAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
