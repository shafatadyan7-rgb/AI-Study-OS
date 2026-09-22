'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Command { label: string; href: string; keywords: string; }

const COMMANDS: Command[] = [
  { label: 'Ask the AI tutor', href: '/tutor', keywords: 'ask ai tutor question chat' },
  { label: 'Open a textbook', href: '/textbooks', keywords: 'textbook book open library pdf' },
  { label: 'New note', href: '/notes/new', keywords: 'note write new' },
  { label: 'Start a quiz', href: '/quizzes/new', keywords: 'quiz test practice mcq' },
  { label: 'Start an exam', href: '/exams/new', keywords: 'exam mock full test' },
  { label: 'Review flashcards', href: '/flashcards', keywords: 'flashcard card review' },
  { label: 'Revision due', href: '/revision', keywords: 'revision due spaced repetition' },
  { label: 'Focus mode', href: '/focus', keywords: 'focus pomodoro timer study session' },
  { label: 'Study planner', href: '/planner', keywords: 'plan planner schedule study plan' },
  { label: 'Analytics', href: '/analytics', keywords: 'analytics progress stats charts' },
  { label: 'Knowledge map', href: '/knowledge', keywords: 'knowledge graph map concepts' },
  { label: 'Mistake Lab', href: '/mistakes', keywords: 'mistakes wrong errors weak' },
  { label: 'Notes', href: '/notes', keywords: 'notes write summary' },
  { label: 'Question scanner', href: '/scanner', keywords: 'scanner scan photo question ocr' },
  { label: 'Projects', href: '/projects', keywords: 'project research' },
  { label: 'Skills', href: '/skills', keywords: 'skills ability' },
  { label: 'Career explorer', href: '/career', keywords: 'career job path' },
  { label: 'Achievements', href: '/achievements', keywords: 'achievements badges streak' },
];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q),
    );
  }, [query]);

  useEffect(() => { setSelected(0); }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') {
      const target = results[selected];
      if (target) { router.push(target.href); onClose(); }
    }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          aria-label="Search commands"
          aria-controls="palette-results"
          role="combobox"
          aria-expanded="true"
        />
        <ul id="palette-results" role="listbox">
          {results.length === 0 && <li className="palette-empty">No matching command.</li>}
          {results.map((c, i) => (
            <li
              key={c.href}
              role="option"
              aria-selected={i === selected}
              className={i === selected ? 'selected' : ''}
              onMouseEnter={() => setSelected(i)}
              onClick={() => { router.push(c.href); onClose(); }}
            >
              {c.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
