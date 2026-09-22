import { requireInfrastructure } from './guard';

/**
 * Entry point for `npm run test:integration`. Fails loudly when infrastructure
 * is absent so an unconfigured run can never be mistaken for a passing one.
 */
requireInfrastructure();

console.log('Infrastructure detected. Running integration suite…');
const { startVitest } = await import('vitest/node');
const vitest = await startVitest('test', [], { include: ['integration/**/*.test.ts'] });
await vitest?.close();
