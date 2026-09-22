export type RevisionBucket = 'review_now' | 'review_soon' | 'strong';

export interface RevisionState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date;
}

/** 0 = Again, 3 = Hard, 5 = Easy. */
export type ReviewGrade = 0 | 3 | 5;

const MIN_EASE = 1.3;

/**
 * SM-2 with two deliberate modifications:
 *  - An exam date compresses intervals so nothing falls due after the exam.
 *  - "Again" resets repetitions but only partially penalises ease, so one bad
 *    day does not bury a card the student mostly knows.
 */
export function scheduleReview(
  prev: RevisionState,
  grade: ReviewGrade,
  opts: { now?: Date; examOn?: Date | null } = {},
): RevisionState {
  const now = opts.now ?? new Date();
  let { easeFactor, intervalDays, repetitions } = prev;

  if (grade === 0) {
    repetitions = 0;
    intervalDays = 0.007; // ~10 minutes: re-show within the same session
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
  } else {
    const q = grade;
    easeFactor = Math.max(MIN_EASE, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
  }

  // Compress the schedule so every card is seen at least once before the exam.
  if (opts.examOn) {
    const daysToExam = (opts.examOn.getTime() - now.getTime()) / 86_400_000;
    if (daysToExam > 0 && intervalDays > daysToExam / 2) {
      intervalDays = Math.max(0.5, daysToExam / 2);
    }
  }

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lastReviewedAt: now,
    nextReviewAt: new Date(now.getTime() + intervalDays * 86_400_000),
  };
}

/** Anything due within the current session counts as due now, not "soon". */
const SAME_SESSION_DAYS = 1 / 24; // one hour

export function bucketFor(state: RevisionState, now = new Date()): RevisionBucket {
  const dueInDays = (state.nextReviewAt.getTime() - now.getTime()) / 86_400_000;
  if (dueInDays <= SAME_SESSION_DAYS) return 'review_now';
  if (dueInDays <= 2) return 'review_soon';
  return 'strong';
}
