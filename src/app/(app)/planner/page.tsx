'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { PlanItem } from '@/types/api';

const ACTIVITY_COLOR: Record<string, string> = {
  revise: 'var(--cyan)', practice: 'var(--violet)', quiz: 'var(--emerald)',
  mistake_practice: 'var(--red)', mock_exam: 'var(--amber)',
};
const ACTIVITY_LABEL: Record<string, string> = {
  revise: 'Revise', practice: 'Practice', quiz: 'Quiz',
  mistake_practice: 'Mistake practice', mock_exam: 'Mock exam',
};

export default function PlannerPage() {
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.planner.get().then((r) => setItems(r.items)).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your plan.'));
  };
  useEffect(load, []);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await api.planner.generate({ dailyMinutes, horizonDays: 7 });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate a plan.');
    } finally {
      setGenerating(false);
    }
  };

  const complete = async (item: PlanItem) => {
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, completed: !i.completed } : i)) ?? prev);
    try { await api.planner.complete(item.id, !item.completed); } catch { load(); }
  };

  const byDay = new Map<string, PlanItem[]>();
  for (const item of items ?? []) {
    const key = new Date(item.scheduledFor).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Study Planner</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Every task is scheduled from your real mastery, mistakes and revision data</p></div>
      </header>

      <div className="card" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label htmlFor="minutes" className="dim" style={{ fontSize: 12 }}>Daily minutes</label>
        <input id="minutes" type="number" min={15} max={300} step={5} value={dailyMinutes}
          onChange={(e) => setDailyMinutes(Number(e.target.value))} style={{ width: 90 }} />
        <button className="btn primary small" onClick={generate} disabled={generating}>
          {generating ? <span className="spinner" /> : (items && items.length > 0 ? 'Regenerate plan' : 'Generate plan')}
        </button>
      </div>

      {error && <p className="error" role="alert" style={{ marginBottom: 12 }}>{error}</p>}

      {items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty"><div className="big">No plan yet</div>Generate one above once you have at least one processed textbook.</div>
      ) : (
        [...byDay.entries()].map(([day, dayItems]) => (
          <div key={day} style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{day}</h2>
            <div className="plan-day">
              {dayItems.map((item) => (
                <div key={item.id} className={`plan-item ${item.completed ? 'completed' : ''}`}>
                  <span className="activity-dot" style={{ background: ACTIVITY_COLOR[item.activity] }} />
                  <div className="body">
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {ACTIVITY_LABEL[item.activity] ?? item.activity} — {item.chapterTitle ?? 'General'}
                      <span className="pill" style={{ marginLeft: 8 }}>{item.minutes} min</span>
                    </div>
                    <div className="why">{item.reason}</div>
                  </div>
                  <button className="btn small" onClick={() => complete(item)}>
                    {item.completed ? 'Undo' : 'Complete'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
