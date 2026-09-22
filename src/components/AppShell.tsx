'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AuthUser } from '@/lib/auth/session';
import { CommandPalette } from './CommandPalette';

const NAV_GROUPS: { label: string; items: { href: string; icon: string; label: string }[] }[] = [
  { label: '', items: [{ href: '/dashboard', icon: '◎', label: 'Overview' }] },
  { label: 'Learn', items: [
    { href: '/textbooks', icon: '▤', label: 'My Textbooks' },
    { href: '/tutor', icon: '✦', label: 'AI Tutor' },
    { href: '/notes', icon: '▦', label: 'Notes' },
  ]},
  { label: 'Practice', items: [
    { href: '/flashcards', icon: '▥', label: 'Flashcards' },
    { href: '/quizzes', icon: '◈', label: 'Quizzes' },
    { href: '/mistakes', icon: '▲', label: 'Mistake Lab' },
    { href: '/revision', icon: '↻', label: 'Revision' },
  ]},
  { label: 'Track', items: [
    { href: '/analytics', icon: '◔', label: 'Analytics' },
    { href: '/knowledge', icon: '⬡', label: 'Knowledge Map' },
    { href: '/planner', icon: '▣', label: 'Planner' },
    { href: '/focus', icon: '◐', label: 'Focus Mode' },
    { href: '/scanner', icon: '⌗', label: 'Question Scanner' },
  ]},
  { label: 'Grow', items: [
    { href: '/projects', icon: '◫', label: 'Projects' },
    { href: '/skills', icon: '◭', label: 'Skills' },
    { href: '/career', icon: '◱', label: 'Career' },
    { href: '/achievements', icon: '◆', label: 'Achievements' },
  ]},
];

const ROLE_NAV: Record<string, { href: string; icon: string; label: string }[]> = {
  teacher: [{ href: '/teacher', icon: '◇', label: 'My Classes' }],
  parent: [{ href: '/parent', icon: '◇', label: 'Progress' }],
  admin: [{ href: '/admin', icon: '◇', label: 'Admin' }],
};

export function AppShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close the mobile drawer on navigation so it never traps focus.
  useEffect(() => { setNavOpen(false); }, [pathname]);

  const groups = [...NAV_GROUPS];
  const roleItems = ROLE_NAV[user.role];
  if (roleItems) groups.push({ label: 'Role', items: roleItems });

  return (
    <div className="shell">
      <button
        className="nav-toggle"
        aria-expanded={navOpen}
        aria-controls="primary-nav"
        onClick={() => setNavOpen((v) => !v)}
      >
        <span className="sr-only">{navOpen ? 'Close navigation' : 'Open navigation'}</span>
        <span aria-hidden="true">☰</span>
      </button>

      <nav id="primary-nav" className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Primary">
        <div className="brand">
          <span className="orb" aria-hidden="true" />
          <span className="brand-name">
            AI StudyOS
            <small>Textbook Intelligence</small>
          </span>
        </div>

        {groups.map((group) => (
          <div className="navgroup" key={group.label || 'root'}>
            {group.label && <h2 className="navlabel">{group.label}</h2>}
            <ul>
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`navitem ${active ? 'active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className="ic" aria-hidden="true">{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="side-foot">
          <button className="palette-hint" onClick={() => setPaletteOpen(true)}>
            Search <kbd>⌘K</kbd>
          </button>
          <Link href="/settings" className="navitem">
            <span className="ic" aria-hidden="true">⚙</span>{user.displayName}
          </Link>
        </div>
      </nav>

      <main className="main" id="main-content">{children}</main>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
