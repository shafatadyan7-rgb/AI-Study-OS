/**
 * The `chunk_embeddings.embedding` column is `vector(EMBEDDING_DIM)`, fixed at
 * migration time (see src/db/schema.ts). If EMBEDDING_MODEL is later changed to
 * a model with a different output dimension, every new embedding either fails
 * to insert (dimension mismatch — loud, safe) or, worse, if someone widens the
 * column to match, old and new vectors of different provenance would silently
 * coexist in the same similarity search, degrading retrieval without any error.
 *
 * This module is the single place that knows which model produces which
 * dimension, so that mismatch is caught before a single vector is written,
 * not discovered later as "retrieval quality got worse for no reason."
 */

export interface EmbeddingModelSpec {
  provider: 'voyage' | 'openai';
  model: string;
  dimensions: number;
}

/** Known dimensions for supported models. Extend this when adding a provider —
 *  never infer a dimension from a live API response and trust it silently. */
export const KNOWN_MODELS: EmbeddingModelSpec[] = [
  { provider: 'voyage', model: 'voyage-3', dimensions: 1024 },
  { provider: 'voyage', model: 'voyage-3-lite', dimensions: 512 },
  { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
  { provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072 },
];

export class EmbeddingConfigError extends Error {}

/**
 * Validates that EMBEDDING_PROVIDER + EMBEDDING_MODEL + EMBEDDING_DIM are
 * mutually consistent. Called once at worker/app startup (see index.ts of the
 * worker) so a misconfiguration is a boot-time failure, not a 3am retrieval bug.
 */
export function validateEmbeddingConfig(env: {
  EMBEDDING_PROVIDER?: string;
  EMBEDDING_MODEL?: string;
  EMBEDDING_DIM?: string;
}): EmbeddingModelSpec {
  const provider = env.EMBEDDING_PROVIDER ?? 'voyage';
  const model = env.EMBEDDING_MODEL ?? 'voyage-3';
  const configuredDim = Number(env.EMBEDDING_DIM ?? 1024);

  const known = KNOWN_MODELS.find((m) => m.provider === provider && m.model === model);
  if (!known) {
    throw new EmbeddingConfigError(
      `Unknown embedding model "${model}" for provider "${provider}". ` +
      `Add it to KNOWN_MODELS in src/lib/ai/embedding-config.ts with its real output ` +
      `dimension before using it — never guess.`,
    );
  }
  if (known.dimensions !== configuredDim) {
    throw new EmbeddingConfigError(
      `EMBEDDING_DIM=${configuredDim} does not match ${model}'s real output dimension ` +
      `(${known.dimensions}). The database vector column is fixed at migration time, so a ` +
      `mismatch here means every embedding write will fail, or — if the column was widened ` +
      `to "fix" the error — that old and new vectors will silently corrupt similarity search. ` +
      `Set EMBEDDING_DIM=${known.dimensions}, and if the model actually changed, follow the ` +
      `re-embedding procedure in README.md before switching production traffic.`,
    );
  }
  return known;
}

/**
 * Whether switching to a new model requires re-embedding existing chunks.
 * True whenever the model identity differs — dimension staying the same by
 * coincidence does not make two different models' vectors comparable.
 */
export function requiresReembedding(previousModel: string | null, nextModel: string): boolean {
  return previousModel !== null && previousModel !== nextModel;
}
