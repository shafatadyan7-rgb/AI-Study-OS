'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';

interface ClassRow { id: string; name: string; studentCount: number; }
interface ClassDetail {
  className: string; studentCount: number; note?: string;
  classAccuracy?: number | null; commonMistakes?: { kind: string; count: number }[] | null;
  students: { displayName?: string }[];
}

export default function TeacherPage() {
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetch('/api/teacher/classes').then((r) => r.json()).then(setClasses);
  useEffect(() => { load(); }, []);

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/teacher/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      setName(''); load();
    } catch { setError('Could not create the class.'); }
  };

  const open = async (id: string) => {
    setSelected(id);
    const res = await fetch(`/api/teacher/classes/${id}`);
    setDetail(await res.json());
  };

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>My Classes</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Aggregate performance only — private student conversations are never visible here</p></div>
      </header>

      <form onSubmit={createClass} className="card" style={{ marginBottom: 18, display: 'flex', gap: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New class name" />
        <button className="btn primary small" type="submit">Create class</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {classes === null ? <p className="muted">Loading…</p> : classes.length === 0 ? (
        <div className="empty"><div className="big">No classes yet</div>Create your first class above.</div>
      ) : (
        <div className="cardgrid" style={{ marginBottom: 18 }}>
          {classes.map((c) => (
            <button key={c.id} className="card tb-card" style={{ textAlign: 'left' }} onClick={() => open(c.id)}>
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>{c.studentCount} students</div>
            </button>
          ))}
        </div>
      )}

      {selected && detail && (
        <div className="card">
          <h2 style={{ fontSize: 15, marginBottom: 10 }}>{detail.className}</h2>
          {detail.note ? (
            <p className="muted" style={{ fontSize: 12.5 }}>{detail.note}</p>
          ) : (
            <div className="statrow" style={{ marginBottom: 14 }}>
              <div className="stat">
                <div className={detail.classAccuracy != null ? 'num' : 'num dim-num'}>
                  {detail.classAccuracy != null ? `${Math.round(detail.classAccuracy * 100)}%` : 'NOT ENOUGH DATA'}
                </div>
                <div className="lbl">Class accuracy</div>
              </div>
              <div className="stat"><div className="num">{detail.studentCount}</div><div className="lbl">Students</div></div>
            </div>
          )}
          {detail.commonMistakes && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {detail.commonMistakes.map((m) => <span key={m.kind} className="badge">{m.kind}: {m.count}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
