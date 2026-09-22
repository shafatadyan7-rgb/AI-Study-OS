'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import { ChapterPicker } from '@/components/ChapterPicker';
import type { Chapter, FlashcardDue, Textbook } from '@/types/api';

export default function FlashcardsPage() {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [cards, setCards] = useState<FlashcardDue[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDue = async (ch: Chapter) => {
    setError(null);
    try {
      const due = await api.flashcards.due(ch.id);
      setCards(due);
      setIdx(0);
      setFlipped(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load flashcards.');
    }
  };

  const onSelect = (_book: Textbook, ch: Chapter) => { setChapter(ch); loadDue(ch); };

  const generate = async () => {
    if (!chapter) return;
    setBusy(true);
    setError(null);
    try {
      await api.flashcards.generate(chapter.id, 15);
      await loadDue(chapter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate flashcards.');
    } finally {
      setBusy(false);
    }
  };

  const review = async (grade: 0 | 3 | 5) => {
    const card = cards[idx];
    if (!card) return;
    try { await api.flashcards.review(card.id, grade); } catch { /* non-fatal for the session */ }
    setFlipped(false);
    setIdx((i) => (i + 1) % cards.length);
  };

  const due = cards.filter((c) => c.bucket === 'review_now').length;
  const soon = cards.filter((c) => c.bucket === 'review_soon').length;
  const strong = cards.filter((c) => c.bucket === 'strong').length;
  const current = cards[idx];

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Flashcards</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Reviews are scheduled by the real spaced-repetition engine</p></div>
      </header>

      <div className="card" style={{ marginBottom: 16 }}>
        <ChapterPicker onSelect={onSelect} />
        {chapter && (
          <button className="btn primary small" style={{ marginTop: 12 }} onClick={generate} disabled={busy}>
            {busy ? <span className="spinner" /> : 'Generate flashcards for this chapter'}
          </button>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {cards.length > 0 && (
        <>
          <div className="statrow" style={{ marginBottom: 16 }}>
            <div className="stat"><div className="num" style={{ color: 'var(--red)' }}>{due}</div><div className="lbl">Review now</div></div>
            <div className="stat"><div className="num" style={{ color: 'var(--amber)' }}>{soon}</div><div className="lbl">Review soon</div></div>
            <div className="stat"><div className="num" style={{ color: 'var(--emerald)' }}>{strong}</div><div className="lbl">Strong</div></div>
          </div>

          {current && (
            <div style={{ maxWidth: 520, margin: '0 auto' }}>
              <p className="muted" style={{ textAlign: 'center', marginBottom: 10, fontSize: 12 }}>
                Card {idx + 1} / {cards.length} · <span className="tag">{current.kind}</span>
              </p>
              <div className="flip-wrap" onClick={() => setFlipped((f) => !f)}>
                <div className={`flip ${flipped ? 'flipped' : ''}`}>
                  <div className="face">{current.front}</div>
                  <div className="face back">{current.back}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
                <button className="btn" onClick={() => review(0)}>Again</button>
                <button className="btn" onClick={() => review(3)}>Hard</button>
                <button className="btn primary" onClick={() => review(5)}>Easy</button>
              </div>
            </div>
          )}
        </>
      )}

      {chapter && cards.length === 0 && !busy && (
        <div className="empty"><div className="big">No flashcards yet</div>Generate flashcards from this chapter above.</div>
      )}
    </div>
  );
}
