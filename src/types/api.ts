import { z } from 'zod';

/** Shared contracts. Both the route handlers and the client import these, so a
 *  response shape cannot drift between server and browser without a type error. */

export const ProcessingStatus = z.enum([
  'uploading', 'uploaded', 'validating', 'extracting', 'ocr_required',
  'ocr_processing', 'structuring', 'chunking', 'embedding', 'ready', 'failed',
]);
export type ProcessingStatus = z.infer<typeof ProcessingStatus>;

/** Human labels for the processing stages, shown verbatim in the UI. */
export const STAGE_LABEL: Record<ProcessingStatus, string> = {
  uploading: 'Uploading your textbook…', uploaded: 'Uploaded', validating: 'Validating the file…',
  extracting: 'Reading your textbook…', ocr_required: 'OCR required',
  ocr_processing: 'Running OCR on scanned pages…', structuring: 'Mapping chapters…',
  chunking: 'Organizing content…', embedding: 'Building the knowledge base…',
  ready: 'Ready', failed: 'Failed',
};

export const MasteryState = z.enum([
  'unseen', 'introduced', 'learning', 'practicing', 'developing', 'strong', 'mastered',
]);
export type MasteryState = z.infer<typeof MasteryState>;

export const Textbook = z.object({
  id: z.string().uuid(),
  title: z.string(),
  classLabel: z.string().nullable(),
  pageCount: z.number().int(),
  chapterCount: z.number().int(),
  status: ProcessingStatus,
  isDemo: z.boolean(),
  createdAt: z.string(),
});
export type Textbook = z.infer<typeof Textbook>;

export const TextbookStatus = z.object({
  status: ProcessingStatus,
  pageCount: z.number().int(),
  progress: z.number().int().min(0).max(100),
  stageDetail: z.string().nullable(),
  error: z.string().nullable(),
});
export type TextbookStatus = z.infer<typeof TextbookStatus>;

export const Chapter = z.object({
  id: z.string().uuid(),
  ordinal: z.number().int(),
  title: z.string(),
  startPage: z.number().int(),
  endPage: z.number().int().nullable(),
});
export type Chapter = z.infer<typeof Chapter>;

export const Page = z.object({
  pageNumber: z.number().int(),
  text: z.string(),
  extractedBy: z.enum(['text_layer', 'ocr']),
});
export type Page = z.infer<typeof Page>;

export const Citation = z.object({
  chunkId: z.string(),
  pageNumber: z.number().int(),
  chapterTitle: z.string().nullable(),
  textbookTitle: z.string(),
});
export type Citation = z.infer<typeof Citation>;

export const AskResponse = z.object({
  answer: z.string(),
  sources: z.array(Citation),
  insufficientEvidence: z.boolean(),
  sessionId: z.string().uuid(),
});
export type AskResponse = z.infer<typeof AskResponse>;

export const Scope = z.enum(['page', 'chapter', 'textbook', 'library']);
export type Scope = z.infer<typeof Scope>;

export const UploadTicket = z.object({
  textbookId: z.string().uuid(),
  jobId: z.string().uuid(),
  uploadUrl: z.string().url(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;

export const MasteryRow = z.object({
  chapterId: z.string().uuid(),
  chapterTitle: z.string(),
  state: MasteryState,
  /** null means NOT ENOUGH DATA. The UI must render that, never 0%. */
  score: z.number().nullable(),
  signalCount: z.number().int(),
  reason: z.string(),
});
export type MasteryRow = z.infer<typeof MasteryRow>;

export const CoachCard = z.object({
  headline: z.string(),
  activity: z.string(),
  minutes: z.number().int(),
  reason: z.string(),
}).nullable();
export type CoachCard = z.infer<typeof CoachCard>;

export const GraphResponse = z.object({
  nodes: z.array(z.object({
    id: z.string(), label: z.string(),
    kind: z.enum(['chapter', 'section', 'concept']),
    chapterId: z.string().nullable(),
    pages: z.array(z.number().int()),
  })),
  edges: z.array(z.object({
    from: z.string(), to: z.string(),
    kind: z.enum(['contains', 'co_occurs']),
    weight: z.number(),
  })),
});
export type GraphResponse = z.infer<typeof GraphResponse>;

export const FlashcardDue = z.object({
  id: z.string().uuid(),
  front: z.string(),
  back: z.string(),
  kind: z.string(),
  bucket: z.enum(['review_now', 'review_soon', 'strong']),
  nextReviewAt: z.string(),
});
export type FlashcardDue = z.infer<typeof FlashcardDue>;

export const QuizQuestion = z.object({
  id: z.string().uuid(),
  prompt: z.string(),
  options: z.array(z.object({ id: z.string().uuid(), text: z.string() })),
});
export type QuizQuestion = z.infer<typeof QuizQuestion>;

export const QuizSet = z.object({
  attemptId: z.string().uuid(),
  chapterTitle: z.string(),
  questions: z.array(QuizQuestion),
});
export type QuizSet = z.infer<typeof QuizSet>;

export const QuizAnswerResult = z.object({
  isCorrect: z.boolean(),
  correctAnswer: z.string().optional(),
  explanation: z.string().nullable().optional(),
});
export type QuizAnswerResult = z.infer<typeof QuizAnswerResult>;

export const MistakeRow = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  occurrences: z.number().int(),
  resolved: z.boolean(),
  lastOccurredAt: z.string(),
  question: z.string().nullable(),
  correctAnswer: z.string().nullable(),
  explanation: z.string().nullable(),
  chapterId: z.string().uuid().nullable(),
  chapterTitle: z.string().nullable(),
  textbookTitle: z.string().nullable(),
});
export type MistakeRow = z.infer<typeof MistakeRow>;

export const PlanItem = z.object({
  id: z.string().uuid(),
  scheduledFor: z.string(),
  activity: z.string(),
  minutes: z.number().int(),
  reason: z.string(),
  completed: z.boolean(),
  chapterId: z.string().uuid().nullable(),
  chapterTitle: z.string().nullable(),
});
export type PlanItem = z.infer<typeof PlanItem>;

export const PlannerResponse = z.object({
  plan: z.object({ id: z.string().uuid(), dailyMinutes: z.number().int() }).nullable(),
  items: z.array(PlanItem),
});
export type PlannerResponse = z.infer<typeof PlannerResponse>;

const NullableNumber = z.number().nullable();
export const TrendPoint = z.object({ date: z.string(), value: z.number() });

export const AnalyticsResponse = z.object({
  accuracy: NullableNumber,
  accuracyDelta: NullableNumber,
  accuracyTrend: z.array(TrendPoint).nullable(),
  studyMinutesTrend: z.array(TrendPoint).nullable(),
  mistakeBreakdown: z.array(z.object({ kind: z.string(), count: z.number() })).nullable(),
  streak: z.number().int(),
  questionsAttempted: z.number().int(),
});
export type AnalyticsResponse = z.infer<typeof AnalyticsResponse>;

export const NoteRow = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  mode: z.string(),
  pinned: z.boolean(),
  favorite: z.boolean(),
  aiGenerated: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  textbookTitle: z.string().nullable(),
  chapterTitle: z.string().nullable(),
});
export type NoteRow = z.infer<typeof NoteRow>;

export const AchievementRow = z.object({
  key: z.string(), title: z.string(), description: z.string(), unlocked: z.boolean(),
});
export const AchievementsResponse = z.object({
  achievements: z.array(AchievementRow), newlyUnlocked: z.array(z.string()),
});
export type AchievementsResponse = z.infer<typeof AchievementsResponse>;

export const SkillRow = z.object({
  categoryId: z.string().uuid(), name: z.string(),
  score: z.number().nullable(), eventCount: z.number().int(),
});
export type SkillRow = z.infer<typeof SkillRow>;

export const CareerRow = z.object({
  id: z.string().uuid(), name: z.string(), summary: z.string(),
  requiredSubjects: z.array(z.string()), relatedSkills: z.array(z.string()),
  educationPath: z.string().nullable(), sourceUrl: z.string().nullable(),
  sourceLabel: z.string().nullable(), stale: z.boolean(),
});
export type CareerRow = z.infer<typeof CareerRow>;

export const ProjectRow = z.object({
  id: z.string().uuid(), title: z.string(), description: z.string().nullable(),
  status: z.enum(['idea', 'planning', 'in_progress', 'completed']),
  deadline: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});
export type ProjectRow = z.infer<typeof ProjectRow>;

export const ScannerResult = z.object({
  parsed: z.object({
    text: z.string(), language: z.enum(['en', 'bn', 'mixed']),
    subject: z.string(), isNumerical: z.boolean(),
    knownValues: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  answer: z.string(),
  sources: z.array(z.object({ pageNumber: z.number().int(), textbookTitle: z.string(), chapterTitle: z.string().nullable() })),
  insufficientEvidence: z.boolean(),
});
export type ScannerResult = z.infer<typeof ScannerResult>;
