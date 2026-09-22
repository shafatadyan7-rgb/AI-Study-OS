import { AnthropicProvider } from './anthropic';
import { VoyageEmbeddings, OpenAIEmbeddings } from './embeddings';
import { validateEmbeddingConfig } from './embedding-config';
import type { AIProvider, EmbeddingProvider } from './provider';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not configured. AI StudyOS does not fall back to fabricated output — ` +
      `set ${name} in your environment (see .env.example).`,
    );
  }
  return v;
}

let _ai: AIProvider | null = null;
let _embed: EmbeddingProvider | null = null;

export function ai(): AIProvider {
  if (_ai) return _ai;
  const provider = process.env.AI_PROVIDER ?? 'anthropic';
  switch (provider) {
    case 'anthropic':
      _ai = new AnthropicProvider(required('AI_API_KEY'), process.env.AI_MODEL ?? 'claude-sonnet-4-6');
      return _ai;
    default:
      throw new Error(`Unknown AI_PROVIDER "${provider}".`);
  }
}

export function embeddings(): EmbeddingProvider {
  if (_embed) return _embed;
  // Validated first: a dimension mismatch must fail loudly here, before any
  // vector is written, not surface later as silently degraded retrieval.
  const spec = validateEmbeddingConfig({
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
    EMBEDDING_DIM: process.env.EMBEDDING_DIM,
  });
  const apiKey = required('EMBEDDING_API_KEY');
  _embed = spec.provider === 'voyage'
    ? new VoyageEmbeddings(apiKey, spec.model, spec.dimensions)
    : new OpenAIEmbeddings(apiKey, spec.model, spec.dimensions);
  return _embed;
}

export * from './provider';
