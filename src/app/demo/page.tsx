'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import { ErrorBanner } from '@/components/ErrorBanner';
import type { Textbook, Chapter, QuizSet, MasteryRow, CoachCard } from '@/types/api';
import { DEMO_QUESTION } from '@/lib/demo/seed-data';

type Screen =
  | 'intro' | 'textbook' | 'understand' | 'ask' | 'notes' | 'quiz-config'
  | 'quiz' | 'mistake-lab' | 'practice' | 'mastery' | 'coach' | 'outro';

/** The carnival spec's 8 named steps, mapped from the finer internal screen
 *  list above. Several internal screens share one visible step -- the visitor
 *  sees a clean 8-step story, the app still drives each real API call. */
const STEP_LABELS = ['Upload', 'Understand', 'Ask', 'Learn', 'Practice', 'Mistake', 'Mastery', 'Coach'] as const;
const SCREEN_TO_STEP: Record<Screen, number> = {
  intro: 0, textbook: 0, understand: 1, ask: 2, notes: 3,
  'quiz-config': 4, quiz: 4, 'mistake-lab': 5, practice: 5,
  mastery: 6, coach: 7, outro: 7,
};

export default function PresentationModePage() {
  const [screen, setScreen] = useState<Screen>('intro');
  const [carnivalMode, setCarnivalMode] = useState(true);
  const [book, setBook] = useState<Textbook | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [askAnswer, setAskAnswer] = useState<{ answer: string; page: number | null } | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizSet | null>(null);
  const [qIdx, setQIdx] = useState(0);
  const [wrongOnPurpose, setWrongOnPurpose] = useState(false);
  const [mistakeCount, setMistakeCount] = useState<number | null>(null);
  const [mastery, setMastery] = useState<MasteryRow[] | null>(null);
  const [coach, setCoach] = useState<CoachCard>(null);
  const [error, setError] = useState<unknown>(null);
  const [lastAction, setLastAction] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const currentStep = SCREEN_TO_STEP[screen];
  const go = (s: Screen) => { setError(null); setScreen(s); };

  const runStep = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setLastAction(() => () => runStep(label, action));
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };

  const findDemoTextbook = () => runStep('Reading your textbook...', async () => {
    const books = await api.textbooks.list();
    const demo = books.find((b) => b.isDemo && b.status === 'ready');
    if (!demo) throw new ApiError(404, 'The demo textbook has not been seeded yet. Run `npm run db:seed` first.');
    setBook(demo);
    const chapters = await api.textbooks.chapters(demo.id);
    setChapter(chapters[0] ?? null);
    go('understand');
  });

  const askDemoQuestion = () => runStep('Finding relevant evidence...', async () => {
    if (!book) return;
    const res = await api.tutor.ask({ query: DEMO_QUESTION, scope: 'textbook', textbookId: book.id });
    setAskAnswer({ answer: res.answer, page: res.sources[0]?.pageNumber ?? null });
    go('ask');
  });

  const generateNotesAndAdvance = () => runStep('Generating your study material...', async () => {
    if (!book || !chapter) return;
    const res = await api.tutor.ask({
      query: 'Summarize this chapter into short revision notes with headings and key points.',
      scope: 'chapter', textbookId: book.id, chapterId: chapter.id,
    });
    setNotes(res.answer);
    go('notes');
  });

  const generateQuiz = () => runStep('Building your quiz...', async () => {
    if (!chapter) return;
    const q = await api.quiz.generate({ chapterId: chapter.id, count: 3, difficulty: 'easy' });
    setQuiz(q); setQIdx(0); setWrongOnPurpose(false);
    go('quiz');
  });

  const answerWrongOnPurpose = () => runStep('Recording your answer...', async () => {
    if (!quiz) return;
    const q = quiz.questions[qIdx]!;
    const guess = q.options[q.options.length - 1]!;
    await api.quiz.answer(quiz.attemptId, { questionId: q.id, optionId: guess.id });
    await api.quiz.finish(quiz.attemptId).catch(() => {});
    setWrongOnPurpose(true);
    go('mistake-lab');
  });

  const loadMistakeLab = () => runStep('Checking the Mistake Lab...', async () => {
    const rows = await api.mistakes.list(book?.id);
    setMistakeCount(rows.length);
    go(rows.length > 0 ? 'practice' : 'mistake-lab');
  });

  const loadMastery = () => runStep('Recomputing mastery...', async () => {
    if (!book) return;
    const rows = await api.mastery.forTextbook(book.id);
    setMastery(rows);
    go('mastery');
  });

  const loadCoach = () => runStep('Asking the AI coach...', async () => {
    const rec = await api.coach.today();
    setCoach(rec);
    go('coach');
  });

  const restart = () => {
    setScreen('intro'); setBook(null); setChapter(null); setQuiz(null); setNotes(null);
    setAskAnswer(null); setMastery(null); setCoach(null); setMistakeCount(null);
    setWrongOnPurpose(false); setError(null);
  };

  return (
    <div className="presentation">
      <button
        className={`carnival-badge ${carnivalMode ? 'on' : ''}`}
        onClick={() => setCarnivalMode((v) => !v)}
        aria-pressed={carnivalMode}
      >
        {carnivalMode ? '\u25cf CARNIVAL MODE' : 'Carnival mode off'}
      </button>

      {screen !== 'intro' && (
        <ol className="presentation-steps" aria-label="Demo progress">
          {STEP_LABELS.map((label, i) => (
            <li key={label} className={i === currentStep ? 'active' : i < currentStep ? 'done' : ''}>
              <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="step-label">{label}</span>
            </li>
          ))}
        </ol>
      )}

      {Boolean(error) && (
        <div className="presentation-error-wrap">
          <ErrorBanner error={error} onRetry={lastAction ?? undefined} />
        </div>
      )}

      {screen === 'intro' && (
        <Screen title="AI STUDYOS" subtitle="Your Personal AI Learning Operating System">
          <p className="presentation-lede">One textbook. One AI. One personal learning system.</p>
          <button className="btn primary presentation-cta" onClick={findDemoTextbook} disabled={!!busy}>
            {busy ? <><span className="spinner" /> {busy}</> : 'START DEMO'}
          </button>
        </Screen>
      )}

      {screen === 'understand' && book && (
        <Screen title="AI understands your textbook" subtitle={book.title}>
          <div className="statrow presentation-stats">
            <div className="stat"><div className="num">{book.pageCount}</div><div className="lbl">Pages</div></div>
            <div className="stat"><div className="num">{book.chapterCount}</div><div className="lbl">Chapters</div></div>
          </div>
          <span className="badge cyan" style={{ fontSize: 13, padding: '6px 14px' }}>DEMO DATA -- not a real student record</span>
          <button className="btn primary presentation-cta" onClick={askDemoQuestion} disabled={!!busy}>
            {busy ? <><span className="spinner" /> {busy}</> : 'Ask your textbook'}
          </button>
        </Screen>
      )}

      {screen === 'ask' && askAnswer && (
        <Screen title="Ask your textbook" subtitle={DEMO_QUESTION}>
          <p className="presentation-answer">{askAnswer.answer}</p>
          {askAnswer.page && <p className="dim">Source: page {askAnswer.page}</p>}
          <button className="btn primary presentation-cta" onClick={generateNotesAndAdvance} disabled={!!busy}>
            {busy ? <><span className="spinner" /> {busy}</> : 'Generate notes'}
          </button>
        </Screen>
      )}

      {screen === 'notes' && notes && (
        <Screen title="Learn" subtitle="Notes generated from the same evidence">
          <p className="presentation-answer" style={{ whiteSpace: 'pre-wrap', textAlign: 'left', maxWidth: 700 }}>{notes}</p>
          <button className="btn primary presentation-cta" onClick={generateQuiz} disabled={!!busy}>
            {busy ? <><span className="spinner" /> {busy}</> : 'Generate a quiz'}
          </button>
        </Screen>
      )}

      {screen === 'quiz' && quiz && !wrongOnPurpose && (
        <Screen title="Practice" subtitle={quiz.chapterTitle}>
          <p className="presentation-lede">{quiz.questions[qIdx]!.prompt}</p>
          <p className="dim" style={{ marginBottom: 20 }}>Watch -- we&apos;ll answer this one incorrectly on purpose.</p>
          <button className="btn primary presentation-cta" onClick={answerWrongOnPurpose} disabled={!!busy}>
            {busy ? <><span className="spinner" /> {busy}</> : 'Submit a deliberately wrong answer'}
          </button>
        </Screen>
      )}

      {screen === 'mistake-lab' && (
        <Screen title="Mistake detected" subtitle="The system records it, classifies it, and links it to the chapter">
          <button className="btn primary presentation-cta" onClick={loadMistakeLab} disabled={!!busy}>
            {busy ? <><span className="spinner" /> {busy}</> : 'Open Mistake Lab'}
          </button>
        </Screen>
      )}

      {screen === 'practice' && (
        <Screen title="Targeted practice" subtitle="The weak concept just surfaced becomes the next practice session">
          <button className="btn primary presentation-cta" onClick={loadMastery} disabled={!!busy}>
            {busy ? <><span className="spinner" /> {busy}</> : 'Show mastery update'}
          </button>
        </Screen>
      )}

      {screen === 'mastery' && mastery && (
        <Screen title="Mastery" subtitle="Not to MASTERED -- one attempt is never enough evidence">
          {mastery.map((m) => (
            <div key={m.chapterId} style={{ marginBottom: 10, width: 360 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{m.chapterTitle}</span><span>{m.state}</span>
              </div>
              <p className="dim" style={{ fontSize: 11.5 }}>{m.reason}</p>
            </div>
          ))}
          <button className="btn primary presentation-cta" onClick={loadCoach} disabled={!!busy}>
            {busy ? <><span className="spinner" /> {busy}</> : "Show the AI coach's recommendation"}
          </button>
        </Screen>
      )}

      {screen === 'coach' && (
        <Screen title="AI Coach" subtitle="Here's what you should study next">
          {coach ? (
            <>
              <p className="presentation-lede">{coach.headline}</p>
              <p className="dim">{coach.reason}</p>
            </>
          ) : (
            <p className="dim">NOT ENOUGH DATA yet -- this is the honest state after a single demo pass.</p>
          )}
          <button className="btn primary presentation-cta" onClick={() => go('outro')}>Finish</button>
        </Screen>
      )}

      {screen === 'outro' && (
        <Screen title="Your Learning System is Ready" subtitle="">
          <div className="presentation-summary">
            {book && <SummaryRow label="Textbook" value={book.title} />}
            {book && <SummaryRow label="Chapters" value={String(book.chapterCount)} />}
            <SummaryRow label="Questions answered" value={quiz ? '1' : '0'} />
            <SummaryRow label="Quiz performance" value={quiz ? `0 / ${quiz.questions.length} (deliberate demo miss)` : '\u2014'} />
            <SummaryRow label="Mistakes identified" value={mistakeCount !== null ? String(mistakeCount) : '\u2014'} />
            <SummaryRow
              label="Mastery status"
              value={mastery && mastery[0] ? `${mastery[0].chapterTitle}: ${mastery[0].state}` : 'NOT ENOUGH DATA'}
            />
            <SummaryRow label="Recommended next action" value={coach ? coach.headline : 'NOT ENOUGH DATA'} />
          </div>
          <p className="presentation-lede" style={{ marginTop: 30 }}>
            ONE TEXTBOOK.<br />ONE AI.<br />ONE PERSONAL LEARNING SYSTEM.
          </p>
          <button className="btn presentation-cta" onClick={restart}>Restart demo</button>
        </Screen>
      )}
    </div>
  );
}

function Screen({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="presentation-screen">
      <h1 className="presentation-title">{title}</h1>
      {subtitle && <p className="presentation-subtitle">{subtitle}</p>}
      <div className="presentation-body">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-row">
      <span className="dim">{label}</span>
      <span>{value}</span>
    </div>
  );
}
