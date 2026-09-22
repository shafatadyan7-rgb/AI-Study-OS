'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import { ChapterPicker } from '@/components/ChapterPicker';
import type { Chapter, FlashcardDue, Textbook } from '@/types/api';

const BUCKET_LABEL: Record<string, string> = {
  review_now: 'Review now', review_soon: 'Review soon', strong: 'Strong',
};
const BUCKET_COLOR: Record<string, string> = {
  review_now: 'var(--red)', review_soon: 'var(--amber)', strong: 'var(--emerald)',
};

export default function RevisionPage() {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [cards, setCards] = useState<FlashcardDue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onSelect = (_book: Textbook, ch: Chapter) => {
    setChapter(ch);
    api.flashcards.due(ch.id).then(setCards).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load revision items.'));
  };

  const review = async (id: string, grade: 0 | 3 | 5) => {
    try {
      const r = await api.flashcards.review(id, grade);
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, bucket: r.bucket, nextReviewAt: r.nextReviewAt } : c)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that review.');
    }
  };

  const grouped: Record<string, FlashcardDue[]> = { review_now: [], review_soon: [], strong: [] };
  for (const c of cards) grouped[c.bucket]!.push(c);

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Revision</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Scheduled by the same spaced-repetition engine used everywhere else</p></div>
      </header>

      <div className="card" style={{ marginBottom: 18 }}>
        <ChapterPicker onSelect={onSelect} />
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {chapter && cards.length === 0 && (
        <div className="empty"><div className="big">Nothing to revise here yet</div>Generate flashcards for this chapter first.</div>
      )}

      {(['review_now', 'review_soon', 'strong'] as const).map((bucket) => (
        grouped[bucket]!.length > 0 && (
          <div key={bucket} style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, color: BUCKET_COLOR[bucket], marginBottom: 8 }}>
              {BUCKET_LABEL[bucket]} ({grouped[bucket]!.length})
            </h2>
            {grouped[bucket]!.map((c) => (
              <div key={c.id} className="mistake-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13 }}>{c.front}</span>
                {bucket === 'review_now' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn small" onClick={() => review(c.id, 0)}>Again</button>
                    <button className="btn small" onClick={() => review(c.id, 3)}>Hard</button>
                    <button className="btn small primary" onClick={() => review(c.id, 5)}>Easy</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ))}
    </div>
  );
}
