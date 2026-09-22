import type { PlannerChapter } from './planner';

export interface CoachRecommendation {
  headline: string;
  activity: string;
  minutes: number;
  reason: string;
}

/**
 * Daily recommendation derived strictly from stored signals. Returns null when
 * the student has no data yet — the dashboard shows an onboarding prompt rather
 * than a fabricated suggestion.
 */
export function dailyRecommendation(
  chapters: PlannerChapter[],
  opts: { examOn?: Date | null; now?: Date } = {},
): CoachRecommendation | null {
  if (chapters.length === 0) return null;

  const withData = chapters.filter(
    (c) => c.masteryScore !== null || c.unresolvedMistakes > 0 || c.revisionDueCount > 0,
  );
  if (withData.length === 0) return null;

  const now = opts.now ?? new Date();
  const daysToExam = opts.examOn
    ? Math.ceil((opts.examOn.getTime() - now.getTime()) / 86_400_000)
    : null;

  const scored = withData
    .map((c) => ({
      c,
      priority:
        (c.unresolvedMistakes * 0.4) +
        (c.revisionDueCount * 0.25) +
        (c.masteryScore === null ? 0.3 : (1 - c.masteryScore)),
    }))
    .sort((a, b) => b.priority - a.priority);

  const top = scored[0]!.c;
  const examClause = daysToExam !== null && daysToExam <= 30
    ? ` and your exam is in ${daysToExam} day${daysToExam === 1 ? '' : 's'}`
    : '';

  if (top.unresolvedMistakes > 0) {
    return {
      headline: `Practise your mistakes in ${top.title}`,
      activity: 'mistake_practice',
      minutes: 25,
      reason: `Recommended because you have ${top.unresolvedMistakes} unresolved mistake${top.unresolvedMistakes === 1 ? '' : 's'} in ${top.title}${examClause}.`,
    };
  }
  if (top.revisionDueCount > 0) {
    return {
      headline: `Revise ${top.title}`,
      activity: 'revise',
      minutes: 20,
      reason: `Recommended because ${top.revisionDueCount} item${top.revisionDueCount === 1 ? ' is' : 's are'} due for revision in ${top.title}${examClause}.`,
    };
  }
  return {
    headline: `Practise ${top.title}`,
    activity: 'practice',
    minutes: 25,
    reason: top.masteryScore === null
      ? `Recommended because ${top.title} does not have enough performance data yet${examClause}.`
      : `Recommended because ${top.title} is currently your weakest chapter at ${Math.round(top.masteryScore * 100)}% accuracy${examClause}.`,
  };
}
