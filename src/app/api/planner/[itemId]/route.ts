import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { studyPlanItems } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

const Body = z.object({ completed: z.boolean().optional() });

/** Marks a plan item complete. Skipping/rescheduling happens by regenerating
 *  the plan (POST /api/planner/generate), which is where "not punished" logic
 *  actually lives — not by silently mutating a single row here. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await requireUser();
    const { itemId } = await ctx.params;
    const body = Body.parse(await req.json());

    const item = await db.query.studyPlanItems.findFirst({ where: eq(studyPlanItems.id, itemId) });
    assertOwnership(user, item);

    if (body.completed !== undefined) {
      await db.update(studyPlanItems).set({ completed: body.completed }).where(eq(studyPlanItems.id, itemId));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, 'api.planner_item_patch.failed');
  }
}
