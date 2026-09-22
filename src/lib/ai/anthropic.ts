import Anthropic from '@anthropic-ai/sdk';
import { AIUnavailableError, type AIProvider, type GenerateOptions } from './provider';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(opts: GenerateOptions): Promise<string> {
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: opts.maxTokens ?? 1500,
        temperature: opts.temperature ?? 0.2,
        system: opts.system,
        messages: opts.messages,
      });
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
    } catch (err) {
      throw new AIUnavailableError('The AI service did not respond.', err);
    }
  }

  async *stream(opts: GenerateOptions): AsyncIterable<string> {
    try {
      const s = this.client.messages.stream({
        model: this.model,
        max_tokens: opts.maxTokens ?? 1500,
        temperature: opts.temperature ?? 0.2,
        system: opts.system,
        messages: opts.messages,
      });
      for await (const event of s) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } catch (err) {
      throw new AIUnavailableError('The AI stream was interrupted.', err);
    }
  }
}
