import { NextResponse } from 'next/server';
import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { db } from '@/db';
import { studyPlans, studyPlanItems, textbookChapters } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

/** Returns the active plan's items for the next 7 days. Does not generate a plan. */
export async function GET() {
  try {
    const user = await requireUser();
    const plan = await db.query.studyPlans.findFirst({
      where: and(eq(studyPlans.ownerId, user.id), eq(studyPlans.active, true)),
    });
    if (!plan) return NextResponse.json({ plan: null, items: [] });

    const weekAhead = new Date(Date.now() + 7 * 86_400_000);
    const items = await db
      .select({
        id: studyPlanItems.id, scheduledFor: studyPlanItems.scheduledFor,
        activity: studyPlanItems.activity, minutes: studyPlanItems.minutes,
        reason: studyPlanItems.reason, completed: studyPlanItems.completed,
        chapterId: studyPlanItems.chapterId, chapterTitle: textbookChapters.title,
      })
      .from(studyPlanItems)
      .leftJoin(textbookChapters, eq(textbookChapters.id, studyPlanItems.chapterId))
      .where(and(
        eq(studyPlanItems.ownerId, user.id),
        eq(studyPlanItems.planId, plan.id),
        gte(studyPlanItems.scheduledFor, new Date(new Date().setHours(0, 0, 0, 0))),
        lte(studyPlanItems.scheduledFor, weekAhead),
      ))
      .orderBy(asc(studyPlanItems.scheduledFor));

    return NextResponse.json({
      plan: { id: plan.id, dailyMinutes: plan.dailyMinutes },
      items: items.map((i) => ({ ...i, scheduledFor: i.scheduledFor.toISOString() })),
    });
  } catch (err) {
    return handleError(err, 'api.planner_get.failed');
  }
}
