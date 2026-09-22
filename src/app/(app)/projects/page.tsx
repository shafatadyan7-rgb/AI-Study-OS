'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { ProjectRow } from '@/types/api';

const STATUS_LABEL: Record<ProjectRow['status'], string> = {
  idea: 'Idea', planning: 'Planning', in_progress: 'In progress', completed: 'Completed',
};
const STATUS_COLOR: Record<ProjectRow['status'], string> = {
  idea: 'var(--dim)', planning: 'var(--violet)', in_progress: 'var(--amber)', completed: 'var(--emerald)',
};
const NEXT_STATUS: Record<ProjectRow['status'], ProjectRow['status']> = {
  idea: 'planning', planning: 'in_progress', in_progress: 'completed', completed: 'completed',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () => api.projects.list().then(setProjects).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load projects.'));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try { await api.projects.create({ title }); setTitle(''); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the project.'); }
  };

  const advance = async (p: ProjectRow) => {
    try { await api.projects.update(p.id, { status: NEXT_STATUS[p.status] }); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not update that project.'); }
  };

  const remove = async (id: string) => {
    try { await api.projects.remove(id); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not delete that project.'); }
  };

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Projects</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Track your own academic projects — AI can help plan and explain, not fabricate sources</p></div>
      </header>

      <form onSubmit={create} className="card" style={{ marginBottom: 18, display: 'flex', gap: 10 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New project title" />
        <button className="btn primary small" type="submit">Add project</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {projects === null ? <p className="muted">Loading…</p> : projects.length === 0 ? (
        <div className="empty"><div className="big">No projects yet</div>Add one above to start tracking it.</div>
      ) : (
        <div className="cardgrid">
          {projects.map((p) => (
            <div key={p.id} className="card">
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{p.title}</div>
              <span className="badge" style={{ color: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status]}</span>
              {p.description && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{p.description}</p>}
              {p.deadline && <p className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>Due {new Date(p.deadline).toLocaleDateString()}</p>}
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                {p.status !== 'completed' && <button className="btn small" onClick={() => advance(p)}>Advance to {STATUS_LABEL[NEXT_STATUS[p.status]]}</button>}
                <button className="btn small danger" onClick={() => remove(p.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
