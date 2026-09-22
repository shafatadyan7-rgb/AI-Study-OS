'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import { ChapterPicker } from '@/components/ChapterPicker';
import type { Chapter, QuizSet, Textbook } from '@/types/api';

type Difficulty = 'easy' | 'medium' | 'hard';

export default function QuizzesPage() {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [handoffChapterId, setHandoffChapterId] = useState<string | undefined>(undefined);

  // Consume the one-shot handoff from Mistake Lab's "Practice weakest topic",
  // then clear it so a later plain visit to /quizzes doesn't get stuck reusing it.
  useEffect(() => {
    const stored = sessionStorage.getItem('studyos:practice-chapter');
    if (stored) { setHandoffChapterId(stored); sessionStorage.removeItem('studyos:practice-chapter'); }
  }, []);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [quiz, setQuiz] = useState<QuizSet | null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [result, setResult] = useState<{ isCorrect: boolean; correctAnswer?: string; explanation?: string | null } | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!chapter) return;
    setBusy(true);
    setError(null);
    try {
      const q = await api.quiz.generate({ chapterId: chapter.id, count, difficulty });
      setQuiz(q); setQIdx(0); setSelectedOption(null); setResult(null); setScore(0); setFinished(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate a quiz.');
    } finally {
      setBusy(false);
    }
  };

  const answer = async (optionId: string) => {
    if (!quiz || result) return;
    setSelectedOption(optionId);
    const question = quiz.questions[qIdx]!;
    try {
      const r = await api.quiz.answer(quiz.attemptId, { questionId: question.id, optionId });
      setResult(r);
      if (r.isCorrect) setScore((s) => s + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit that answer.');
    }
  };

  const next = async () => {
    if (!quiz) return;
    if (qIdx < quiz.questions.length - 1) {
      setQIdx((i) => i + 1); setSelectedOption(null); setResult(null);
    } else {
      await api.quiz.finish(quiz.attemptId).catch(() => {});
      setFinished(true);
    }
  };

  if (!quiz) {
    return (
      <div>
        <header className="topbar" style={{ marginBottom: 20 }}><h1>Quiz &amp; Exam</h1></header>
        <div className="card" style={{ maxWidth: 480 }}>
          <ChapterPicker
            onSelect={(_b: Textbook, c: Chapter) => setChapter(c)}
            initialChapterId={handoffChapterId}
          />
          {handoffChapterId && (
            <p className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>
              Pre-selected from your weakest topic in Mistake Lab.
            </p>
          )}
          <div className="hr" />
          <label htmlFor="count" className="dim" style={{ fontSize: 12 }}>Questions</label>
          <select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ marginBottom: 10 }}>
            <option value={5}>5</option><option value={10}>10</option><option value={15}>15</option>
          </select>
          <label htmlFor="diff" className="dim" style={{ fontSize: 12 }}>Difficulty</label>
          <select id="diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} style={{ marginBottom: 14 }}>
            <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </select>
          {error && <p className="error" role="alert" style={{ marginBottom: 10 }}>{error}</p>}
          <button className="btn primary" onClick={generate} disabled={!chapter || busy}>
            {busy ? <span className="spinner" /> : 'Generate quiz'}
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    const pct = Math.round((score / quiz.questions.length) * 100);
    return (
      <div>
        <header className="topbar" style={{ marginBottom: 20 }}><h1>Quiz results</h1></header>
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="statrow" style={{ marginBottom: 16 }}>
            <div className="stat"><div className="num">{score}/{quiz.questions.length}</div><div className="lbl">Score</div></div>
            <div className="stat"><div className="num">{pct}%</div><div className="lbl">Accuracy</div></div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Mistakes were recorded and mastery has been recomputed from this attempt.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn primary" onClick={() => setQuiz(null)}>New quiz</button>
            <a href="/mistakes" className="btn">View Mistake Lab</a>
          </div>
        </div>
      </div>
    );
  }

  const question = quiz.questions[qIdx]!;

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <h1>{quiz.chapterTitle} — Q{qIdx + 1}/{quiz.questions.length}</h1>
      </header>
      <div className="card" style={{ maxWidth: 560 }}>
        <p style={{ marginBottom: 14, fontSize: 15 }}>{question.prompt}</p>
        {question.options.map((o) => {
          let cls = 'qopt';
          if (result) {
            if (o.text === result.correctAnswer) cls += ' correct';
            else if (o.id === selectedOption) cls += ' wrong';
          }
          return (
            <button key={o.id} className={cls} onClick={() => answer(o.id)} disabled={!!result}>
              {o.text}
            </button>
          );
        })}
        {result && (
          <>
            {result.explanation && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{result.explanation}</p>}
            <button className="btn primary" style={{ marginTop: 14 }} onClick={next}>
              {qIdx === quiz.questions.length - 1 ? 'Finish' : 'Next question'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
