/**
 * Provider-agnostic AI interface. Nothing above this layer imports a vendor SDK,
 * so swapping providers is a one-file change in ./index.ts.
 */
export interface GenerateOptions {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  readonly name: string;
  generate(opts: GenerateOptions): Promise<string>;
  stream(opts: GenerateOptions): AsyncIterable<string>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  /** Batch embed. Implementations must preserve input order. */
  embed(texts: string[], kind: 'document' | 'query'): Promise<number[][]>;
}

export class AIUnavailableError extends Error {
  constructor(message: string, public cause?: unknown) { super(message); }
}
