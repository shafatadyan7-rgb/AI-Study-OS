'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { SkillRow } from '@/types/api';

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.skills.list().then(setSkills).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load skills.'));
  }, []);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!skills) return <p className="muted">Loading…</p>;

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Skills</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Built from real activity &mdash; a skill with too little evidence shows NOT ENOUGH DATA, never a guessed number</p></div>
      </header>

      {skills.length === 0 ? (
        <div className="empty"><div className="big">No skill categories configured yet</div>An administrator sets up the skill categories this student&apos;s activity maps to.</div>
      ) : (
        <div className="cardgrid">
          {skills.map((s) => (
            <div key={s.categoryId} className="card">
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{s.name}</div>
              {s.score === null ? (
                <p className="dim" style={{ fontSize: 12.5 }}>NOT ENOUGH DATA ({s.eventCount} event{s.eventCount === 1 ? '' : 's'} so far)</p>
              ) : (
                <>
                  <div className="bar-bg"><div className="bar-fg" style={{ width: `${Math.round(s.score * 100)}%`, background: 'var(--cyan)' }} /></div>
                  <p className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>Based on {s.eventCount} recorded activities</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
