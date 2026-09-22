import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { textbookChapters, textbookChunks, questions, questionOptions, quizAttempts } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { ai } from '@/lib/ai';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';

const Body = z.object({
  chapterId: z.string().uuid(),
  count: z.number().int().min(3).max(25).default(10),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  kind: z.enum(['quiz', 'exam', 'targeted_practice']).default('quiz'),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`quiz:${user.id}`, LIMITS.generate.limit, LIMITS.generate.window);
    const body = Body.parse(await req.json());

    const chapter = await db.query.textbookChapters.findFirst({ where: eq(textbookChapters.id, body.chapterId) });
    assertOwnership(user, chapter);

    const chunks = await db.query.textbookChunks.findMany({
      where: and(eq(textbookChunks.ownerId, user.id), eq(textbookChunks.chapterId, body.chapterId)),
      limit: 40,
    });
    if (chunks.length === 0) {
      return NextResponse.json({ error: 'This chapter has no indexed content yet.' }, { status: 409 });
    }

    const evidence = chunks.map((c) => `[p.${c.pageNumber}] ${c.text}`).join('\n').slice(0, 9000);
    const raw = await ai().generate({
      system: `Generate exactly ${body.count} multiple-choice questions (${body.difficulty} difficulty) strictly grounded in the given textbook text. Each question must have exactly ONE clearly correct, unambiguous answer among 4 options. Return ONLY a JSON array, no prose. Each item: {"question":"...", "options":["a","b","c","d"], "correctIndex":0, "explanation":"..."}`,
      messages: [{ role: 'user', content: evidence }],
      maxTokens: 2200,
    });

    const parsed = extractJsonArray(raw);
    if (!parsed || parsed.length === 0) {
      return NextResponse.json({ error: 'Quiz generation failed. Try again.' }, { status: 502 });
    }

    const chunkIds = chunks.map((c) => c.id);
    const createdQuestionIds: string[] = [];
    for (const q of parsed as any[]) {
      if (!q.question || !Array.isArray(q.options) || q.options.length < 2) continue;
      const [row] = await db.insert(questions).values({
        ownerId: user.id, textbookId: chapter!.textbookId, chapterId: chapter!.id,
        type: 'mcq', difficulty: body.difficulty,
        prompt: String(q.question), correctAnswer: String(q.options[q.correctIndex] ?? q.options[0]),
        explanation: q.explanation ? String(q.explanation) : null, sourceChunkIds: chunkIds,
      }).returning({ id: questions.id });
      await db.insert(questionOptions).values(
        q.options.map((opt: string, i: number) => ({
          questionId: row!.id, ordinal: i, text: String(opt), isCorrect: i === q.correctIndex,
        })),
      );
      createdQuestionIds.push(row!.id);
    }

    if (createdQuestionIds.length === 0) {
      return NextResponse.json({ error: 'No valid questions could be generated. Try again.' }, { status: 502 });
    }

    const [attempt] = await db.insert(quizAttempts).values({
      ownerId: user.id, textbookId: chapter!.textbookId, chapterId: chapter!.id,
      kind: body.kind, total: createdQuestionIds.length,
    }).returning({ id: quizAttempts.id });

    const created = await db.query.questions.findMany({
      where: inArray(questions.id, createdQuestionIds),
    });
    const optionsRows = await Promise.all(created.map((q) =>
      db.query.questionOptions.findMany({ where: eq(questionOptions.questionId, q.id) }),
    ));

    return NextResponse.json({
      attemptId: attempt!.id,
      chapterTitle: chapter!.title,
      questions: created.map((q, i) => ({
        id: q.id,
        prompt: q.prompt,
        options: optionsRows[i]!.sort((a, b) => a.ordinal - b.ordinal).map((o) => ({ id: o.id, text: o.text })),
      })),
    });
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    return handleError(err, 'api.quiz_generate.failed');
  }
}

function extractJsonArray(text: string): unknown[] | null {
  let t = text.replace(/```json/gi, '```').trim();
  const m = t.match(/```([\s\S]*?)```/);
  if (m) t = m[1]!.trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
