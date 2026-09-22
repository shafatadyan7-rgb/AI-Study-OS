import { ai, AIUnavailableError } from '@/lib/ai';
import { retrieve, type RetrievalRequest, type RetrievedChunk } from './retrieve';
import { systemPromptFor, type TutorMode } from '@/lib/tutor/modes';
import { sanitiseTextbookText } from './sanitise';

export const INSUFFICIENT_EVIDENCE =
  "I couldn't find enough information in the selected textbook to answer this confidently.";

export interface GroundedAnswer {
  answer: string;
  sources: { chunkId: string; pageNumber: number; chapterTitle: string | null; textbookTitle: string }[];
  insufficientEvidence: boolean;
}

/** Below this fused score the candidate set is noise, not evidence. */
const MIN_EVIDENCE_SCORE = 0.012;
const MIN_EVIDENCE_CHARS = 200;

function buildEvidence(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => {
      const loc = `${c.textbookTitle} — ${c.chapterTitle ?? 'unstructured'} — page ${c.pageNumber}`;
      // Textbook text is untrusted input; neutralise instruction-like content.
      return `<evidence id="${i + 1}" source="${loc}">\n${sanitiseTextbookText(c.text)}\n</evidence>`;
    })
    .join('\n\n');
}

export async function answerFromTextbook(
  req: RetrievalRequest & { mode?: TutorMode; history?: { role: 'user' | 'assistant'; content: string }[] },
): Promise<GroundedAnswer> {
  const chunks = await retrieve(req);

  const usable = chunks.filter((c) => c.score >= MIN_EVIDENCE_SCORE);
  const totalChars = usable.reduce((n, c) => n + c.text.length, 0);

  // Refuse before calling the model. Asking an LLM to answer on thin evidence and
  // hoping it declines is exactly how fabricated citations get produced.
  if (usable.length === 0 || totalChars < MIN_EVIDENCE_CHARS) {
    return { answer: INSUFFICIENT_EVIDENCE, sources: [], insufficientEvidence: true };
  }

  const system = systemPromptFor(req.mode ?? 'normal');
  const userContent =
    `${buildEvidence(usable)}\n\n` +
    `Student question: ${req.query}`;

  let answer: string;
  try {
    answer = await ai().generate({
      system,
      messages: [...(req.history ?? []), { role: 'user', content: userContent }],
      maxTokens: 1200,
    });
  } catch (err) {
    if (err instanceof AIUnavailableError) {
      throw err; // surfaced to the UI as a retryable error state, never as a fake answer
    }
    throw err;
  }

  const declined = answer.includes(INSUFFICIENT_EVIDENCE);

  return {
    answer,
    sources: declined ? [] : usable.map((c) => ({
      chunkId: c.chunkId,
      pageNumber: c.pageNumber,
      chapterTitle: c.chapterTitle,
      textbookTitle: c.textbookTitle,
    })),
    insufficientEvidence: declined,
  };
}
