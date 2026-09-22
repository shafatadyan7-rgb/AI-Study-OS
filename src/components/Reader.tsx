'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { ErrorBanner } from './ErrorBanner';
import { STAGE_LABEL, type Chapter, type Citation, type Page, type Scope, type TextbookStatus } from '@/types/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Citation[];
  insufficientEvidence?: boolean;
  streaming?: boolean;
}

const SELECTION_ACTIONS = [
  { id: 'explain', label: 'Explain', prompt: (t: string) => `Explain this: "${t}"` },
  { id: 'simplify', label: 'Simplify', prompt: (t: string) => `Simplify this for a beginner: "${t}"` },
  { id: 'summarize', label: 'Summarize', prompt: (t: string) => `Summarize this: "${t}"` },
  { id: 'translate', label: 'Translate', prompt: (t: string) => `Translate this to Bangla: "${t}"` },
  { id: 'example', label: 'Give example', prompt: (t: string) => `Give a worked example of this: "${t}"` },
  { id: 'quiz', label: 'Quiz me', prompt: (t: string) => `Ask me three questions about this: "${t}"` },
];

export function Reader({ textbookId }: { textbookId: string }) {
  const [status, setStatus] = useState<TextbookStatus | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scope, setScope] = useState<Scope>('chapter');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [selection, setSelection] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const sessionId = useRef<string | undefined>(undefined);
  const chatEnd = useRef<HTMLDivElement>(null);

  /* ---- processing status: polled from the backend, never animated locally ---- */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const s = await api.textbooks.status(textbookId);
        if (cancelled) return;
        setStatus(s);
        if (s.status !== 'ready' && s.status !== 'failed') {
          timer = setTimeout(poll, 2000);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      }
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [textbookId]);

  useEffect(() => {
    if (status?.status !== 'ready') return;
    api.textbooks.chapters(textbookId)
      .then((cs) => {
        setChapters(cs);
        const first = cs[0];
        if (first) { setActiveChapter(first); setPageNumber(first.startPage); }
      })
      .catch((err) => setError(err));
  }, [status?.status, textbookId]);

  useEffect(() => {
    if (status?.status !== 'ready') return;
    api.textbooks.page(textbookId, pageNumber)
      .then(setPage)
      .catch(() => setPage(null));
  }, [pageNumber, status?.status, textbookId]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const ask = useCallback(async (question: string) => {
    if (!question.trim() || busy) return;
    setLastQuery(question);
    setBusy(true);
    setError(null);
    setChatOpen(true);
    setMessages((m) => [...m, { role: 'user', content: question }, { role: 'assistant', content: '', streaming: true }]);

    try {
      const stream = api.tutor.askStream({
        query: question,
        scope,
        textbookId,
        chapterId: activeChapter?.id,
        pageNumber: scope === 'page' ? pageNumber : undefined,
        sessionId: sessionId.current,
      });

      for await (const evt of stream) {
        if (evt.delta) {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') last.content += evt.delta;
            return copy;
          });
        }
        if (evt.done) {
          sessionId.current = evt.done.sessionId;
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              // Citations come from the backend only; the client never derives one.
              last.sources = evt.done!.sources;
              last.insufficientEvidence = evt.done!.insufficientEvidence;
              last.streaming = false;
              if (!last.content) last.content = evt.done!.answer;
            }
            return copy;
          });
        }
      }
    } catch (err) {
      setMessages((m) => m.slice(0, -1));
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [activeChapter?.id, busy, pageNumber, scope, textbookId]);

  /* ---- processing and failure states ---- */
  if (!status) return <output className="pane-loading">Loading textbook…</output>;

  if (status.status === 'failed') {
    return (
      <div className="state-error" role="alert">
        <h1>Processing failed</h1>
        <p>{status.error ?? 'This textbook could not be processed.'}</p>
        <Link className="btn" href="/textbooks">Back to library</Link>
      </div>
    );
  }

  if (status.status !== 'ready') {
    return (
      <div className="state-processing" aria-live="polite">
        <h1>{STAGE_LABEL[status.status]}</h1>
        <div
          className="bar-bg"
          role="progressbar"
          aria-valuenow={status.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Processing progress"
        >
          <div className="bar-fg" style={{ width: `${status.progress}%` }} />
        </div>
        <p className="muted">{status.stageDetail ?? 'Working through the pipeline.'}</p>
        <p className="dim">This progress comes from the processing worker, not a timer.</p>
      </div>
    );
  }

  return (
    <div className="reader">
      <nav className="pane pane-chapters" aria-label="Chapters">
        <h2 className="pane-title">Chapters</h2>
        <ul>
          {chapters.map((c) => (
            <li key={c.id}>
              <button
                className={`chapitem ${activeChapter?.id === c.id ? 'active' : ''}`}
                aria-current={activeChapter?.id === c.id ? 'true' : undefined}
                onClick={() => { setActiveChapter(c); setPageNumber(c.startPage); }}
              >
                {c.title}
                <span className="dim">from p.{c.startPage}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <article
        className="pane pane-page"
        onMouseUp={() => setSelection(window.getSelection()?.toString().trim() ?? '')}
      >
        <header className="page-header">
          <h2 className="pane-title">Page {pageNumber} of {status.pageCount}</h2>
          {page?.extractedBy === 'ocr' && (
            <span className="pill" title="This page was recovered with OCR and may contain recognition errors.">
              OCR
            </span>
          )}
        </header>

        <div className="pagecontent">
          {page?.text || 'No extractable text on this page.'}
        </div>

        {selection && (
          <div className="selection-actions" role="toolbar" aria-label="Actions for selected text">
            {SELECTION_ACTIONS.map((a) => (
              <button key={a.id} className="btn small" onClick={() => ask(a.prompt(selection))}>
                {a.label}
              </button>
            ))}
          </div>
        )}

        <nav className="page-nav" aria-label="Page navigation">
          <button
            className="btn small"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
          >
            ◀ Previous
          </button>
          <button
            className="btn small"
            onClick={() => setPageNumber((p) => Math.min(status.pageCount, p + 1))}
            disabled={pageNumber >= status.pageCount}
          >
            Next ▶
          </button>
        </nav>
      </article>

      <section className={`pane pane-chat ${chatOpen ? 'open' : ''}`} aria-label="AI tutor">
        <h2 className="pane-title">Ask your textbook</h2>

        <div className="scopebar" role="radiogroup" aria-label="Which part of the book to search">
          {(['page', 'chapter', 'textbook', 'library'] as Scope[]).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={scope === s}
              className={`scopechip ${scope === s ? 'active' : ''}`}
              onClick={() => setScope(s)}
            >
              {s === 'page' ? 'This page' : s === 'chapter' ? 'This chapter' : s === 'textbook' ? 'Whole book' : 'All books'}
            </button>
          ))}
        </div>

        <div className="chatscroll" aria-live="polite">
          {messages.length === 0 && (
            <p className="muted">Ask a question, or select text on the page to act on it.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div>{m.content}{m.streaming && <span className="cursor" aria-hidden="true">▋</span>}</div>
              {m.sources && m.sources.length > 0 && (
                <ul className="sources">
                  {m.sources.map((s) => (
                    <li key={s.chunkId}>
                      {s.textbookTitle} — {s.chapterTitle ?? 'unstructured'} — page {s.pageNumber}
                    </li>
                  ))}
                </ul>
              )}
              {m.insufficientEvidence && (
                <p className="dim">No supporting passage was found, so no source is shown.</p>
              )}
            </div>
          ))}
          <div ref={chatEnd} />
        </div>

        {Boolean(error) && <ErrorBanner error={error} onRetry={lastQuery ? () => ask(lastQuery) : undefined} />}

        <form
          className="chatinput"
          onSubmit={(e) => { e.preventDefault(); const q = input; setInput(''); ask(q); }}
        >
          <label className="sr-only" htmlFor="tutor-input">Your question</label>
          <input
            id="tutor-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={busy}
          />
          <button className="btn primary small" type="submit" disabled={busy || !input.trim()}>
            {busy ? 'Thinking…' : 'Ask'}
          </button>
        </form>
      </section>

      <button
        className="chat-fab"
        onClick={() => setChatOpen((v) => !v)}
        aria-expanded={chatOpen}
        aria-controls="tutor-input"
      >
        {chatOpen ? 'Close tutor' : 'Ask AI'}
      </button>
    </div>
  );
}
