import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  textbooks, textbookPages, textbookChapters, textbookChunks,
  chunkEmbeddings, processingJobs,
} from '@/db/schema';
import { getObject } from '@/lib/storage/s3';
import { extractPdf, PdfExtractionError, type ExtractedPage } from '@/lib/pdf/extract';
import { ocrPages, OcrUnavailableError } from '@/lib/pdf/ocr';
import { detectChapters } from '@/lib/pdf/structure';
import { chunkTextbook } from '@/lib/pdf/chunk';
import { embeddings } from '@/lib/ai';
import { log } from '@/lib/log';

export interface ProcessTextbookPayload { textbookId: string; ownerId: string; jobId: string; }

type Stage =
  | 'validating' | 'extracting' | 'ocr_processing' | 'structuring'
  | 'chunking' | 'embedding' | 'ready' | 'failed';

/** Progress percentages map to real stage completion, not a timer. */
const STAGE_PROGRESS: Record<Stage, number> = {
  validating: 10, extracting: 25, ocr_processing: 40, structuring: 60,
  chunking: 75, embedding: 90, ready: 100, failed: 0,
};

const EMBED_BATCH = 64;

async function setStage(jobId: string, textbookId: string, stage: Stage, detail?: string) {
  await db.update(processingJobs)
    .set({ status: stage, progress: STAGE_PROGRESS[stage], stageDetail: detail ?? null, updatedAt: new Date() })
    .where(eq(processingJobs.id, jobId));
  await db.update(textbooks)
    .set({ status: stage, updatedAt: new Date() })
    .where(eq(textbooks.id, textbookId));
}

async function fail(jobId: string, textbookId: string, message: string) {
  await db.update(processingJobs)
    .set({ status: 'failed', progress: 0, error: message, finishedAt: new Date(), updatedAt: new Date() })
    .where(eq(processingJobs.id, jobId));
  await db.update(textbooks)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(eq(textbooks.id, textbookId));
}

export async function processTextbook(payload: ProcessTextbookPayload): Promise<void> {
  const { textbookId, ownerId, jobId } = payload;
  log.info('processing.start', { textbookId, jobId });

  await db.update(processingJobs)
    .set({ startedAt: new Date(), error: null })
    .where(eq(processingJobs.id, jobId));

  try {
    /* ---- validating ---- */
    await setStage(jobId, textbookId, 'validating');
    const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, textbookId) });
    if (!book) throw new Error('Textbook record disappeared.');
    if (book.ownerId !== ownerId) throw new Error('Ownership mismatch — refusing to process.');

    const buffer = await getObject(book.storageKey);
    if (buffer.subarray(0, 5).toString('utf8') !== '%PDF-') {
      throw new PdfExtractionError('This file is not a valid PDF.');
    }

    /* ---- extracting ---- */
    await setStage(jobId, textbookId, 'extracting');
    const extraction = await extractPdf(buffer);
    if (extraction.pageCount === 0) throw new PdfExtractionError('The PDF contains no readable pages.');

    /* ---- OCR, only when the text layer is genuinely insufficient ---- */
    let pages: ExtractedPage[] = extraction.pages;
    if (extraction.needsOcr) {
      await setStage(jobId, textbookId, 'ocr_processing', 'Scanned PDF detected — running OCR.');
      try {
        pages = await ocrPages(buffer, pages);
      } catch (err) {
        if (err instanceof OcrUnavailableError) {
          // Do not proceed with empty pages and pretend the book is ready.
          await fail(jobId, textbookId, 'Text could not be extracted from this PDF. OCR processing failed.');
          return;
        }
        throw err;
      }
      const stillEmpty = pages.filter((p) => p.text.length < 40).length / pages.length;
      if (stillEmpty > 0.6) {
        await fail(jobId, textbookId, 'Text could not be extracted from this PDF. OCR processing failed.');
        return;
      }
    }

    await db.delete(textbookPages).where(eq(textbookPages.textbookId, textbookId));
    for (let i = 0; i < pages.length; i += 200) {
      const slice = pages.slice(i, i + 200);
      await db.insert(textbookPages).values(
        slice.map((p) => ({
          textbookId, ownerId,
          pageNumber: p.pageNumber,
          text: p.text,
          extractedBy: p.extractedBy,
          charCount: p.text.length,
        })),
      );
    }

    /* ---- structuring ---- */
    await setStage(jobId, textbookId, 'structuring');
    const detected = detectChapters(pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })));
    await db.delete(textbookChapters).where(eq(textbookChapters.textbookId, textbookId));
    const insertedChapters = await db.insert(textbookChapters).values(
      detected.map((c) => ({
        textbookId, ownerId,
        ordinal: c.ordinal, title: c.title,
        startPage: c.startPage, endPage: c.endPage,
        detectedBy: 'heuristic' as const,
      })),
    ).returning({ id: textbookChapters.id, ordinal: textbookChapters.ordinal });

    const chapterInputs = detected.map((c) => ({
      id: insertedChapters.find((r) => r.ordinal === c.ordinal)?.id ?? null,
      ordinal: c.ordinal, title: c.title, startPage: c.startPage, endPage: c.endPage,
    }));

    /* ---- chunking ---- */
    await setStage(jobId, textbookId, 'chunking');
    const chunks = chunkTextbook(
      pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
      chapterInputs,
    );
    if (chunks.length === 0) throw new PdfExtractionError('No usable text could be chunked from this PDF.');

    await db.delete(textbookChunks).where(eq(textbookChunks.textbookId, textbookId));
    const insertedChunks: { id: string; text: string }[] = [];
    for (let i = 0; i < chunks.length; i += 200) {
      const slice = chunks.slice(i, i + 200);
      const rows = await db.insert(textbookChunks).values(
        slice.map((c) => ({
          textbookId, ownerId,
          chapterId: c.chapterId,
          pageNumber: c.pageNumber, pageEnd: c.pageEnd,
          section: c.section, topic: c.topic, sourceType: c.sourceType,
          text: c.text, startOffset: c.startOffset, endOffset: c.endOffset,
          tokenEstimate: c.tokenEstimate,
        })),
      ).returning({ id: textbookChunks.id, text: textbookChunks.text });
      insertedChunks.push(...rows);
    }

    /* ---- embedding ---- */
    await setStage(jobId, textbookId, 'embedding', `Embedding ${insertedChunks.length} chunks.`);
    const embedder = embeddings();
    for (let i = 0; i < insertedChunks.length; i += EMBED_BATCH) {
      const batch = insertedChunks.slice(i, i + EMBED_BATCH);
      const vectors = await embedder.embed(batch.map((c) => c.text), 'document');
      await db.insert(chunkEmbeddings).values(
        batch.map((c, j) => {
          const v = vectors[j];
          if (!v) throw new Error('Embedding provider returned fewer vectors than inputs.');
          return {
            chunkId: c.id, ownerId, textbookId,
            embedding: v, model: embedder.model,
          };
        }),
      );
      const done = Math.min(i + EMBED_BATCH, insertedChunks.length);
      await db.update(processingJobs)
        .set({ stageDetail: `Embedded ${done}/${insertedChunks.length} chunks.`, updatedAt: new Date() })
        .where(eq(processingJobs.id, jobId));
    }

    /* ---- ready ---- */
    await db.update(textbooks)
      .set({ pageCount: pages.length, status: 'ready', updatedAt: new Date() })
      .where(eq(textbooks.id, textbookId));
    await db.update(processingJobs)
      .set({ status: 'ready', progress: 100, stageDetail: null, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(processingJobs.id, jobId));

    log.info('processing.ready', {
      textbookId, pages: pages.length, chapters: detected.length, chunks: insertedChunks.length,
    });
  } catch (err) {
    const message = err instanceof PdfExtractionError
      ? err.message
      : 'Textbook processing failed. You can retry, or upload a different file.';
    log.error('processing.failed', { textbookId, jobId, error: (err as Error).message });
    await fail(jobId, textbookId, message);
  }
}
