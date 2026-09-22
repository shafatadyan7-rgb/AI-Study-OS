import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, count } from 'drizzle-orm';
import { db } from '@/db';
import { teacherClasses, classMembers } from '@/db/schema';
import { requireRole } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

export async function GET() {
  try {
    const user = await requireRole('teacher');
    const rows = await db
      .select({ id: teacherClasses.id, name: teacherClasses.name, createdAt: teacherClasses.createdAt, studentCount: count(classMembers.studentId) })
      .from(teacherClasses)
      .leftJoin(classMembers, eq(classMembers.classId, teacherClasses.id))
      .where(eq(teacherClasses.teacherId, user.id))
      .groupBy(teacherClasses.id);

    return NextResponse.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), studentCount: Number(r.studentCount) })));
  } catch (err) {
    return handleError(err, 'api.teacher_classes_list.failed');
  }
}

const Body = z.object({ name: z.string().min(1).max(120) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('teacher');
    const body = Body.parse(await req.json());
    const [row] = await db.insert(teacherClasses).values({ teacherId: user.id, name: body.name }).returning({ id: teacherClasses.id });
    return NextResponse.json({ id: row!.id });
  } catch (err) {
    return handleError(err, 'api.teacher_class_create.failed');
  }
}
