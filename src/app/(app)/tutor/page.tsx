'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import type { Textbook } from '@/types/api';

/**
 * The tutor needs a textbook to ground itself in — there is no ungrounded
 * "just chat" mode, since that is exactly the fabrication risk the product
 * exists to avoid. This page routes to a ready textbook's reader, or explains
 * why there isn't one yet.
 */
export default function TutorLandingPage() {
  const router = useRouter();
  const [books, setBooks] = useState<Textbook[] | null>(null);

  useEffect(() => { api.textbooks.list().then(setBooks).catch(() => setBooks([])); }, []);

  useEffect(() => {
    const ready = books?.find((b) => b.status === 'ready');
    if (ready) router.replace(`/textbooks/${ready.id}`);
  }, [books, router]);

  if (books === null) return <p className="muted">Loading…</p>;
  if (books.some((b) => b.status === 'ready')) return <p className="muted">Opening your textbook…</p>;

  return (
    <div className="empty">
      <div className="big">No textbook is ready yet</div>
      <p style={{ marginBottom: 14 }}>The AI tutor answers from your own textbook, so upload one first.</p>
      <Link href="/textbooks" className="btn primary">Upload a textbook</Link>
    </div>
  );
}
