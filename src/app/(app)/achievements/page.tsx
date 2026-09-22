'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { AchievementsResponse } from '@/types/api';

export default function AchievementsPage() {
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.achievements.list().then(setData).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load achievements.'));
  }, []);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const unlocked = data.achievements.filter((a) => a.unlocked);

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Achievements</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Every badge unlocks from a real event in your history — none are pre-set</p></div>
      </header>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="num">{unlocked.length}/{data.achievements.length}</div><div className="lbl">Unlocked</div></div>
      </div>

      <div className="cardgrid">
        {data.achievements.map((a) => (
          <div key={a.key} className="card" style={{ opacity: a.unlocked ? 1 : 0.5 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>
              {a.unlocked ? '🏆' : '🔒'} {a.title}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>{a.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
