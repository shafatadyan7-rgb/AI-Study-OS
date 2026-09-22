import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { studentParentLinks, profiles, studySessions, examDates } from '@/db/schema';
import { requireRole } from '@/lib/auth/guard';
import { projectForRole } from '@/lib/privacy/visibility';
import { currentStreak } from '@/lib/analytics/aggregate';
import { handleError } from '@/lib/http';

/** Linked children only — a parent can never look up an arbitrary student id. */
export async function GET() {
  try {
    const parent = await requireRole('parent');

    const links = await db.select({ studentId: studentParentLinks.studentId })
      .from(studentParentLinks).where(eq(studentParentLinks.parentId, parent.id));
    const studentIds = links.map((l) => l.studentId);
    if (studentIds.length === 0) return NextResponse.json([]);

    const names = await db.select({ userId: profiles.userId, displayName: profiles.displayName })
      .from(profiles).where(inArray(profiles.userId, studentIds));

    const results = await Promise.all(names.map(async (n) => {
      const sessions = await db.select({ startedAt: studySessions.startedAt, durationSeconds: studySessions.durationSeconds })
        .from(studySessions).where(eq(studySessions.ownerId, n.userId));
      const exam = await db.query.examDates.findFirst({ where: eq(examDates.ownerId, n.userId) });
      const studyMinutes = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / 60;

      return projectForRole({
        displayName: n.displayName,
        studyMinutes: Math.round(studyMinutes),
        streak: currentStreak(sessions.map((s) => ({ startedAt: s.startedAt, durationSeconds: s.durationSeconds }))),
        upcomingExams: exam ? [{ label: exam.label, examOn: exam.examOn.toISOString() }] : [],
      }, 'parent');
    }));

    return NextResponse.json(results);
  } catch (err) {
    return handleError(err, 'api.parent_students.failed');
  }
}
