'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import { ChapterPicker } from '@/components/ChapterPicker';
import type { Chapter, NoteRow, Textbook } from '@/types/api';

const MODES = [
  { id: 'quick', label: 'Quick notes' }, { id: 'chapter', label: 'Chapter notes' },
  { id: 'concept', label: 'Concept notes' }, { id: 'exam', label: 'Exam notes' },
  { id: 'revision', label: 'Revision notes' }, { id: 'one_page', label: 'One-page summary' },
] as const;

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (q?: string) => {
    api.notes.list(q ? { q } : undefined).then(setNotes).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load notes.'));
  };
  useEffect(() => { load(); }, []);

  const generate = async (mode: string) => {
    if (!chapter) return;
    setGenerating(mode); setError(null);
    try { await api.notes.generate({ chapterId: chapter.id, mode }); load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not generate that note.'); }
    finally { setGenerating(null); }
  };

  const toggle = async (note: NoteRow, field: 'pinned' | 'favorite') => {
    setNotes((prev) => prev?.map((n) => (n.id === note.id ? { ...n, [field]: !n[field] } : n)) ?? prev);
    try { await api.notes.update(note.id, { [field]: !note[field] }); } catch { load(search); }
  };

  const remove = async (id: string) => {
    try { await api.notes.remove(id); load(search); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not delete that note.'); }
  };

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Notes</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>AI-generated notes keep their textbook and page source; you can also write your own</p></div>
      </header>

      <div className="card" style={{ marginBottom: 18 }}>
        <ChapterPicker onSelect={(_b: Textbook, c: Chapter) => setChapter(c)} />
        {chapter && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {MODES.map((m) => (
              <button key={m.id} className="btn small" onClick={() => generate(m.id)} disabled={!!generating}>
                {generating === m.id ? <span className="spinner" /> : m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        placeholder="Search notes…" value={search}
        onChange={(e) => { setSearch(e.target.value); load(e.target.value); }}
        style={{ marginBottom: 16, maxWidth: 320 }} aria-label="Search notes"
      />

      {error && <p className="error" role="alert">{error}</p>}

      {notes === null ? <p className="muted">Loading…</p> : notes.length === 0 ? (
        <div className="empty"><div className="big">No notes yet</div>Generate notes from a chapter above, or write your own.</div>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div>
                <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {n.aiGenerated && <span className="badge cyan" style={{ marginRight: 6 }}>{n.mode}</span>}
                  {n.textbookTitle && `${n.textbookTitle}${n.chapterTitle ? ` — ${n.chapterTitle}` : ''}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn small" onClick={() => toggle(n, 'pinned')} aria-pressed={n.pinned} aria-label={n.pinned ? 'Unpin note' : 'Pin note'}>{n.pinned ? '📌 Pinned' : 'Pin'}</button>
                <button className="btn small" onClick={() => toggle(n, 'favorite')} aria-pressed={n.favorite} aria-label={n.favorite ? 'Remove from favorites' : 'Add to favorites'}>{n.favorite ? '★ Favorite' : 'Favorite'}</button>
                <button className="btn small danger" onClick={() => remove(n.id)}>Delete</button>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 10, whiteSpace: 'pre-wrap' }}>
              {n.body.length > 400 ? `${n.body.slice(0, 400)}…` : n.body}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
