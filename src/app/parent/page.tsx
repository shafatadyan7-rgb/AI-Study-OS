'use client';

import { useEffect, useState } from 'react';

interface StudentRow {
  displayName?: string; studyMinutes?: number; streak?: number;
  upcomingExams?: { label: string; examOn: string }[];
}

export default function ParentPage() {
  const [students, setStudents] = useState<StudentRow[] | null>(null);

  useEffect(() => { fetch('/api/parent/students').then((r) => r.json()).then(setStudents); }, []);

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Progress</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Study time, streaks and exams — never private AI conversations or notes</p></div>
      </header>

      {students === null ? <p className="muted">Loading…</p> : students.length === 0 ? (
        <div className="empty"><div className="big">No linked students yet</div>A student account can be linked to yours by an administrator.</div>
      ) : (
        <div className="cardgrid">
          {students.map((s, i) => (
            <div key={i} className="card">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{s.displayName}</div>
              <div className="statrow">
                <div className="stat"><div className="num">{s.studyMinutes ?? 0}</div><div className="lbl">Minutes studied</div></div>
                <div className="stat"><div className="num">{s.streak ?? 0}</div><div className="lbl">Day streak</div></div>
              </div>
              {s.upcomingExams && s.upcomingExams.length > 0 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  Next exam: {s.upcomingExams[0]!.label} — {new Date(s.upcomingExams[0]!.examOn).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
