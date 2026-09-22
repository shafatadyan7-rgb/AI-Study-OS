/**
 * Refuses to run integration tests without real infrastructure, rather than
 * letting them skip silently and be mistaken for a green suite.
 */
export function requireInfrastructure(): void {
  const missing = ['DATABASE_URL', 'REDIS_URL', 'S3_BUCKET', 'EMBEDDING_API_KEY']
    .filter((k) => !process.env[k]);

  if (missing.length > 0) {
    throw new Error(
      `Integration tests need real services. Missing: ${missing.join(', ')}.\n` +
      `See integration/README.md. These tests are NOT passing until they are run.`,
    );
  }
}
