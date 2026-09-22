import { Worker } from 'bullmq';
import { redis, TEXTBOOK_QUEUE } from '@/lib/queue';
import { processTextbook, type ProcessTextbookPayload } from './jobs/process-textbook';
import { log } from '@/lib/log';

/**
 * Standalone worker process: `npm run worker`.
 * Concurrency is low by default because PDF extraction and OCR are CPU-bound —
 * raise it only on a host with cores to spare.
 */
const worker = new Worker<ProcessTextbookPayload>(
  TEXTBOOK_QUEUE,
  async (job) => processTextbook(job.data),
  { connection: redis(), concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) },
);

worker.on('failed', (job, err) => {
  log.error('worker.job_failed', { jobId: job?.id, attempts: job?.attemptsMade, error: err.message });
});
worker.on('completed', (job) => {
  log.info('worker.job_completed', { jobId: job.id });
});

log.info('worker.started', { queue: TEXTBOOK_QUEUE });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    log.info('worker.shutdown', { signal });
    await worker.close();
    process.exit(0);
  });
}
