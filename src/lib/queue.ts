import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const TEXTBOOK_QUEUE = 'textbook-processing';

let _connection: IORedis | null = null;
export function redis(): IORedis {
  if (_connection) return _connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not configured (see .env.example).');
  // BullMQ requires this setting on the shared connection.
  _connection = new IORedis(url, { maxRetriesPerRequest: null });
  return _connection;
}

let _queue: Queue | null = null;
export function textbookQueue(): Queue {
  if (_queue) return _queue;
  _queue = new Queue(TEXTBOOK_QUEUE, {
    connection: redis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
  return _queue;
}
