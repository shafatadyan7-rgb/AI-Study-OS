import type { MasteryState } from './mastery';

export interface PlannerChapter {
  chapterId: string;
  textbookId: string;
  title: string;
  subject: string;
  masteryState: MasteryState;
  masteryScore: number | null;
  unresolvedMistakes: number;
  revisionDueCount: number;
  pageCount: number;
}

export interface PlannerInput {
  chapters: PlannerChapter[];
  dailyMinutes: number;
  examOn: Date | null;
  horizonDays: number;
  now?: Date;
  /** Items the student did not complete; rescheduled, never punished. */
  carriedOver?: { chapterId: string; activity: PlanActivity; minutes: number }[];
}

export type PlanActivity = 'revise' | 'practice' | 'quiz' | 'mistake_practice' | 'mock_exam';

export interface PlanItem {
  scheduledFor: Date;
  chapterId: string;
  textbookId: string;
  activity: PlanActivity;
  minutes: number;
  reason: string;
}

const MASTERY_URGENCY: Record<MasteryState, number> = {
  unseen: 0.55, introduced: 0.7, learning: 1.0, practicing: 0.85,
  developing: 0.6, strong: 0.3, mastered: 0.1,
};

function urgency(ch: PlannerChapter, daysToExam: number | null): number {
  let u = MASTERY_URGENCY[ch.masteryState];
  u += Math.min(0.5, ch.unresolvedMistakes * 0.08);
  u += Math.min(0.35, ch.revisionDueCount * 0.05);
  // Exam proximity amplifies everything, but does not reorder within a day.
  if (daysToExam !== null && daysToExam > 0) u *= 1 + Math.max(0, (30 - daysToExam) / 30);
  return u;
}

function activityFor(ch: PlannerChapter): { activity: PlanActivity; minutes: number; why: string } {
  if (ch.unresolvedMistakes >= 2) {
    return {
      activity: 'mistake_practice',
      minutes: 25,
      why: `you have ${ch.unresolvedMistakes} unresolved mistakes in this chapter`,
    };
  }
  if (ch.revisionDueCount > 0) {
    return {
      activity: 'revise',
      minutes: 20,
      why: `${ch.revisionDueCount} item(s) are due for revision`,
    };
  }
  if (ch.masteryState === 'unseen' || ch.masteryState === 'introduced') {
    return { activity: 'practice', minutes: 30, why: 'you have not built up evidence in this chapter yet' };
  }
  if (ch.masteryState === 'learning' || ch.masteryState === 'practicing') {
    return {
      activity: 'practice',
      minutes: 25,
      why: ch.masteryScore === null
        ? 'this chapter does not have enough performance data yet'
        : `your accuracy here is ${Math.round(ch.masteryScore * 100)}%`,
    };
  }
  return { activity: 'quiz', minutes: 15, why: 'a short check keeps a strong chapter from decaying' };
}

/**
 * Generate an adaptive study plan from real mastery, mistake and revision data.
 *
 * Missed work is carried forward at the front of the next day rather than
 * penalised — a plan that shames the student gets abandoned.
 */
export function generatePlan(input: PlannerInput): PlanItem[] {
  const now = input.now ?? new Date();
  const daysToExam = input.examOn
    ? Math.ceil((input.examOn.getTime() - now.getTime()) / 86_400_000)
    : null;

  const ranked = [...input.chapters].sort((a, b) => urgency(b, daysToExam) - urgency(a, daysToExam));
  if (ranked.length === 0) return [];

  const items: PlanItem[] = [];
  const horizon = daysToExam !== null ? Math.min(input.horizonDays, Math.max(daysToExam, 1)) : input.horizonDays;
  let cursor = 0;

  const carried = [...(input.carriedOver ?? [])];

  for (let day = 0; day < horizon; day++) {
    const date = new Date(now.getTime() + day * 86_400_000);
    let remaining = input.dailyMinutes;

    // Carried-over work goes first, at full value, with a neutral reason.
    while (carried.length > 0 && remaining >= carried[0]!.minutes) {
      const c = carried.shift()!;
      const ch = input.chapters.find((x) => x.chapterId === c.chapterId);
      if (!ch) continue;
      items.push({
        scheduledFor: date,
        chapterId: ch.chapterId,
        textbookId: ch.textbookId,
        activity: c.activity,
        minutes: c.minutes,
        reason: 'Rescheduled from an earlier day so nothing is lost.',
      });
      remaining -= c.minutes;
    }

    // A mock exam in the final week, once, when an exam is actually scheduled.
    if (daysToExam !== null && daysToExam - day === 3 && remaining >= 45) {
      const top = ranked[0]!;
      items.push({
        scheduledFor: date,
        chapterId: top.chapterId,
        textbookId: top.textbookId,
        activity: 'mock_exam',
        minutes: 45,
        reason: `Recommended because your exam is in ${daysToExam - day} days and a full run-through surfaces gaps a chapter quiz misses.`,
      });
      remaining -= 45;
    }

    let guard = 0;
    while (remaining >= 15 && guard < ranked.length * 2) {
      const ch = ranked[cursor % ranked.length]!;
      cursor++;
      guard++;
      const { activity, minutes, why } = activityFor(ch);
      if (minutes > remaining) continue;
      items.push({
        scheduledFor: date,
        chapterId: ch.chapterId,
        textbookId: ch.textbookId,
        activity,
        minutes,
        reason: `Recommended because ${why}.`,
      });
      remaining -= minutes;
    }
  }

  return items;
}
