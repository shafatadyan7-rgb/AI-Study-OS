import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { skillCategories, skillEvents } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { computeSkillScore } from '@/lib/learning/achievements';
import { handleError } from '@/lib/http';

/** All skill scores are derived from real skill_events rows — see
 *  src/lib/learning/achievements.ts for why this is an activity signal, not
 *  an accuracy percentage, and why it never reports NOT ENOUGH DATA as 0. */
export async function GET() {
  try {
    const user = await requireUser();
    const categories = await db.query.skillCategories.findMany();

    const results = await Promise.all(categories.map(async (cat) => {
      const events = await db.query.skillEvents.findMany({
        where: and(eq(skillEvents.ownerId, user.id), eq(skillEvents.skillCategoryId, cat.id)),
      });
      const result = computeSkillScore(events.map((e) => ({ weight: e.weight, occurredAt: e.occurredAt })));
      return { categoryId: cat.id, name: cat.name, score: result.score, eventCount: result.eventCount };
    }));

    return NextResponse.json(results);
  } catch (err) {
    return handleError(err, 'api.skills.failed');
  }
}
