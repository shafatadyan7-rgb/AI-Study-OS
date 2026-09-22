import { AIUnavailableError, type EmbeddingProvider } from './provider';

/** Voyage AI — strong multilingual retrieval quality, which matters for Bangla. */
export class VoyageEmbeddings implements EmbeddingProvider {
  readonly name = 'voyage';
  constructor(
    private apiKey: string,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  async embed(texts: string[], kind: 'document' | 'query'): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts, input_type: kind }),
    });
    if (!res.ok) throw new AIUnavailableError(`Embedding request failed (${res.status}).`);
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    // API may return out of order; restore input order explicitly.
    const out = new Array<number[]>(texts.length);
    for (const d of json.data) out[d.index] = d.embedding;
    return out;
  }
}

export class OpenAIEmbeddings implements EmbeddingProvider {
  readonly name = 'openai';
  constructor(
    private apiKey: string,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts, dimensions: this.dimensions }),
    });
    if (!res.ok) throw new AIUnavailableError(`Embedding request failed (${res.status}).`);
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    const out = new Array<number[]>(texts.length);
    for (const d of json.data) out[d.index] = d.embedding;
    return out;
  }
}
