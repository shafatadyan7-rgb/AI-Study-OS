import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.query.projects.findMany({
      where: eq(projects.ownerId, user.id), orderBy: [desc(projects.updatedAt)],
    });
    return NextResponse.json(rows.map((r) => ({
      ...r, deadline: r.deadline?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    })));
  } catch (err) {
    return handleError(err, 'api.projects_list.failed');
  }
}

const Body = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  deadline: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = Body.parse(await req.json());
    const [row] = await db.insert(projects).values({
      ownerId: user.id, title: body.title, description: body.description ?? null,
      deadline: body.deadline ? new Date(body.deadline) : null,
    }).returning({ id: projects.id });
    return NextResponse.json({ id: row!.id });
  } catch (err) {
    return handleError(err, 'api.projects_create.failed');
  }
}
