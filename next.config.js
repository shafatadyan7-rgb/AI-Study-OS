/** @type {import('next').NextConfig} */
const nextConfig = {
  // BullMQ optionally tries to resolve @valkey/valkey-glide, an alternate
  // Redis client it doesn't require. Webpack can't resolve that optional
  // peer and emits a build warning even though BullMQ falls back to its
  // standard (already-installed) ioredis client at runtime with no behavior
  // change. Marking these as external server packages tells Next.js to
  // require() them at runtime instead of bundling them — the correct way
  // to ship packages with optional peers / native bindings on a Node server,
  // and the fix for the warning with zero change to runtime behavior.
  serverExternalPackages: ['bullmq', 'ioredis', 'pg'],
};

module.exports = nextConfig;