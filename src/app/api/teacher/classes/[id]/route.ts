import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { teacherClasses, classMembers, profiles, quizAnswers, mistakes } from '@/db/schema';
import { requireRole } from '@/lib/auth/guard';
import { projectForRole, canReportAggregate, MIN_COHORT_FOR_AGGREGATE } from '@/lib/privacy/visibility';
import { accuracy, mistakeBreakdown } from '@/lib/analytics/aggregate';
import { handleError } from '@/lib/http';

/**
 * Teacher class analytics. Every field returned here is filtered through the
 * same allowlist projection used everywhere else in the product — a teacher
 * gets performance, never a private AI conversation, and never gets an
 * individual accuracy figure unless the class is large enough that it cannot
 * be reverse-engineered into one particular student's score.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const teacher = await requireRole('teacher');
    const { id } = await ctx.params;

    const klass = await db.query.teacherClasses.findFirst({ where: eq(teacherClasses.id, id) });
    if (!klass || klass.teacherId !== teacher.id) {
      return NextResponse.json({ error: 'Not found or not yours.' }, { status: 403 });
    }

    const members = await db
      .select({ studentId: classMembers.studentId, displayName: profiles.displayName })
      .from(classMembers)
      .innerJoin(profiles, eq(profiles.userId, classMembers.studentId))
      .where(eq(classMembers.classId, id));

    const studentIds = members.map((m) => m.studentId);
    const cohortSize = studentIds.length;

    if (!canReportAggregate(cohortSize)) {
      return NextResponse.json({
        className: klass.name,
        studentCount: cohortSize,
        note: `Aggregate performance is shown once a class has at least ${MIN_COHORT_FOR_AGGREGATE} students, so no single student's result can be identified.`,
        students: members.map((m) => projectForRole({ displayName: m.displayName }, 'teacher')),
      });
    }

    const answers = studentIds.length
      ? await db.select({ isCorrect: quizAnswers.isCorrect, answeredAt: quizAnswers.answeredAt })
          .from(quizAnswers).where(inArray(quizAnswers.ownerId, studentIds))
      : [];
    const mistakeRows = studentIds.length
      ? await db.select({ kind: mistakes.kind, resolved: mistakes.resolved })
          .from(mistakes).where(inArray(mistakes.ownerId, studentIds))
      : [];

    return NextResponse.json({
      className: klass.name,
      studentCount: cohortSize,
      classAccuracy: accuracy(answers.map((a) => ({ ...a, chapterId: null }))),
      commonMistakes: mistakeBreakdown(mistakeRows),
      students: members.map((m) => projectForRole({ displayName: m.displayName }, 'teacher')),
    });
  } catch (err) {
    return handleError(err, 'api.teacher_class_detail.failed');
  }
}
