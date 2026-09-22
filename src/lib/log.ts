type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured JSON logging. Textbook text is never logged — only identifiers,
 * counts and timings, so logs cannot become a copy of a user's private book.
 */
function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (e: string, f?: Record<string, unknown>) => emit('debug', e, f),
  info: (e: string, f?: Record<string, unknown>) => emit('info', e, f),
  warn: (e: string, f?: Record<string, unknown>) => emit('warn', e, f),
  error: (e: string, f?: Record<string, unknown>) => emit('error', e, f),
};

export async function timed<T>(event: string, fn: () => Promise<T>, fields: Record<string, unknown> = {}): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    log.info(event, { ...fields, ms: Date.now() - start, ok: true });
    return result;
  } catch (err) {
    log.error(event, { ...fields, ms: Date.now() - start, ok: false, error: (err as Error).message });
    throw err;
  }
}
