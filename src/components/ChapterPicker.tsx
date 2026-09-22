'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import type { Chapter, Textbook } from '@/types/api';

/**
 * Shared textbook -> chapter selector used by flashcards, quiz, mistake
 * practice and the knowledge map. One implementation of "which chapter am I
 * working with" so the four pages that need it cannot drift out of sync.
 */
export function ChapterPicker({
  onSelect,
  initialChapterId,
}: {
  onSelect: (textbook: Textbook, chapter: Chapter) => void;
  /** Pre-select a specific chapter (e.g. handed off from Mistake Lab's
   *  "Practice weakest topic"), overriding the usual "first chapter" default. */
  initialChapterId?: string;
}) {
  const [books, setBooks] = useState<Textbook[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [bookId, setBookId] = useState('');
  const [chapterId, setChapterId] = useState('');

  useEffect(() => {
    api.textbooks.list().then(async (bs) => {
      const ready = bs.filter((b) => b.status === 'ready');
      setBooks(ready);
      if (!initialChapterId) { if (ready[0]) setBookId(ready[0].id); return; }
      // Find which textbook actually owns the target chapter, rather than
      // defaulting to the first one and hoping the chapter lives there.
      for (const b of ready) {
        const cs = await api.textbooks.chapters(b.id);
        if (cs.some((c) => c.id === initialChapterId)) { setBookId(b.id); return; }
      }
      if (ready[0]) setBookId(ready[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bookId) return;
    api.textbooks.chapters(bookId).then((cs) => {
      setChapters(cs);
      const preselect = initialChapterId && cs.find((c) => c.id === initialChapterId);
      setChapterId((preselect || cs[0])?.id ?? '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    const book = books.find((b) => b.id === bookId);
    const chapter = chapters.find((c) => c.id === chapterId);
    if (book && chapter) onSelect(book, chapter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapterId]);

  if (books.length === 0) return <p className="muted">Upload and open a textbook first.</p>;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <label className="sr-only" htmlFor="picker-book">Textbook</label>
      <select id="picker-book" value={bookId} onChange={(e) => setBookId(e.target.value)} style={{ width: 'auto' }}>
        {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
      </select>
      <label className="sr-only" htmlFor="picker-chapter">Chapter</label>
      <select id="picker-chapter" value={chapterId} onChange={(e) => setChapterId(e.target.value)} style={{ width: 'auto' }}>
        {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </div>
  );
}
