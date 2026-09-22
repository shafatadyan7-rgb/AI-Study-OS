/**
 * Analytics aggregation. Every function here returns `null` (meaning NOT ENOUGH
 * DATA) rather than a zero or an invented figure when evidence is thin, because
 * a confident-looking 0% is more misleading to a student than an honest blank.
 */

export interface AttemptRow { answeredAt: Date; isCorrect: boolean; chapterId: string | null; }
export interface SessionRow { startedAt: Date; durationSeconds: number | null; }
export interface MistakeRow { kind: string; resolved: boolean; }

export const NOT_ENOUGH_DATA = null;

const MIN_ATTEMPTS_FOR_ACCURACY = 5;
const MIN_DAYS_FOR_TREND = 3;

export interface TrendPoint { date: string; value: number; }

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function accuracy(attempts: AttemptRow[]): number | null {
  if (attempts.length < MIN_ATTEMPTS_FOR_ACCURACY) return NOT_ENOUGH_DATA;
  return attempts.filter((a) => a.isCorrect).length / attempts.length;
}

/**
 * Accuracy change between the two halves of the window. Returns null unless both
 * halves independently clear the minimum — otherwise "improved 40%" could rest
 * on a single lucky answer.
 */
export function accuracyDelta(attempts: AttemptRow[]): number | null {
  if (attempts.length < MIN_ATTEMPTS_FOR_ACCURACY * 2) return NOT_ENOUGH_DATA;
  const sorted = [...attempts].sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime());
  const mid = Math.floor(sorted.length / 2);
  const first = accuracy(sorted.slice(0, mid));
  const second = accuracy(sorted.slice(mid));
  if (first === null || second === null) return NOT_ENOUGH_DATA;
  return second - first;
}

export function studyMinutesTrend(sessions: SessionRow[]): TrendPoint[] | null {
  const withDuration = sessions.filter((s) => s.durationSeconds && s.durationSeconds > 0);
  const days = new Set(withDuration.map((s) => dayKey(s.startedAt)));
  if (days.size < MIN_DAYS_FOR_TREND) return NOT_ENOUGH_DATA;

  const byDay = new Map<string, number>();
  for (const s of withDuration) {
    const k = dayKey(s.startedAt);
    byDay.set(k, (byDay.get(k) ?? 0) + (s.durationSeconds ?? 0) / 60);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value) }));
}

export function accuracyTrend(attempts: AttemptRow[]): TrendPoint[] | null {
  const byDay = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const k = dayKey(a.answeredAt);
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }
  const points = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({ date, value: accuracy(rows) }))
    .filter((p): p is TrendPoint => p.value !== null);

  return points.length < MIN_DAYS_FOR_TREND ? NOT_ENOUGH_DATA : points;
}

export function mistakeBreakdown(mistakes: MistakeRow[]): { kind: string; count: number }[] | null {
  if (mistakes.length === 0) return NOT_ENOUGH_DATA;
  const counts = new Map<string, number>();
  for (const m of mistakes) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Consecutive days with at least one session, counting back from today.
 * A gap ends the streak; "yesterday but not today" keeps it alive so the count
 * does not reset before the student has had a chance to study.
 */
export function currentStreak(sessions: SessionRow[], now = new Date()): number {
  const days = new Set(sessions.map((s) => dayKey(s.startedAt)));
  if (days.size === 0) return 0;

  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
