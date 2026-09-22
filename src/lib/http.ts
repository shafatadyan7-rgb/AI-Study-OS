import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from '@/lib/auth/guard';
import { AIUnavailableError } from '@/lib/ai';
import { log } from '@/lib/log';

/**
 * Single error boundary for every route. Client-facing messages are actionable
 * and never leak internals; the detail goes to structured logs instead.
 */
export function handleError(err: unknown, event: string) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'That request was not valid.', issues: err.flatten().fieldErrors },
      { status: 400 },
    );
  }
  if (err instanceof AIUnavailableError) {
    return NextResponse.json(
      { error: 'The AI service is temporarily unavailable. Please try again.', retryable: true },
      { status: 503 },
    );
  }
  log.error(event, { error: (err as Error).message, stack: (err as Error).stack });
  return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
}
