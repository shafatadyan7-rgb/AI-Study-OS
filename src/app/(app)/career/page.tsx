'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { CareerRow } from '@/types/api';

export default function CareerPage() {
  const [careers, setCareers] = useState<CareerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.career.list().then(setCareers).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load career information.'));
  }, []);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!careers) return <p className="muted">Loading…</p>;

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Career Explorer</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Informational only — every entry is sourced, none of this is a guarantee</p></div>
      </header>

      {careers.length === 0 ? (
        <div className="empty"><div className="big">No career data available yet</div>This section is ready for an authoritative data source — nothing is shown until it is sourced and verified.</div>
      ) : (
        <div className="cardgrid">
          {careers.map((c) => (
            <div key={c.id} className="card">
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                {c.name}{c.stale && <span className="badge amber" style={{ marginLeft: 8 }}>Needs re-verification</span>}
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{c.summary}</p>
              {c.requiredSubjects.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <span className="dim" style={{ fontSize: 11 }}>Subjects: </span>
                  {c.requiredSubjects.map((s) => <span key={s} className="badge" style={{ marginRight: 4 }}>{s}</span>)}
                </div>
              )}
              {c.educationPath && <p className="dim" style={{ fontSize: 12 }}>{c.educationPath}</p>}
              {c.sourceUrl && (
                <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="dim" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
                  Source: {c.sourceLabel ?? c.sourceUrl}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
