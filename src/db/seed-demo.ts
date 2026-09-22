import { eq, and } from 'drizzle-orm';
import { db, closePool } from './index';
import {
  users, profiles, studentProfiles, textbooks, textbookPages,
  textbookChapters, textbookChunks, chunkEmbeddings, flashcards,
} from './schema';
import { hashPassword } from '@/lib/auth/password';
import { detectChapters } from '@/lib/pdf/structure';
import { chunkTextbook } from '@/lib/pdf/chunk';
import { embeddings } from '@/lib/ai';
import { DEMO_PAGES, DEMO_TEXTBOOK_TITLE } from '@/lib/demo/seed-data';

const DEMO_EMAIL = 'demo@studyos.local';
const DEMO_PASSWORD = 'demo-password-not-for-production';

/**
 * Idempotent: every insert is preceded by a lookup, and re-running this script
 * updates rather than duplicates. `isDemo: true` on the textbook is what keeps
 * this content out of any real student's library — nothing here is ever
 * attached to a non-demo user.
 */
async function seedDemo(): Promise<void> {
  console.log('[seed:demo] starting…');

  let user = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) });
  if (!user) {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const [created] = await db.insert(users).values({
      email: DEMO_EMAIL, passwordHash, role: 'student',
    }).returning();
    user = created!;
    await db.insert(profiles).values({ userId: user.id, displayName: 'Demo Student', preferredLanguage: 'en' });
    await db.insert(studentProfiles).values({ userId: user.id, classLabel: 'Class 9' });
    console.log('[seed:demo] created demo user');
  } else {
    console.log('[seed:demo] demo user already exists — reusing');
  }

  let book = await db.query.textbooks.findFirst({
    where: and(eq(textbooks.ownerId, user.id), eq(textbooks.title, DEMO_TEXTBOOK_TITLE)),
  });

  if (book) {
    console.log('[seed:demo] demo textbook already exists — clearing derived rows for a clean re-seed');
    await db.delete(textbookPages).where(eq(textbookPages.textbookId, book.id));
    await db.delete(textbookChapters).where(eq(textbookChapters.textbookId, book.id));
    await db.delete(textbookChunks).where(eq(textbookChunks.textbookId, book.id));
    await db.delete(flashcards).where(eq(flashcards.textbookId, book.id));
  } else {
    const [created] = await db.insert(textbooks).values({
      ownerId: user.id, title: DEMO_TEXTBOOK_TITLE, storageKey: 'demo/none', isDemo: true, status: 'ready',
      pageCount: DEMO_PAGES.length,
    }).returning();
    book = created!;
    console.log('[seed:demo] created demo textbook');
  }

  await db.insert(textbookPages).values(
    DEMO_PAGES.map((p) => ({
      textbookId: book!.id, ownerId: user!.id, pageNumber: p.pageNumber,
      text: p.text, extractedBy: 'text_layer' as const, charCount: p.text.length,
    })),
  );

  const detected = detectChapters(DEMO_PAGES);
  const insertedChapters = await db.insert(textbookChapters).values(
    detected.map((c) => ({
      textbookId: book!.id, ownerId: user!.id, ordinal: c.ordinal, title: c.title,
      startPage: c.startPage, endPage: c.endPage, detectedBy: 'heuristic' as const,
    })),
  ).returning({ id: textbookChapters.id, ordinal: textbookChapters.ordinal });

  const chapterInputs = detected.map((c) => ({
    id: insertedChapters.find((r) => r.ordinal === c.ordinal)?.id ?? null,
    ordinal: c.ordinal, title: c.title, startPage: c.startPage, endPage: c.endPage,
  }));

  const chunks = chunkTextbook(DEMO_PAGES, chapterInputs);
  const insertedChunks = await db.insert(textbookChunks).values(
    chunks.map((c) => ({
      textbookId: book!.id, ownerId: user!.id, chapterId: c.chapterId,
      pageNumber: c.pageNumber, pageEnd: c.pageEnd, section: c.section, topic: c.topic,
      sourceType: c.sourceType, text: c.text, startOffset: c.startOffset,
      endOffset: c.endOffset, tokenEstimate: c.tokenEstimate,
    })),
  ).returning({ id: textbookChunks.id, text: textbookChunks.text });

  // Embeddings require a live API key. The demo textbook is otherwise fully
  // usable (reader, chapters, pages) without them — only "Ask your textbook"
  // needs this step, so a missing key degrades gracefully rather than failing seeding.
  try {
    const embedder = embeddings();
    const vectors = await embedder.embed(insertedChunks.map((c) => c.text), 'document');
    await db.insert(chunkEmbeddings).values(
      insertedChunks.map((c, i) => ({
        chunkId: c.id, ownerId: user!.id, textbookId: book!.id,
        embedding: vectors[i]!, model: embedder.model,
      })),
    );
    console.log(`[seed:demo] embedded ${insertedChunks.length} chunks`);
  } catch (err) {
    console.warn(
      '[seed:demo] skipped embeddings — EMBEDDING_API_KEY is not configured. ' +
      'The demo textbook is seeded but "Ask your textbook" will not retrieve results until embeddings run.',
      (err as Error).message,
    );
  }

  console.log('[seed:demo] done. Demo login:', DEMO_EMAIL, '/', DEMO_PASSWORD);
}

seedDemo()
  .then(() => closePool())
  .catch(async (err) => {
    console.error('[seed:demo] failed:', err);
    await closePool();
    process.exit(1);
  });
