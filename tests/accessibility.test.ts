import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static accessibility checks: these catch structural regressions (a modal
 * missing aria-modal, an icon-only button with no accessible name) that are
 * cheap to verify by source inspection. They are NOT a substitute for manual
 * testing with a real screen reader — see the note in README.md and
 * PRODUCTION_CHECKLIST.md. No automated suite can confirm what NVDA or
 * VoiceOver actually announces.
 */

function readAllTsx(dir: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...readAllTsx(full));
    else if (entry.endsWith('.tsx')) out.push({ path: full, content: readFileSync(full, 'utf8') });
  }
  return out;
}

const files = readAllTsx(join(process.cwd(), 'src'));

describe('dialogs declare modal semantics', () => {
  it('every role="dialog" also declares aria-modal', () => {
    for (const f of files) {
      if (!f.content.includes('role="dialog"')) continue;
      expect(f.content, `${f.path} has role="dialog" but no aria-modal`).toMatch(/aria-modal/);
    }
  });

  it('every role="dialog" also declares an accessible name', () => {
    for (const f of files) {
      if (!f.content.includes('role="dialog"')) continue;
      const hasName = /aria-label(led)?[a-zA-Z-]*=/.test(f.content);
      expect(hasName, `${f.path} has role="dialog" but no aria-label(ledby)`).toBe(true);
    }
  });
});

describe('form inputs have associated labels', () => {
  it('every <input id=...> has a matching htmlFor or aria-label in the same file', () => {
    for (const f of files) {
      const ids = [...f.content.matchAll(/<input[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
      for (const id of ids) {
        const hasFor = f.content.includes(`htmlFor="${id}"`);
        const hasAriaLabelledby = f.content.includes(`aria-labelledby="${id}"`) || f.content.includes(`aria-labelledby={\`${id}`);
        const inputTagHasAriaLabel = new RegExp(`<input[^>]*id="${id}"[^>]*aria-label=`).test(f.content)
          || new RegExp(`aria-label=[^>]*<input[^>]*id="${id}"`).test(f.content);
        expect(hasFor || hasAriaLabelledby || inputTagHasAriaLabel, `${f.path}: input#${id} has no associated label`).toBe(true);
      }
    }
  });
});

describe('interactive icon-only controls have accessible names', () => {
  it('emoji-only close/toggle buttons are paired with an aria-label', () => {
    for (const f of files) {
      // A button whose visible text is only an emoji/symbol (no letters) must
      // carry aria-label so it has a name for assistive tech.
      const matches = [...f.content.matchAll(/<button([^>]*)>\s*([^\w\s<{][^<]{0,3})\s*<\/button>/g)];
      for (const m of matches) {
        const attrs = m[1] ?? '';
        if (attrs.includes('aria-label')) continue;
        // Allow icons that are purely decorative (aria-hidden nested span) —
        // those are covered by surrounding visible text instead.
        if (attrs.includes('aria-hidden')) continue;
        expect(attrs, `${f.path}: icon-only button "${m[2]}" has no aria-label`).toMatch(/aria-label/);
      }
    }
  });
});

describe('reduced motion is respected globally', () => {
  it('globals.css defines a prefers-reduced-motion override', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('skip link is present for keyboard users', () => {
  it('root layout renders a skip-to-content link targeting #main-content', () => {
    const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/#main-content/);
    const shell = readFileSync(join(process.cwd(), 'src/components/AppShell.tsx'), 'utf8');
    expect(shell).toMatch(/id="main-content"/);
  });
});
