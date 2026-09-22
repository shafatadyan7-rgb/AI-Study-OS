import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import {
  textbooks, textbookChapters, studyPlans, studyPlanItems,
  quizAttempts, quizAnswers, mistakes, revisionItems, examDates,
} from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { computeMastery, type AttemptSignal } from '@/lib/learning/mastery';
import { generatePlan, type PlannerChapter, type PlanActivity } from '@/lib/learning/planner';
import { rateLimit, LIMITS, RateLimitError } from '@/lib/ratelimit';
import { handleError } from '@/lib/http';

const Body = z.object({
  dailyMinutes: z.number().int().min(15).max(300).default(60),
  horizonDays: z.number().int().min(1).max(14).default(7),
  examDateId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`planner:${user.id}`, LIMITS.generate.limit, LIMITS.generate.window);
    const body = Body.parse(await req.json());

    const books = await db.query.textbooks.findMany({
      where: and(eq(textbooks.ownerId, user.id), eq(textbooks.status, 'ready')),
    });
    const chapters = (await Promise.all(
      books.map((b) => db.query.textbookChapters.findMany({ where: eq(textbookChapters.textbookId, b.id) })),
    )).flat();

    if (chapters.length === 0) {
      return NextResponse.json({ error: 'No processed textbooks to plan from yet.' }, { status: 409 });
    }

    const plannerChapters: PlannerChapter[] = await Promise.all(chapters.map(async (chapter) => {
      const answers = await db
        .select({ isCorrect: quizAnswers.isCorrect, answeredAt: quizAnswers.answeredAt })
        .from(quizAnswers)
        .innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.attemptId))
        .where(and(eq(quizAnswers.ownerId, user.id), eq(quizAttempts.chapterId, chapter.id)));

      const attempts: AttemptSignal[] = answers.map((a) => ({
        correct: a.isCorrect, answeredAt: a.answeredAt, difficulty: 'medium', questionType: 'mcq',
      }));
      const unresolved = await db.query.mistakes.findMany({
        where: and(eq(mistakes.ownerId, user.id), eq(mistakes.chapterId, chapter.id), eq(mistakes.resolved, false)),
      });
      const due = await db.query.revisionItems.findMany({
        where: and(eq(revisionItems.ownerId, user.id), eq(revisionItems.chapterId, chapter.id)),
      });
      const dueNow = due.filter((r) => r.nextReviewAt.getTime() <= Date.now()).length;
      const mastery = computeMastery({ attempts, revisionSuccesses: 0, unresolvedMistakes: unresolved.length });

      return {
        chapterId: chapter.id, textbookId: chapter.textbookId, title: chapter.title, subject: '',
        masteryState: mastery.state, masteryScore: mastery.score,
        unresolvedMistakes: unresolved.length, revisionDueCount: dueNow, pageCount: 0,
      };
    }));

    const exam = body.examDateId
      ? await db.query.examDates.findFirst({ where: and(eq(examDates.id, body.examDateId), eq(examDates.ownerId, user.id)) })
      : null;

    const prevPlan = await db.query.studyPlans.findFirst({
      where: and(eq(studyPlans.ownerId, user.id), eq(studyPlans.active, true)),
    });
    let carriedOver: { chapterId: string; activity: PlanActivity; minutes: number }[] = [];
    if (prevPlan) {
      const incomplete = await db.query.studyPlanItems.findMany({
        where: and(eq(studyPlanItems.planId, prevPlan.id), eq(studyPlanItems.completed, false)),
      });
      carriedOver = incomplete
        .filter((i): i is typeof i & { chapterId: string } => i.chapterId !== null)
        .map((i) => ({ chapterId: i.chapterId, activity: i.activity as PlanActivity, minutes: i.minutes }));
      await db.update(studyPlans).set({ active: false }).where(eq(studyPlans.id, prevPlan.id));
    }

    const items = generatePlan({
      chapters: plannerChapters, dailyMinutes: body.dailyMinutes,
      examOn: exam?.examOn ?? null, horizonDays: body.horizonDays, carriedOver,
    });

    const [plan] = await db.insert(studyPlans).values({
      ownerId: user.id, examDateId: exam?.id ?? null, dailyMinutes: body.dailyMinutes,
    }).returning({ id: studyPlans.id });

    if (items.length > 0) {
      await db.insert(studyPlanItems).values(items.map((i) => ({
        planId: plan!.id, ownerId: user.id, scheduledFor: i.scheduledFor,
        textbookId: i.textbookId, chapterId: i.chapterId, activity: i.activity,
        minutes: i.minutes, reason: i.reason,
      })));
    }

    return NextResponse.json({ planId: plan!.id, itemCount: items.length });
  } catch (err) {
    if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429 });
    return handleError(err, 'api.planner_generate.failed');
  }
}
