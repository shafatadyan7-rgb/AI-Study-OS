import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { scannedQuestions, textbooks } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { recognizeImage } from '@/lib/scanner/ocr';
import { OcrUnavailableError } from '@/lib/pdf/ocr';
import { parseQuestion, solveInstruction, type SolveDepth } from '@/lib/scanner/question';
import { retrieve } from '@/lib/rag/retrieve';
import { INSUFFICIENT_EVIDENCE } from '@/lib/rag/answer';
import { sanitiseTextbookText } from '@/lib/rag/sanitise';
import { ai } from '@/lib/ai';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';

const Body = z.object({
  // Base64-encoded image (PNG/JPEG). Small classroom photos only — this is
  // synchronous, unlike textbook upload, which goes through the job queue.
  imageBase64: z.string().min(1),
  depth: z.enum(['hint', 'step_by_step', 'full_solution']).default('hint'),
  textbookId: z.string().uuid().optional(),
});

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_EVIDENCE_SCORE = 0.012;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`scanner:${user.id}`, LIMITS.generate.limit, LIMITS.generate.window);
    const body = Body.parse(await req.json());

    const buffer = Buffer.from(body.imageBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image must be under 8MB.' }, { status: 413 });
    }

    if (body.textbookId) {
      const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, body.textbookId) });
      assertOwnership(user, book);
    }

    let ocrText: string;
    try {
      ocrText = await recognizeImage(buffer);
    } catch (err) {
      if (err instanceof OcrUnavailableError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      throw err;
    }
    if (ocrText.length < 5) {
      return NextResponse.json({ error: 'Could not read any text in that image. Try a clearer photo.' }, { status: 422 });
    }

    const parsed = parseQuestion(ocrText);

    await db.insert(scannedQuestions).values({
      ownerId: user.id, imageStorageKey: 'inline', rawOcrText: ocrText,
      language: parsed.language, subject: parsed.subject, isNumerical: parsed.isNumerical,
    });

    // Ground the guided solution in the student's own textbooks, scoped to one
    // if given, otherwise searched across their whole library.
    const chunks = await retrieve({
      ownerId: user.id, query: parsed.text,
      scope: body.textbookId ? 'textbook' : 'library', textbookId: body.textbookId,
    });
    const usable = chunks.filter((c) => c.score >= MIN_EVIDENCE_SCORE);

    if (usable.length === 0) {
      return NextResponse.json({
        parsed, answer: INSUFFICIENT_EVIDENCE, sources: [], insufficientEvidence: true,
      });
    }

    const evidence = usable
      .map((c, i) => `<evidence id="${i + 1}" source="${c.textbookTitle} — page ${c.pageNumber}">\n${sanitiseTextbookText(c.text)}\n</evidence>`)
      .join('\n\n');

    const system = `You are AI StudyOS's question-scanner tutor. Answer ONLY using the <evidence> provided. Never invent facts, page numbers or citations. If the evidence is insufficient, reply with exactly: "${INSUFFICIENT_EVIDENCE}"\n\n${solveInstruction(parsed, body.depth as SolveDepth)}`;

    const answer = await ai().generate({
      system,
      messages: [{ role: 'user', content: `${evidence}\n\nScanned question (${parsed.language}): ${parsed.text}` }],
      maxTokens: 1000,
    });

    const declined = answer.includes(INSUFFICIENT_EVIDENCE);
    return NextResponse.json({
      parsed, answer,
      sources: declined ? [] : usable.map((c) => ({ pageNumber: c.pageNumber, textbookTitle: c.textbookTitle, chapterTitle: c.chapterTitle })),
      insufficientEvidence: declined,
    });
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    return handleError(err, 'api.scanner.failed');
  }
}
