'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api/client';
import type { MistakeRow } from '@/types/api';

const KIND_LABEL: Record<string, string> = {
  conceptual: 'Conceptual', calculation: 'Calculation', formula: 'Formula',
  careless: 'Careless', misreading: 'Misreading', memory: 'Memory',
  reasoning: 'Reasoning', grammar: 'Grammar', vocabulary: 'Vocabulary',
  unit: 'Unit', sign: 'Sign', diagram: 'Diagram', unclassified: 'Unclassified',
};

export default function MistakesPage() {
  const router = useRouter();
  const [mistakes, setMistakes] = useState<MistakeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [practicing, setPracticing] = useState(false);

  useEffect(() => {
    api.mistakes.list().then(setMistakes).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load mistakes.'));
  }, []);

  const practiceWeakest = async () => {
    setPracticing(true);
    setError(null);
    try {
      const target = await api.mistakes.practiceTarget();
      sessionStorage.setItem('studyos:practice-chapter', target.chapterId);
      router.push('/quizzes');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not find a chapter to practice.');
    } finally {
      setPracticing(false);
    }
  };

  if (mistakes === null) return <p className="muted">Loading…</p>;

  const unresolved = mistakes.filter((m) => !m.resolved);
  const byChapter = new Map<string, number>();
  for (const m of unresolved) {
    const key = m.chapterTitle ?? 'Unstructured';
    byChapter.set(key, (byChapter.get(key) ?? 0) + m.occurrences);
  }
  const worst = [...byChapter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const byKind = new Map<string, number>();
  for (const m of unresolved) byKind.set(m.kind, (byKind.get(m.kind) ?? 0) + 1);

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Mistake Lab</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Every entry here comes from a real quiz attempt</p></div>
      </header>

      {error && <p className="error" role="alert" style={{ marginBottom: 12 }}>{error}</p>}

      {mistakes.length === 0 ? (
        <div className="empty"><div className="big">No mistakes recorded yet</div>Take a quiz to start building your mistake profile.</div>
      ) : (
        <>
          <div className="statrow" style={{ marginBottom: 18 }}>
            <div className="stat"><div className="num">{mistakes.length}</div><div className="lbl">Total mistakes</div></div>
            <div className="stat"><div className="num">{unresolved.length}</div><div className="lbl">Unresolved</div></div>
            <div className="stat"><div className="num">{worst[0]?.[0] ?? '—'}</div><div className="lbl">Weakest chapter</div></div>
          </div>

          <div className="grid2" style={{ marginBottom: 18 }}>
            <div className="card">
              <h2 style={{ fontSize: 14, marginBottom: 10 }}>Weakest topics</h2>
              {worst.map(([ch, n]) => (
                <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                  <span>{ch}</span><span className="pill">{n} mistake{n > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <h2 style={{ fontSize: 14, marginBottom: 6 }}>Practice my mistakes</h2>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                Generates a fresh quiz focused on the chapter you have missed the most.
              </p>
              <button className="btn primary" onClick={practiceWeakest} disabled={practicing || unresolved.length === 0}>
                {practicing ? <span className="spinner" /> : 'Practice weakest topic'}
              </button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, marginBottom: 10 }}>By category</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[...byKind.entries()].map(([k, n]) => (
                <span key={k} className="badge">{KIND_LABEL[k] ?? k}: {n}</span>
              ))}
            </div>
          </div>

          <h2 style={{ fontSize: 14, marginBottom: 10 }}>Recent mistakes</h2>
          {mistakes.slice(0, 20).map((m) => (
            <div key={m.id} className="mistake-card">
              <div className="mistake-meta">
                {m.textbookTitle} · {m.chapterTitle ?? 'Unstructured'} · {new Date(m.lastOccurredAt).toLocaleDateString()}
              </div>
              <div style={{ fontSize: 13.5, marginBottom: 6 }}>{m.question}</div>
              {m.correctAnswer && <div style={{ fontSize: 12.5, color: 'var(--emerald)' }}>Correct answer: {m.correctAnswer}</div>}
              {m.explanation && <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{m.explanation}</p>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
