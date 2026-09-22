import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assertOwnership, AuthError } from '@/lib/auth/guard';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

const STUDENT_A = { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'a@x.test', role: 'student' as const, displayName: 'A', preferredLanguage: 'en' };
const STUDENT_B = { id: 'bbbbbbbb-0000-0000-0000-000000000002', email: 'b@x.test', role: 'student' as const, displayName: 'B', preferredLanguage: 'en' };
const TEACHER   = { id: 'cccccccc-0000-0000-0000-000000000003', email: 't@x.test', role: 'teacher' as const, displayName: 'T', preferredLanguage: 'en' };

describe('ownership guard', () => {
  it('allows a student to access their own record', () => {
    expect(() => assertOwnership(STUDENT_A, { ownerId: STUDENT_A.id })).not.toThrow();
  });

  it("refuses Student A access to Student B's record", () => {
    expect(() => assertOwnership(STUDENT_A, { ownerId: STUDENT_B.id })).toThrow(AuthError);
  });

  it("refuses a teacher access to a student's private record by default", () => {
    // Teachers get aggregate class analytics through separate queries, never
    // direct ownership of a student's AI conversations or textbooks.
    expect(() => assertOwnership(TEACHER, { ownerId: STUDENT_A.id })).toThrow(AuthError);
  });

  it('treats a missing record as forbidden, not as found', () => {
    // Returning 404 vs 403 differently would let an attacker enumerate which
    // textbook ids exist on the platform.
    expect(() => assertOwnership(STUDENT_A, null)).toThrow(AuthError);
    try { assertOwnership(STUDENT_A, null); } catch (e) {
      expect((e as AuthError).message).toBe('Not found or not yours.');
    }
    try { assertOwnership(STUDENT_A, { ownerId: STUDENT_B.id }); } catch (e) {
      // Identical message for both cases — no information leak.
      expect((e as AuthError).message).toBe('Not found or not yours.');
    }
  });
});

describe('password hashing', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('never stores the plaintext', async () => {
    const hash = await hashPassword('hunter2');
    expect(hash).not.toContain('hunter2');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('produces a different hash for the same password (unique salt)', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-real-hash')).toBe(false);
  });
});

/**
 * Structural guard against the most likely regression in this codebase: someone
 * adds a retrieval query and forgets the owner_id filter. This scans the SQL in
 * the retrieval layer rather than trusting review.
 */
describe('retrieval queries are owner-scoped', () => {
  it('every chunk query in the retrieval layer filters by owner_id', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/rag/retrieve.ts'), 'utf8');
    const fromChunks = src.split(/FROM\s+textbook_chunks/i).slice(1);
    expect(fromChunks.length).toBeGreaterThan(0);
    for (const branch of fromChunks) {
      const window = branch.slice(0, 400);
      expect(window).toMatch(/owner_id\s*=/);
    }
  });

  it('does not filter ownership only in TypeScript after the query', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/rag/retrieve.ts'), 'utf8');
    expect(src).not.toMatch(/\.filter\(\s*\(?\w+\)?\s*=>\s*\w+\.ownerId\s*===/);
  });
});

/**
 * Every student-owned table must carry an ownership column. A table without one
 * cannot be authorised correctly no matter how careful the route handler is.
 */
describe('schema ownership invariants', () => {
  const OWNED_TABLES = [
    'textbooks', 'textbookPages', 'textbookChapters', 'textbookChunks',
    'chunkEmbeddings', 'processingJobs', 'questions', 'quizAttempts',
    'quizAnswers', 'mistakes', 'masteryRecords', 'flashcards',
    'revisionItems', 'notes', 'studySessions', 'studyPlans',
    'studyPlanItems', 'aiSessions', 'aiMessages',
  ];

  const schema = readFileSync(join(process.cwd(), 'src/db/schema.ts'), 'utf8');

  for (const table of OWNED_TABLES) {
    it(`${table} declares an ownerId column`, () => {
      const start = schema.indexOf(`export const ${table} = pgTable`);
      expect(start, `${table} not found in schema`).toBeGreaterThan(-1);
      const body = schema.slice(start, schema.indexOf('});', start));
      expect(body).toMatch(/ownerId: uuid\('owner_id'\)/);
      expect(body).toMatch(/\.notNull\(\)/);
    });
  }
});

/**
 * No route handler may reach the database without establishing identity first.
 */
describe('API routes authenticate before querying', () => {
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (entry === 'route.ts') out.push(full);
    }
    return out;
  }

  const routes = walk(join(process.cwd(), 'src/app/api'));

  it('finds route handlers to check', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  for (const route of routes) {
    const rel = route.split('src/app/api/')[1];
    it(`${rel} calls requireUser or is an auth entry point`, () => {
      const src = readFileSync(route, 'utf8');
      // login/signup have no session yet by definition; logout must work even with
      // an expired or missing cookie, so all three are legitimate auth entry points.
      const isAuthEntry = /api\/auth\/(login|signup|logout)/.test(route);
      if (isAuthEntry) return;
      expect(src).toMatch(/requireUser|requireRole/);
    });
  }
});
