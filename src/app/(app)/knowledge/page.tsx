'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api/client';
import type { Textbook, GraphResponse } from '@/types/api';

type Node = GraphResponse['nodes'][number] & { x: number; y: number };

const KIND_COLOR: Record<string, string> = {
  chapter: 'var(--violet)', section: 'var(--cyan)', concept: 'var(--emerald)',
};
const KIND_RADIUS: Record<string, number> = { chapter: 16, section: 10, concept: 7 };

/**
 * Force-free radial layout: chapters ring the centre, their sections and
 * concepts fan out around them. No physics simulation, no external graph
 * library — just enough geometry to make real structure legible.
 */
/** Deterministic 0..1 pseudo-random from a string, so re-rendering the same
 *  graph never reshuffles node positions the way Math.random() would. */
function seededJitter(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

function layout(graph: GraphResponse): Node[] {
  const chapters = graph.nodes.filter((n) => n.kind === 'chapter');
  const W = 900, H = 560, cx = W / 2, cy = H / 2;
  const placed = new Map<string, Node>();

  chapters.forEach((ch, i) => {
    const angle = (i / Math.max(chapters.length, 1)) * Math.PI * 2;
    const r = Math.min(W, H) * 0.32;
    placed.set(ch.id, { ...ch, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  });

  const children = (parentId: string) =>
    graph.edges.filter((e) => e.from === parentId && e.kind === 'contains').map((e) => e.to);

  for (const ch of chapters) {
    const chNode = placed.get(ch.id)!;
    const kids = children(ch.id);
    kids.forEach((kidId, i) => {
      const node = graph.nodes.find((n) => n.id === kidId);
      if (!node || placed.has(kidId)) return;
      const spread = (i / Math.max(kids.length - 1, 1) - 0.5) * 1.4;
      const angle = Math.atan2(chNode.y - cy, chNode.x - cx) + spread;
      const r = Math.hypot(chNode.x - cx, chNode.y - cy) + 90;
      const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
      placed.set(kidId, { ...node, x, y });

      for (const grandId of children(kidId)) {
        const grand = graph.nodes.find((n) => n.id === grandId);
        if (!grand || placed.has(grandId)) continue;
        const gAngle = angle + (seededJitter(grandId) - 0.5) * 0.8;
        const gr = r + 60;
        placed.set(grandId, { ...grand, x: cx + Math.cos(gAngle) * gr, y: cy + Math.sin(gAngle) * gr });
      }
    });
  }

  for (const n of graph.nodes) if (!placed.has(n.id)) placed.set(n.id, { ...n, x: cx, y: cy });
  return [...placed.values()];
}

export default function KnowledgePage() {
  const [books, setBooks] = useState<Textbook[]>([]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [bookId, setBookId] = useState('');
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [selected, setSelected] = useState<Node | null>(null);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.textbooks.list().then((bs) => {
      const ready = bs.filter((b) => b.status === 'ready');
      setBooks(ready);
      if (ready[0]) setBookId(ready[0].id);
    });
  }, []);

  useEffect(() => {
    if (!bookId) return;
    api.knowledge.graph(bookId).then(setGraph).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the knowledge map.'));
  }, [bookId]);

  // Accessible dialog behaviour for the node panel: move focus in on open,
  // close on Escape, and never leave focus stranded on a removed element.
  useEffect(() => {
    if (!selected) return;
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  if (books.length === 0) {
    return <div className="empty"><div className="big">No textbook ready yet</div>Upload and process a textbook to see its knowledge map.</div>;
  }

  const nodes = graph ? layout(graph) : [];
  const q = query.trim().toLowerCase();
  const matches = new Set(q ? nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id) : null);

  return (
    <div>
      <header className="topbar" style={{ marginBottom: 16 }}>
        <div><h1>Knowledge Map</h1><p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Built from your textbook&apos;s real chapter, section and definition structure</p></div>
      </header>

      <div className="graph-toolbar">
        <select value={bookId} onChange={(e) => setBookId(e.target.value)} style={{ width: 'auto' }}>
          {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
        <input placeholder="Search concepts…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 200 }} aria-label="Search the knowledge map" />
        <button className="btn small" onClick={() => setZoom((z) => Math.min(z + 0.2, 2))} aria-label="Zoom in">+</button>
        <button className="btn small" onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))} aria-label="Zoom out">−</button>
        <button className="btn small" onClick={() => { setZoom(1); setQuery(''); }}>Reset</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {graph && graph.nodes.length === 0 ? (
        <div className="empty"><div className="big">No concepts detected yet</div>This textbook has no explicit definitions for the graph to build from.</div>
      ) : (
        <div className="graph-canvas">
          <svg viewBox="0 0 900 560" width="100%" height="100%" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}>
            {graph?.edges.map((e, i) => {
              const from = nodes.find((n) => n.id === e.from);
              const to = nodes.find((n) => n.id === e.to);
              if (!from || !to) return null;
              return (
                <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={e.kind === 'contains' ? '#262a33' : '#3a4150'}
                  strokeWidth={e.kind === 'contains' ? 1 : 1.5}
                  strokeDasharray={e.kind === 'co_occurs' ? '3 3' : undefined} />
              );
            })}
            {nodes.map((n) => {
              const dimmed = q && !matches.has(n.id);
              return (
                <g key={n.id} onClick={() => setSelected(n)} style={{ cursor: 'pointer', opacity: dimmed ? 0.25 : 1 }}>
                  <circle cx={n.x} cy={n.y} r={KIND_RADIUS[n.kind]} fill={KIND_COLOR[n.kind]} fillOpacity={0.85} />
                  <text x={n.x} y={n.y + KIND_RADIUS[n.kind]! + 12} textAnchor="middle" fontSize={n.kind === 'chapter' ? 11 : 9}
                    fill="#cfd2d8" style={{ pointerEvents: 'none' }}>
                    {n.label.length > 22 ? `${n.label.slice(0, 22)}…` : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {selected && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label={`${selected.label} details`}>
          <button ref={closeButtonRef} className="btn small" onClick={() => setSelected(null)} style={{ marginBottom: 14 }}>Close</button>
          <span className="badge" style={{ color: KIND_COLOR[selected.kind] }}>{selected.kind}</span>
          <h2 style={{ fontSize: 17, margin: '8px 0 12px' }}>{selected.label}</h2>
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Appears on page{selected.pages.length > 1 ? 's' : ''} {selected.pages.join(', ')}.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a className="btn small" href="/flashcards">Study with flashcards</a>
            <a className="btn small" href="/quizzes">Quiz on this chapter</a>
          </div>
        </div>
      )}
    </div>
  );
}
