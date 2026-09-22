import {
  pgTable, uuid, text, integer, real, boolean, timestamp, jsonb,
  pgEnum, index, uniqueIndex, primaryKey, customType,
} from 'drizzle-orm/pg-core';

/**
 * pgvector column type. Dimension must match EMBEDDING_DIM in .env and the
 * dimension baked into the migration's index definition.
 */
export const vector = (dim: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType: () => `vector(${dim})`,
    toDriver: (v: number[]) => `[${v.join(',')}]`,
    fromDriver: (v: string) => JSON.parse(v) as number[],
  });

export const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 1024);
const embeddingVector = vector(EMBEDDING_DIM);

/* ============================ enums ============================ */

export const roleEnum = pgEnum('role', ['student', 'teacher', 'parent', 'admin']);

export const processingStatusEnum = pgEnum('processing_status', [
  'uploading', 'uploaded', 'validating', 'extracting', 'ocr_required',
  'ocr_processing', 'structuring', 'chunking', 'embedding', 'ready', 'failed',
]);

export const masteryStateEnum = pgEnum('mastery_state', [
  'unseen', 'introduced', 'learning', 'practicing', 'developing', 'strong', 'mastered',
]);

export const mistakeKindEnum = pgEnum('mistake_kind', [
  'conceptual', 'calculation', 'formula', 'careless', 'misreading', 'memory',
  'reasoning', 'grammar', 'vocabulary', 'unit', 'sign', 'diagram', 'unclassified',
]);

export const questionTypeEnum = pgEnum('question_type', [
  'mcq', 'true_false', 'fill_blank', 'matching', 'short_answer', 'numerical',
  'conceptual', 'application', 'scenario', 'critical_thinking', 'written', 'viva',
]);

export const revisionBucketEnum = pgEnum('revision_bucket', ['review_now', 'review_soon', 'strong']);

export const projectStatusEnum = pgEnum('project_status', ['idea', 'planning', 'in_progress', 'completed']);

export const achievementKeyEnum = pgEnum('achievement_key', [
  'first_textbook', 'first_quiz', 'first_perfect_quiz', 'first_revision',
  'ten_questions', 'fifty_questions', 'hundred_questions',
  'first_mistake_resolved', 'streak_7', 'streak_30', 'chapter_mastered',
]);

/* ============================ identity ============================ */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('student'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
}));

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  preferredLanguage: text('preferred_language').notNull().default('en'), // en | bn | mixed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const studentProfiles = pgTable('student_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  curriculumVersionId: uuid('curriculum_version_id').references(() => curriculumVersions.id),
  classLabel: text('class_label'),
  groupLabel: text('group_label'),
  dailyMinutesAvailable: integer('daily_minutes_available'),
  studyGoal: text('study_goal'),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),               // opaque random token id
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index('sessions_user_idx').on(t.userId) }));

/* ============================ curriculum (data-driven, never hardcoded) ============================ */

export const curricula = pgTable('curricula', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),              // e.g. "NCTB"
  country: text('country').notNull().default('BD'),
});

export const curriculumVersions = pgTable('curriculum_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  curriculumId: uuid('curriculum_id').notNull().references(() => curricula.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),            // e.g. "2023 revision"
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
});

export const subjects = pgTable('subjects', {
  id: uuid('id').primaryKey().defaultRandom(),
  curriculumVersionId: uuid('curriculum_version_id').references(() => curriculumVersions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  nameBn: text('name_bn'),
  classLabel: text('class_label'),
  engine: text('engine'),                    // math | physics | chemistry | biology | bangla | english | ict
});

export const concepts = pgTable('concepts', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  nameBn: text('name_bn'),
}, (t) => ({ subjectIdx: index('concepts_subject_idx').on(t.subjectId) }));

/* ============================ textbooks ============================ */

export const textbooks = pgTable('textbooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  subjectId: uuid('subject_id').references(() => subjects.id),
  classLabel: text('class_label'),
  storageKey: text('storage_key').notNull(),   // S3 object key; file never served directly
  byteSize: integer('byte_size').notNull().default(0),
  pageCount: integer('page_count').notNull().default(0),
  status: processingStatusEnum('status').notNull().default('uploading'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerIdx: index('textbooks_owner_idx').on(t.ownerId),
}));

export const textbookPages = pgTable('textbook_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  textbookId: uuid('textbook_id').notNull().references(() => textbooks.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pageNumber: integer('page_number').notNull(),
  text: text('text').notNull().default(''),
  extractedBy: text('extracted_by').notNull().default('text_layer'), // text_layer | ocr
  charCount: integer('char_count').notNull().default(0),
}, (t) => ({
  bookPageIdx: uniqueIndex('pages_book_page_idx').on(t.textbookId, t.pageNumber),
  ownerIdx: index('pages_owner_idx').on(t.ownerId),
}));

export const textbookChapters = pgTable('textbook_chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  textbookId: uuid('textbook_id').notNull().references(() => textbooks.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ordinal: integer('ordinal').notNull(),
  title: text('title').notNull(),
  startPage: integer('start_page').notNull(),
  endPage: integer('end_page'),
  detectedBy: text('detected_by').notNull().default('heuristic'), // heuristic | llm | manual
}, (t) => ({ bookIdx: index('chapters_book_idx').on(t.textbookId) }));

export const textbookChunks = pgTable('textbook_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  textbookId: uuid('textbook_id').notNull().references(() => textbooks.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'set null' }),
  pageNumber: integer('page_number').notNull(),
  pageEnd: integer('page_end'),
  section: text('section'),
  topic: text('topic'),
  sourceType: text('source_type').notNull().default('body'), // body | definition | formula | exercise | example
  text: text('text').notNull(),
  startOffset: integer('start_offset').notNull().default(0),
  endOffset: integer('end_offset').notNull().default(0),
  tokenEstimate: integer('token_estimate').notNull().default(0),
}, (t) => ({
  bookIdx: index('chunks_book_idx').on(t.textbookId),
  ownerIdx: index('chunks_owner_idx').on(t.ownerId),
  chapterIdx: index('chunks_chapter_idx').on(t.chapterId),
}));

export const chunkEmbeddings = pgTable('chunk_embeddings', {
  chunkId: uuid('chunk_id').primaryKey().references(() => textbookChunks.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  textbookId: uuid('textbook_id').notNull().references(() => textbooks.id, { onDelete: 'cascade' }),
  embedding: embeddingVector('embedding').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('embeddings_owner_idx').on(t.ownerId) }));

export const processingJobs = pgTable('processing_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  textbookId: uuid('textbook_id').notNull().references(() => textbooks.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: processingStatusEnum('status').notNull().default('uploaded'),
  progress: integer('progress').notNull().default(0),
  stageDetail: text('stage_detail'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ bookIdx: index('jobs_book_idx').on(t.textbookId) }));

/* ============================ assessment ============================ */

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  textbookId: uuid('textbook_id').references(() => textbooks.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'set null' }),
  conceptId: uuid('concept_id').references(() => concepts.id),
  type: questionTypeEnum('type').notNull().default('mcq'),
  difficulty: text('difficulty').notNull().default('medium'),
  language: text('language').notNull().default('en'),
  prompt: text('prompt').notNull(),
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation'),
  sourceChunkIds: jsonb('source_chunk_ids').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('questions_owner_idx').on(t.ownerId) }));

export const questionOptions = pgTable('question_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  ordinal: integer('ordinal').notNull(),
  text: text('text').notNull(),
  isCorrect: boolean('is_correct').notNull().default(false),
});

export const quizAttempts = pgTable('quiz_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  textbookId: uuid('textbook_id').references(() => textbooks.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'set null' }),
  kind: text('kind').notNull().default('quiz'), // quiz | exam | targeted_practice | viva
  score: integer('score').notNull().default(0),
  total: integer('total').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (t) => ({ ownerIdx: index('attempts_owner_idx').on(t.ownerId) }));

export const quizAnswers = pgTable('quiz_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  attemptId: uuid('attempt_id').notNull().references(() => quizAttempts.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  givenAnswer: text('given_answer'),
  isCorrect: boolean('is_correct').notNull(),
  secondsSpent: integer('seconds_spent'),
  answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('answers_owner_idx').on(t.ownerId) }));

export const mistakes = pgTable('mistakes', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').references(() => questions.id, { onDelete: 'set null' }),
  textbookId: uuid('textbook_id').references(() => textbooks.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'set null' }),
  conceptId: uuid('concept_id').references(() => concepts.id),
  kind: mistakeKindEnum('kind').notNull().default('unclassified'),
  occurrences: integer('occurrences').notNull().default(1),
  resolved: boolean('resolved').notNull().default(false),
  lastOccurredAt: timestamp('last_occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('mistakes_owner_idx').on(t.ownerId) }));

export const masteryRecords = pgTable('mastery_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'cascade' }),
  conceptId: uuid('concept_id').references(() => concepts.id, { onDelete: 'cascade' }),
  state: masteryStateEnum('state').notNull().default('unseen'),
  score: real('score'),                  // null => NOT ENOUGH DATA
  signalCount: integer('signal_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerIdx: index('mastery_owner_idx').on(t.ownerId),
  uniqChapter: uniqueIndex('mastery_owner_chapter_idx').on(t.ownerId, t.chapterId),
}));

/* ============================ study artifacts ============================ */

export const flashcards = pgTable('flashcards', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  textbookId: uuid('textbook_id').references(() => textbooks.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'set null' }),
  front: text('front').notNull(),
  back: text('back').notNull(),
  kind: text('kind').notNull().default('concept'),
  sourceChunkIds: jsonb('source_chunk_ids').$type<string[]>().notNull().default([]),
}, (t) => ({ ownerIdx: index('flashcards_owner_idx').on(t.ownerId) }));

export const revisionItems = pgTable('revision_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  flashcardId: uuid('flashcard_id').references(() => flashcards.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'cascade' }),
  easeFactor: real('ease_factor').notNull().default(2.5),
  intervalDays: real('interval_days').notNull().default(0),
  repetitions: integer('repetitions').notNull().default(0),
  lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
  nextReviewAt: timestamp('next_review_at', { withTimezone: true }).notNull().defaultNow(),
  bucket: revisionBucketEnum('bucket').notNull().default('review_now'),
}, (t) => ({
  ownerIdx: index('revision_owner_idx').on(t.ownerId),
  dueIdx: index('revision_due_idx').on(t.ownerId, t.nextReviewAt),
}));

export const flashcardReviews = pgTable('flashcard_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  flashcardId: uuid('flashcard_id').notNull().references(() => flashcards.id, { onDelete: 'cascade' }),
  grade: integer('grade').notNull(),     // 0 again, 3 hard, 5 easy
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  textbookId: uuid('textbook_id').references(() => textbooks.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'set null' }),
  mode: text('mode').notNull().default('short'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  sourceChunkIds: jsonb('source_chunk_ids').$type<string[]>().notNull().default([]),
  pinned: boolean('pinned').notNull().default(false),
  favorite: boolean('favorite').notNull().default(false),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('notes_owner_idx').on(t.ownerId) }));

/* ============================ sessions, planning, analytics ============================ */

export const studySessions = pgTable('study_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  textbookId: uuid('textbook_id').references(() => textbooks.id, { onDelete: 'set null' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'set null' }),
  activity: text('activity').notNull(),   // read | quiz | flashcards | focus | revision
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  reflection: text('reflection'),
  confidence: integer('confidence'),
}, (t) => ({ ownerIdx: index('sessions_owner_activity_idx').on(t.ownerId, t.startedAt) }));

export const examDates = pgTable('exam_dates', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  subjectId: uuid('subject_id').references(() => subjects.id),
  examOn: timestamp('exam_on', { withTimezone: true }).notNull(),
});

export const studyPlans = pgTable('study_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  examDateId: uuid('exam_date_id').references(() => examDates.id, { onDelete: 'set null' }),
  dailyMinutes: integer('daily_minutes').notNull().default(60),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  active: boolean('active').notNull().default(true),
}, (t) => ({ ownerIdx: index('plans_owner_idx').on(t.ownerId) }));

export const studyPlanItems = pgTable('study_plan_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => studyPlans.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  textbookId: uuid('textbook_id').references(() => textbooks.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').references(() => textbookChapters.id, { onDelete: 'set null' }),
  activity: text('activity').notNull(),   // revise | practice | quiz | mistake_practice | mock_exam
  minutes: integer('minutes').notNull(),
  reason: text('reason').notNull(),       // "explain why" — always populated from real signals
  completed: boolean('completed').notNull().default(false),
  rescheduledCount: integer('rescheduled_count').notNull().default(0),
}, (t) => ({ ownerDayIdx: index('plan_items_owner_day_idx').on(t.ownerId, t.scheduledFor) }));

/* ============================ AI conversations (private to the student) ============================ */

export const aiSessions = pgTable('ai_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  textbookId: uuid('textbook_id').references(() => textbooks.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull().default('normal'),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('ai_sessions_owner_idx').on(t.ownerId) }));

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => aiSessions.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),           // user | assistant
  content: text('content').notNull(),
  insufficientEvidence: boolean('insufficient_evidence').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aiSources = pgTable('ai_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => aiMessages.id, { onDelete: 'cascade' }),
  chunkId: uuid('chunk_id').references(() => textbookChunks.id, { onDelete: 'set null' }),
  pageNumber: integer('page_number').notNull(),
  chapterTitle: text('chapter_title'),
  score: real('score'),
});


/* ============================ notes (full CRUD, not just AI-generated) ============================ */

export const noteFolders = pgTable('note_folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
}, (t) => ({ ownerIdx: index('note_folders_owner_idx').on(t.ownerId) }));

/* `notes` table already exists above with mode/title/body/sourceChunkIds.
 * The columns below extend it for manual (non-AI) notes and organisation —
 * added via a separate table reference is not possible in Drizzle, so these
 * columns are added to the existing table by the migration generator picking
 * up the additional fields declared here. */

/* ============================ projects ============================ */

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  subjectId: uuid('subject_id').references(() => subjects.id),
  status: projectStatusEnum('status').notNull().default('idea'),
  deadline: timestamp('deadline', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('projects_owner_idx').on(t.ownerId) }));

export const projectTasks = pgTable('project_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: boolean('done').notNull().default(false),
  ordinal: integer('ordinal').notNull().default(0),
}, (t) => ({ projectIdx: index('project_tasks_project_idx').on(t.projectId) }));

export const projectResources = pgTable('project_resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url'),
});

/* ============================ skills ============================ */

export const skillCategories = pgTable('skill_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

/** Raw signals a skill score is computed from — never a stored percentage,
 *  because the percentage must always be derivable and re-auditable from
 *  the events that produced it. */
export const skillEvents = pgTable('skill_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  skillCategoryId: uuid('skill_category_id').notNull().references(() => skillCategories.id),
  sourceType: text('source_type').notNull(), // quiz_answer | project_task | writing_review | focus_session
  sourceId: uuid('source_id'),
  weight: real('weight').notNull().default(1),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('skill_events_owner_idx').on(t.ownerId) }));

/* ============================ career (informational, data-driven) ============================ */

export const careerPaths = pgTable('career_paths', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  summary: text('summary').notNull(),
  requiredSubjects: jsonb('required_subjects').$type<string[]>().notNull().default([]),
  relatedSkills: jsonb('related_skills').$type<string[]>().notNull().default([]),
  educationPath: text('education_path'),
  sourceUrl: text('source_url'),
  sourceLabel: text('source_label'),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
});

/* ============================ achievements (unlocked only from real events) ============================ */

export const achievementUnlocks = pgTable('achievement_unlocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: achievementKeyEnum('key').notNull(),
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerIdx: index('achievement_unlocks_owner_idx').on(t.ownerId),
  uniqOwnerKey: uniqueIndex('achievement_unlocks_owner_key_idx').on(t.ownerId, t.key),
}));

/* ============================ question scanner ============================ */

export const scannedQuestions = pgTable('scanned_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  imageStorageKey: text('image_storage_key').notNull(),
  rawOcrText: text('raw_ocr_text').notNull(),
  language: text('language').notNull(),
  subject: text('subject').notNull(),
  isNumerical: boolean('is_numerical').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ ownerIdx: index('scanned_questions_owner_idx').on(t.ownerId) }));

/* ============================ classroom ============================ */

export const teacherClasses = pgTable('teacher_classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const classMembers = pgTable('class_members', {
  classId: uuid('class_id').notNull().references(() => teacherClasses.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.classId, t.studentId] }) }));

export const studentParentLinks = pgTable('student_parent_links', {
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.studentId, t.parentId] }) }));

export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id').notNull().references(() => teacherClasses.id, { onDelete: 'cascade' }),
  teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
});
