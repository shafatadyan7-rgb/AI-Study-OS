'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api/client';
import type { Textbook, CoachCard, MasteryRow, AnalyticsResponse } from '@/types/api';

export default function DashboardPage() {
  const [textbooks, setTextbooks] = useState<Textbook[] | null>(null);
  const [coach, setCoach] = useState<CoachCard>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.textbooks.list(), api.coach.today(), api.analytics.summary()])
      .then(([tb, c, a]) => { setTextbooks(tb); setCoach(c); setAnalytics(a); })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.'));
  }, []);

  const ready = textbooks?.filter((t) => t.status === 'ready') ?? [];

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 26 }}>
        <div>
          <h1>Overview</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Your personal learning operating system</p>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      {textbooks === null ? (
        <p className="muted">Loading…</p>
      ) : ready.length === 0 ? (
        <div className="empty">
          <div className="big">Upload your first textbook to begin</div>
          <p style={{ marginBottom: 14 }}>
            AI StudyOS turns any PDF textbook into an AI tutor, notes, flashcards, quizzes and a mistake-driven revision system.
          </p>
          <Link href="/textbooks" className="btn primary">Upload a textbook</Link>
        </div>
      ) : (
        <>
          <div className="grid2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="statrow">
                <div className="stat"><div className="num">{ready.length}</div><div className="lbl">Textbooks ready</div></div>
                <div className="stat">
                  <div className={analytics?.questionsAttempted ? 'num' : 'num dim-num'}>{analytics?.questionsAttempted ?? '—'}</div>
                  <div className="lbl">Questions answered</div>
                </div>
                <div className="stat">
                  <div className={analytics?.accuracy != null ? 'num' : 'num dim-num'}>
                    {analytics?.accuracy != null ? `${Math.round(analytics.accuracy * 100)}%` : 'NOT ENOUGH DATA'}
                  </div>
                  <div className="lbl">Overall accuracy</div>
                </div>
                <div className="stat"><div className="num">{analytics?.streak ?? 0}</div><div className="lbl">Day streak</div></div>
              </div>
            </div>

            <div className="card">
              <h2 style={{ fontSize: 14, marginBottom: 8 }}>Today&apos;s priority</h2>
              {coach ? (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{coach.headline}</div>
                  <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>{coach.reason}</p>
                  <span className="pill">{coach.minutes} min</span>
                </>
              ) : (
                <p className="muted" style={{ fontSize: 12.5 }}>NOT ENOUGH DATA yet — take a quiz to get a recommendation.</p>
              )}
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 14, marginBottom: 10 }}>Continue learning</h2>
            {ready.slice(0, 4).map((b) => (
              <Link key={b.id} href={`/textbooks/${b.id}`} className="navitem" style={{ padding: '8px 6px' }}>
                <span className="ic" aria-hidden="true">▤</span>{b.title}
                <span className="pill" style={{ marginLeft: 'auto' }}>{b.chapterCount} ch · {b.pageCount}p</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
