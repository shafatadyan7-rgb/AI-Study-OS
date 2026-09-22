import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { notes } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { handleError } from '@/lib/http';

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(20000).optional(),
  pinned: z.boolean().optional(),
  favorite: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const patch = PatchBody.parse(await req.json());

    const note = await db.query.notes.findFirst({ where: eq(notes.id, id) });
    assertOwnership(user, note);

    await db.update(notes).set({ ...patch, updatedAt: new Date() }).where(eq(notes.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, 'api.notes_patch.failed');
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const note = await db.query.notes.findFirst({ where: eq(notes.id, id) });
    assertOwnership(user, note);
    await db.delete(notes).where(eq(notes.id, id));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleError(err, 'api.notes_delete.failed');
  }
}
