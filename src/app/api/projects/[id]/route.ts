import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { projects } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

const Body = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  status: z.enum(['idea', 'planning', 'in_progress', 'completed']).optional(),
  deadline: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = Body.parse(await req.json());

    const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
    assertOwnership(user, project);

    await db.update(projects).set({
      ...body, deadline: body.deadline !== undefined ? (body.deadline ? new Date(body.deadline) : null) : undefined,
      updatedAt: new Date(),
    }).where(eq(projects.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, 'api.projects_patch.failed');
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
    assertOwnership(user, project);
    await db.delete(projects).where(eq(projects.id, id));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleError(err, 'api.projects_delete.failed');
  }
}
