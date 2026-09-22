import type { AuthUser } from '@/lib/auth/session';

/**
 * What a non-owner may ever see about a student.
 *
 * This is an allowlist, not a denylist. A denylist means every new table added
 * to the schema is exposed to teachers and parents by default until someone
 * remembers to exclude it — which is exactly the mistake that leaks a student's
 * private AI conversations.
 */
export const TEACHER_VISIBLE_FIELDS = [
  'displayName', 'accuracy', 'questionsAttempted', 'chapterProgress',
  'masteryState', 'assignmentCompletion', 'commonMistakeKinds',
] as const;

export const PARENT_VISIBLE_FIELDS = [
  'displayName', 'studyMinutes', 'streak', 'goalProgress',
  'upcomingExams', 'subjectPerformance', 'consistency',
] as const;

/** Never visible to anyone but the owning student, under any role. */
export const ALWAYS_PRIVATE = [
  'aiMessages', 'aiSessions', 'aiSources', 'notes', 'textbookPages',
  'textbookChunks', 'flashcards', 'passwordHash', 'email',
] as const;

export type TeacherVisibleField = (typeof TEACHER_VISIBLE_FIELDS)[number];
export type ParentVisibleField = (typeof PARENT_VISIBLE_FIELDS)[number];

export function visibleFieldsFor(role: AuthUser['role']): readonly string[] {
  switch (role) {
    case 'teacher': return TEACHER_VISIBLE_FIELDS;
    case 'parent': return PARENT_VISIBLE_FIELDS;
    case 'admin': return []; // admins manage the system, not student learning content
    case 'student': return [];
  }
}

/**
 * Strip a student record down to what the viewing role may see. Applied at the
 * serialisation boundary so a handler cannot accidentally over-return by
 * forgetting to select fewer columns.
 */
export function projectForRole<T extends Record<string, unknown>>(
  record: T,
  role: AuthUser['role'],
): Partial<T> {
  const allowed = new Set(visibleFieldsFor(role));
  const out: Partial<T> = {};
  for (const key of Object.keys(record) as (keyof T & string)[]) {
    if (ALWAYS_PRIVATE.includes(key as never)) continue;
    if (allowed.has(key)) out[key as keyof T] = record[key];
  }
  return out;
}

/**
 * Aggregate class statistics must not become a way to identify one student's
 * performance. With too few students, "class average" is that student.
 */
export const MIN_COHORT_FOR_AGGREGATE = 5;

export function canReportAggregate(cohortSize: number): boolean {
  return cohortSize >= MIN_COHORT_FOR_AGGREGATE;
}
