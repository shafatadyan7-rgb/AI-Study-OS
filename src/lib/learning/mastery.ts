export type MasteryState =
  | 'unseen' | 'introduced' | 'learning' | 'practicing' | 'developing' | 'strong' | 'mastered';

export interface AttemptSignal {
  correct: boolean;
  answeredAt: Date;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Application/critical-thinking questions are stronger evidence than recall. */
  questionType: string;
  usedHint?: boolean;
}

export interface MasteryInput {
  attempts: AttemptSignal[];
  revisionSuccesses: number;
  unresolvedMistakes: number;
  now?: Date;
}

export interface MasteryResult {
  state: MasteryState;
  /** null means NOT ENOUGH DATA — callers must render that, not a zero. */
  score: number | null;
  signalCount: number;
  reason: string;
}

const MIN_ATTEMPTS = 4;
const MASTERY_MIN_ATTEMPTS = 8;
const MASTERY_MIN_DAYS_SPAN = 3;
const HALF_LIFE_DAYS = 21;

const APPLICATION_TYPES = new Set(['application', 'scenario', 'critical_thinking', 'numerical', 'viva']);

const DIFFICULTY_WEIGHT: Record<AttemptSignal['difficulty'], number> = {
  easy: 0.7, medium: 1.0, hard: 1.35,
};

function recencyWeight(answeredAt: Date, now: Date): number {
  const days = (now.getTime() - answeredAt.getTime()) / 86_400_000;
  return Math.pow(0.5, Math.max(days, 0) / HALF_LIFE_DAYS);
}

/**
 * Compute mastery from multiple real signals.
 *
 * Deliberate properties:
 * - A single correct answer can never produce 'mastered'.
 * - Thin evidence returns score: null so the UI shows NOT ENOUGH DATA.
 * - Recent performance outweighs old performance, but old performance still
 *   counts, so one bad day does not erase a month of work.
 * - Unresolved mistakes actively suppress the ceiling.
 */
export function computeMastery(input: MasteryInput): MasteryResult {
  const now = input.now ?? new Date();
  const attempts = [...input.attempts].sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime());

  if (attempts.length === 0) {
    return { state: 'unseen', score: null, signalCount: 0, reason: 'No attempts recorded yet.' };
  }

  if (attempts.length < MIN_ATTEMPTS) {
    return {
      state: 'introduced',
      score: null,
      signalCount: attempts.length,
      reason: `Only ${attempts.length} attempt(s) recorded — at least ${MIN_ATTEMPTS} are needed before a score is meaningful.`,
    };
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const a of attempts) {
    const w =
      recencyWeight(a.answeredAt, now) *
      DIFFICULTY_WEIGHT[a.difficulty] *
      (APPLICATION_TYPES.has(a.questionType) ? 1.25 : 1.0);
    totalWeight += w;
    if (a.correct) weighted += w * (a.usedHint ? 0.6 : 1.0);
  }

  let score = totalWeight > 0 ? weighted / totalWeight : 0;

  // Revision recall is independent evidence of retention.
  if (input.revisionSuccesses > 0) {
    score = Math.min(1, score + Math.min(0.06, input.revisionSuccesses * 0.015));
  }
  // Unresolved mistakes cap how high the score can legitimately go.
  if (input.unresolvedMistakes > 0) {
    score = Math.min(score, 1 - Math.min(0.35, input.unresolvedMistakes * 0.07));
  }

  const spanDays =
    (attempts[attempts.length - 1]!.answeredAt.getTime() - attempts[0]!.answeredAt.getTime()) / 86_400_000;

  let state: MasteryState;
  let reason: string;

  if (
    score >= 0.9 &&
    attempts.length >= MASTERY_MIN_ATTEMPTS &&
    spanDays >= MASTERY_MIN_DAYS_SPAN &&
    input.unresolvedMistakes === 0
  ) {
    state = 'mastered';
    reason = `${attempts.length} attempts across ${Math.round(spanDays)} days at ${Math.round(score * 100)}% weighted accuracy, with no unresolved mistakes.`;
  } else if (score >= 0.8) {
    state = 'strong';
    reason = score >= 0.9
      ? 'Accuracy is at mastery level, but mastery also requires sustained performance over several days with no unresolved mistakes.'
      : `Weighted accuracy is ${Math.round(score * 100)}%.`;
  } else if (score >= 0.65) {
    state = 'developing';
    reason = `Weighted accuracy is ${Math.round(score * 100)}% — close, but not yet consistent.`;
  } else if (score >= 0.45) {
    state = 'practicing';
    reason = `Weighted accuracy is ${Math.round(score * 100)}%. More practice needed.`;
  } else {
    state = 'learning';
    reason = `Weighted accuracy is ${Math.round(score * 100)}%. This concept needs re-teaching, not more testing.`;
  }

  return { state, score, signalCount: attempts.length, reason };
}
