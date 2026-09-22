import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { textbooks } from '@/db/schema';
import { requireUser, assertOwnership } from '@/lib/auth/guard';
import { deleteObject } from '@/lib/storage/s3';
import { handleError } from '@/lib/http';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;
    const book = await db.query.textbooks.findFirst({ where: eq(textbooks.id, id) });
    assertOwnership(user, book);

    // Row deletion cascades to pages/chapters/chunks/embeddings/attempts/etc.
    // via the schema's ON DELETE CASCADE — the object in storage does not
    // cascade automatically, so it is removed explicitly.
    await db.delete(textbooks).where(eq(textbooks.id, id));
    if (book!.storageKey !== 'pending') {
      await deleteObject(book!.storageKey).catch(() => {
        // Best-effort: the DB row is already gone, which is what ownership and
        // listing depend on. An orphaned object is a storage cleanup concern,
        // not a correctness one, and is logged by deleteObject's caller stack.
      });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleError(err, 'api.textbook_delete.failed');
  }
}
