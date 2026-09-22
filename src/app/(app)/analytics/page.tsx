'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { AnalyticsResponse } from '@/types/api';

function Sparkline({ points, color }: { points: { date: string; value: number }[]; color: string }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const w = 280, h = 60, step = w / Math.max(points.length - 1, 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - (p.value / max) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Trend chart">
      <path d={path} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.analytics.summary().then(setData).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load analytics.'));
  }, []);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Analytics</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Built entirely from your stored attempts — thin data reads NOT ENOUGH DATA, never a guess</p></div>
      </header>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="statrow">
          <div className="stat">
            <div className={data.accuracy != null ? 'num' : 'num dim-num'}>{data.accuracy != null ? `${Math.round(data.accuracy * 100)}%` : 'NOT ENOUGH DATA'}</div>
            <div className="lbl">Accuracy</div>
          </div>
          <div className="stat">
            <div className={data.accuracyDelta != null ? 'num' : 'num dim-num'}>
              {data.accuracyDelta != null ? `${data.accuracyDelta >= 0 ? '+' : ''}${Math.round(data.accuracyDelta * 100)}%` : 'NOT ENOUGH DATA'}
            </div>
            <div className="lbl">Recent change</div>
          </div>
          <div className="stat"><div className="num">{data.questionsAttempted}</div><div className="lbl">Questions attempted</div></div>
          <div className="stat"><div className="num">{data.streak}</div><div className="lbl">Day streak</div></div>
        </div>
      </div>

      <div className="grid2">
        <div className="card chart-card">
          <h3>Study time trend</h3>
          {data.studyMinutesTrend ? <Sparkline points={data.studyMinutesTrend} color="var(--cyan)" /> : <p className="muted" style={{ fontSize: 12.5 }}>NOT ENOUGH DATA yet — needs a few days of focus sessions.</p>}
        </div>
        <div className="card chart-card">
          <h3>Accuracy trend</h3>
          {data.accuracyTrend ? <Sparkline points={data.accuracyTrend} color="var(--emerald)" /> : <p className="muted" style={{ fontSize: 12.5 }}>NOT ENOUGH DATA yet — needs attempts spread across several days.</p>}
        </div>
      </div>

      <div className="card chart-card" style={{ marginTop: 14 }}>
        <h3>Mistake categories</h3>
        {data.mistakeBreakdown ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.mistakeBreakdown.map((m) => {
              const max = data.mistakeBreakdown![0]!.count;
              return (
                <div key={m.kind}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                    <span>{m.kind}</span><span className="dim">{m.count}</span>
                  </div>
                  <div className="bar-bg"><div className="bar-fg" style={{ width: `${(m.count / max) * 100}%`, background: 'var(--red)' }} /></div>
                </div>
              );
            })}
          </div>
        ) : <p className="muted" style={{ fontSize: 12.5 }}>No mistakes recorded yet.</p>}
      </div>
    </div>
  );
}
