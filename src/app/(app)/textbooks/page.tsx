'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api/client';
import { ErrorBanner } from '@/components/ErrorBanner';
import { STAGE_LABEL, type Textbook } from '@/types/api';

export default function TextbooksPage() {
  const [books, setBooks] = useState<Textbook[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.textbooks.list().then(setBooks).catch((err) => setError(err));
  }, []);

  useEffect(() => { load(); }, [load]);
  // Poll while anything is still processing so cards flip to Ready without a manual refresh.
  useEffect(() => {
    if (!books?.some((b) => !['ready', 'failed'].includes(b.status))) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [books, load]);

  const onFile = async (file: File) => {
    if (file.type !== 'application/pdf') { setError(new ApiError(400, 'Please choose a PDF file.')); return; }
    setLastFile(file);
    setUploading(true);
    setError(null);
    try {
      await api.textbooks.upload(file);
      load();
    } catch (err) {
      setError(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    try { await api.textbooks.remove(id); load(); }
    catch (err) { setError(err); }
  };

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>My Textbooks</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Upload a PDF and AI StudyOS builds a personal AI tutor from it</p></div>
      </header>

      <div className="card" style={{ marginBottom: 18, borderStyle: 'dashed' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Upload textbook (PDF)</div>
            <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Text-based PDFs work best. Scanned PDFs run through OCR automatically if it is configured.
            </p>
          </div>
          <label className="btn primary">
            {uploading ? <span className="spinner" /> : 'Choose PDF'}
            <input
              ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </label>
        </div>
      </div>

      {Boolean(error) && <ErrorBanner error={error} onRetry={lastFile ? () => onFile(lastFile) : undefined} />}

      {books === null ? (
        <p className="muted">Loading…</p>
      ) : books.length === 0 ? (
        <div className="empty"><div className="big">No textbooks yet</div>Upload a PDF to build your first AI-powered textbook.</div>
      ) : (
        <div className="cardgrid">
          {books.map((b) => (
            <div key={b.id} className="card">
              <Link href={b.status === 'ready' ? `/textbooks/${b.id}` : '#'} style={{ pointerEvents: b.status === 'ready' ? 'auto' : 'none' }}>
                <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 2 }}>{b.title}</div>
              </Link>
              <span className={`badge ${b.status === 'ready' ? 'emerald' : b.status === 'failed' ? 'red' : 'amber'}`}>
                {b.status === 'ready' ? '● Ready' : b.status === 'failed' ? '● Failed' : STAGE_LABEL[b.status]}
              </span>
              <div className="dim" style={{ fontSize: 11.5, marginTop: 8, display: 'flex', gap: 10 }}>
                <span>{b.pageCount} pages</span><span>{b.chapterCount} chapters</span>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                {b.status === 'ready' && <Link href={`/textbooks/${b.id}`} className="btn small">Open</Link>}
                <button className="btn small danger" onClick={() => remove(b.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
