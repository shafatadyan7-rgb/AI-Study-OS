'use client';

import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { ScannerResult } from '@/types/api';

type Depth = 'hint' | 'step_by_step' | 'full_solution';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ScannerPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [depth, setDepth] = useState<Depth>('hint');
  const [result, setResult] = useState<ScannerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setPreview(URL.createObjectURL(file));
    setBase64(await fileToBase64(file));
    setResult(null);
    setError(null);
  };

  const solve = async (chosenDepth: Depth) => {
    if (!base64) return;
    setDepth(chosenDepth);
    setBusy(true);
    setError(null);
    try {
      const r = await api.scanner.solve({ imageBase64: base64, depth: chosenDepth });
      setResult(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not read or solve that question.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div><h1>Question Scanner</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Photograph a question — answers are grounded in your own textbooks, hints first</p></div>
      </header>

      <div className="card" style={{ marginBottom: 18, maxWidth: 480 }}>
        <label className="btn primary">
          {preview ? 'Choose a different photo' : 'Upload a photo of a question'}
          <input
            ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
        </label>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Uploaded question" style={{ maxWidth: '100%', marginTop: 12, borderRadius: 10, border: '1px solid var(--border)' }} />
        )}
      </div>

      {base64 && !result && (
        <div className="card" style={{ marginBottom: 18, maxWidth: 480, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => solve('hint')} disabled={busy}>{busy && depth === 'hint' ? <span className="spinner" /> : 'Give me a hint'}</button>
          <button className="btn" onClick={() => solve('step_by_step')} disabled={busy}>{busy && depth === 'step_by_step' ? <span className="spinner" /> : 'Step by step'}</button>
          <button className="btn" onClick={() => solve('full_solution')} disabled={busy}>{busy && depth === 'full_solution' ? <span className="spinner" /> : 'Full solution'}</button>
        </div>
      )}

      {error && <p className="error" role="alert" style={{ maxWidth: 480 }}>{error}</p>}

      {result && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <span className="badge">{result.parsed.language}</span>
            <span className="badge">{result.parsed.subject}</span>
            {result.parsed.isNumerical && <span className="badge cyan">numerical</span>}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Read: &quot;{result.parsed.text}&quot;</p>
          <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{result.answer}</p>
          {result.sources.length > 0 && (
            <ul className="sources" style={{ marginTop: 10 }}>
              {result.sources.map((s, i) => <li key={i}>{s.textbookTitle} — {s.chapterTitle ?? 'unstructured'} — page {s.pageNumber}</li>)}
            </ul>
          )}
          {!result.insufficientEvidence && depth !== 'full_solution' && (
            <button className="btn small" style={{ marginTop: 12 }} onClick={() => solve(depth === 'hint' ? 'step_by_step' : 'full_solution')}>
              {depth === 'hint' ? 'Show steps' : 'Show full solution'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
