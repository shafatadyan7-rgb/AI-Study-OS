/**
 * Translates a raw error (a network failure, a technical status message) into
 * copy a presenter can read aloud in front of an audience — without hiding
 * what actually went wrong. The technical string is always preserved and
 * returned alongside the friendly one; callers decide whether to show it
 * (typically behind a "Technical details" disclosure), never to discard it.
 */
export interface FriendlyError {
  headline: string;
  detail: string;
  technical: string;
  retryable: boolean;
}

const PATTERNS: { test: RegExp; headline: string; detail: string; retryable: boolean }[] = [
  {
    test: /ECONNREFUSED|fetch failed|NetworkError|Failed to fetch/i,
    headline: "Couldn't reach the learning service.",
    detail: 'The connection to AI StudyOS was refused. This usually means a backend service is not running.',
    retryable: true,
  },
  {
    test: /timed? ?out|ETIMEDOUT/i,
    headline: 'The request took too long.',
    detail: 'The learning service did not respond in time.',
    retryable: true,
  },
  {
    test: /50[0-9]|internal server error/i,
    headline: 'Something went wrong on our side.',
    detail: 'The server encountered an unexpected error while handling this request.',
    retryable: true,
  },
  {
    test: /429|too many requests|rate limit/i,
    headline: 'Slow down a moment.',
    detail: "You've made a lot of requests in a short time. Wait a few seconds and try again.",
    retryable: true,
  },
  {
    test: /401|unauthorized|sign in/i,
    headline: 'Please sign in again.',
    detail: 'Your session could not be verified.',
    retryable: false,
  },
  {
    test: /403|forbidden|not yours/i,
    headline: "That isn't available to you.",
    detail: 'This resource does not belong to your account.',
    retryable: false,
  },
  {
    test: /404|not found/i,
    headline: "That couldn't be found.",
    detail: 'The requested item does not exist or was removed.',
    retryable: false,
  },
  {
    test: /AI_API_KEY|EMBEDDING_API_KEY|not configured/i,
    headline: 'The AI service is not fully configured.',
    detail: 'A required API key is missing on the server.',
    retryable: false,
  },
];

export function toFriendlyError(err: unknown): FriendlyError {
  const technical = err instanceof Error ? err.message : String(err);
  for (const p of PATTERNS) {
    if (p.test.test(technical)) {
      return { headline: p.headline, detail: p.detail, technical, retryable: p.retryable };
    }
  }
  // Unknown errors: the message from the API is usually already
  // student-appropriate (our own routes write plain-language messages), so
  // show it directly rather than a generic wrapper that would hide detail.
  return {
    headline: 'AI StudyOS ran into a problem.',
    detail: technical,
    technical,
    retryable: true,
  };
}
