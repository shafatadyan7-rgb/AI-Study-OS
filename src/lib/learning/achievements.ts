export type AchievementKey =
  | 'first_textbook' | 'first_quiz' | 'first_perfect_quiz' | 'first_revision'
  | 'ten_questions' | 'fifty_questions' | 'hundred_questions'
  | 'first_mistake_resolved' | 'streak_7' | 'streak_30' | 'chapter_mastered';

export interface AchievementDefinition {
  key: AchievementKey;
  title: string;
  description: string;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { key: 'first_textbook', title: 'First Textbook', description: 'Uploaded your first textbook.' },
  { key: 'first_quiz', title: 'First Quiz', description: 'Completed your first quiz.' },
  { key: 'first_perfect_quiz', title: 'Perfect Quiz', description: 'Scored 100% on a quiz of at least 5 questions.' },
  { key: 'first_revision', title: 'First Revision', description: 'Completed your first flashcard revision.' },
  { key: 'ten_questions', title: '10 Questions', description: 'Answered 10 questions in total.' },
  { key: 'fifty_questions', title: '50 Questions', description: 'Answered 50 questions in total.' },
  { key: 'hundred_questions', title: '100 Questions', description: 'Answered 100 questions in total.' },
  { key: 'first_mistake_resolved', title: 'First Mistake Resolved', description: 'Corrected a mistake you had made before.' },
  { key: 'streak_7', title: '7-Day Streak', description: 'Studied 7 days in a row.' },
  { key: 'streak_30', title: '30-Day Streak', description: 'Studied 30 days in a row.' },
  { key: 'chapter_mastered', title: 'Chapter Mastered', description: 'Reached MASTERED on a chapter.' },
];

export interface AchievementSignals {
  textbookCount: number;
  finishedQuizCount: number;
  hadAPerfectQuizOf5Plus: boolean;
  flashcardReviewCount: number;
  totalQuestionsAnswered: number;
  hasResolvedMistake: boolean;
  currentStreak: number;
  hasMasteredChapter: boolean;
}

/**
 * Pure decision function: given real, already-queried signals, which
 * achievements should be unlocked right now. The caller is responsible for
 * diffing this against what is already stored and inserting only the new
 * ones — this function never writes anything and never invents a signal.
 */
export function evaluateAchievements(signals: AchievementSignals): AchievementKey[] {
  const unlocked: AchievementKey[] = [];

  if (signals.textbookCount >= 1) unlocked.push('first_textbook');
  if (signals.finishedQuizCount >= 1) unlocked.push('first_quiz');
  if (signals.hadAPerfectQuizOf5Plus) unlocked.push('first_perfect_quiz');
  if (signals.flashcardReviewCount >= 1) unlocked.push('first_revision');
  if (signals.totalQuestionsAnswered >= 10) unlocked.push('ten_questions');
  if (signals.totalQuestionsAnswered >= 50) unlocked.push('fifty_questions');
  if (signals.totalQuestionsAnswered >= 100) unlocked.push('hundred_questions');
  if (signals.hasResolvedMistake) unlocked.push('first_mistake_resolved');
  if (signals.currentStreak >= 7) unlocked.push('streak_7');
  if (signals.currentStreak >= 30) unlocked.push('streak_30');
  if (signals.hasMasteredChapter) unlocked.push('chapter_mastered');

  return unlocked;
}

/* ------------------------------- skills ------------------------------- */

export interface SkillEvent { weight: number; occurredAt: Date; }

export interface SkillResult {
  score: number | null; // null = NOT ENOUGH DATA
  eventCount: number;
}

const MIN_EVENTS_FOR_SKILL = 5;
const SKILL_HALF_LIFE_DAYS = 30;

/**
 * A skill score from real activity events only. Unlike quiz mastery, skill
 * events are typically all "positive evidence of engagement" (a task done, a
 * question attempted) rather than correct/incorrect, so the score here is a
 * normalised, recency-weighted activity level, not an accuracy percentage —
 * conflating the two would overstate what the number actually means.
 */
export function computeSkillScore(events: SkillEvent[], now = new Date()): SkillResult {
  if (events.length < MIN_EVENTS_FOR_SKILL) {
    return { score: null, eventCount: events.length };
  }
  let weighted = 0;
  for (const e of events) {
    const days = (now.getTime() - e.occurredAt.getTime()) / 86_400_000;
    weighted += e.weight * Math.pow(0.5, Math.max(days, 0) / SKILL_HALF_LIFE_DAYS);
  }
  // Normalise against a saturating scale rather than an unbounded sum, so the
  // score is comparable across skills with very different event volumes.
  const score = 1 - Math.exp(-weighted / 20);
  return { score: Math.min(score, 0.99), eventCount: events.length };
}
