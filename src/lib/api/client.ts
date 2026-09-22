import { z } from 'zod';
import {
  Textbook, TextbookStatus, AskResponse, UploadTicket, Chapter, Page,
  MasteryRow, CoachCard, GraphResponse, FlashcardDue, QuizSet, QuizAnswerResult,
  MistakeRow, PlannerResponse, AnalyticsResponse, NoteRow, AchievementsResponse,
  SkillRow, CareerRow, ProjectRow, ScannerResult, type Scope,
} from '@/types/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryable = false,
  ) { super(message); }

  get isUnauthorized() { return this.status === 401; }
  get isForbidden() { return this.status === 403; }
  get isRateLimited() { return this.status === 429; }
}

/**
 * Single fetch chokepoint. Every call validates the response against the shared
 * schema, so a backend shape change surfaces here as a clear error instead of
 * as `undefined` rendering somewhere deep in a component.
 */
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection.', true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = typeof body.error === 'string' ? body.error : 'Something went wrong.';
    throw new ApiError(res.status, message, res.status >= 500 || res.status === 429);
  }

  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(500, 'The server returned an unexpected response.');
  }
  return parsed.data;
}

export const api = {
  textbooks: {
    list: () => request('/api/textbooks', z.array(Textbook)),

    status: (id: string) => request(`/api/textbooks/${id}/status`, TextbookStatus),

    chapters: (id: string) => request(`/api/textbooks/${id}/chapters`, z.array(Chapter)),

    page: (id: string, pageNumber: number) =>
      request(`/api/textbooks/${id}/pages/${pageNumber}`, Page),

    requestUpload: (body: { title: string; byteSize: number; classLabel?: string }) =>
      request('/api/textbooks/upload-url', UploadTicket, {
        method: 'POST', body: JSON.stringify(body),
      }),

    /**
     * Uploads straight to object storage using the presigned URL, then tells the
     * API the bytes have landed so the processing job can be queued. The PDF
     * never passes through the Next.js server.
     */
    upload: async (file: File, classLabel?: string) => {
      const ticket = await api.textbooks.requestUpload({
        title: file.name.replace(/\.pdf$/i, ''),
        byteSize: file.size,
        classLabel,
      });
      const put = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });
      if (!put.ok) throw new ApiError(put.status, 'The file could not be uploaded to storage.', true);

      await request(`/api/textbooks/${ticket.textbookId}/enqueue`, z.object({ queued: z.boolean() }), {
        method: 'POST', body: JSON.stringify({ jobId: ticket.jobId }),
      });
      return ticket;
    },

    remove: (id: string) =>
      request(`/api/textbooks/${id}`, z.object({ deleted: z.boolean() }), { method: 'DELETE' }),
  },

  tutor: {
    ask: (body: {
      query: string; scope: Scope; textbookId?: string;
      chapterId?: string; pageNumber?: number; mode?: string; sessionId?: string;
    }) => request('/api/ask', AskResponse, { method: 'POST', body: JSON.stringify(body) }),

    /**
     * Streaming variant. Yields text deltas as they arrive; the final message
     * carries the citations, which are always produced server-side.
     */
    async *askStream(body: {
      query: string; scope: Scope; textbookId?: string;
      chapterId?: string; pageNumber?: number; mode?: string; sessionId?: string;
    }): AsyncGenerator<{ delta?: string; done?: AskResponse }> {
      const res = await fetch('/api/ask/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new ApiError(res.status, err.error ?? 'The tutor stream could not start.', true);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));
          yield payload;
        }
      }
    },
  },

  mastery: {
    forTextbook: (textbookId: string) =>
      request(`/api/mastery?textbookId=${textbookId}`, z.array(MasteryRow)),
  },

  coach: {
    today: () => request('/api/coach/today', CoachCard),
  },

  knowledge: {
    graph: (textbookId: string) =>
      request(`/api/knowledge/${textbookId}`, GraphResponse),
  },

  focus: {
    start: (body: { activity: string; textbookId?: string; chapterId?: string }) =>
      request('/api/focus/start', z.object({ sessionId: z.string().uuid() }), {
        method: 'POST', body: JSON.stringify(body),
      }),
    finish: (body: { sessionId: string; reflection?: string; confidence?: number }) =>
      request('/api/focus/finish', z.object({ durationSeconds: z.number().int() }), {
        method: 'POST', body: JSON.stringify(body),
      }),
  },
  flashcards: {
    due: (chapterId: string) =>
      request(`/api/flashcards?chapterId=${chapterId}`, z.array(FlashcardDue)),

    generate: (chapterId: string, count = 15) =>
      request('/api/flashcards', z.array(z.object({
        id: z.string().uuid(), front: z.string(), back: z.string(), kind: z.string(),
      })), { method: 'POST', body: JSON.stringify({ chapterId, count }) }),

    review: (id: string, grade: 0 | 3 | 5) =>
      request(`/api/flashcards/${id}/review`, z.object({
        nextReviewAt: z.string(), bucket: z.enum(['review_now', 'review_soon', 'strong']),
      }), { method: 'POST', body: JSON.stringify({ grade }) }),
  },

  quiz: {
    generate: (body: { chapterId: string; count?: number; difficulty?: 'easy' | 'medium' | 'hard'; kind?: 'quiz' | 'exam' | 'targeted_practice' }) =>
      request('/api/quiz/generate', QuizSet, { method: 'POST', body: JSON.stringify(body) }),

    answer: (attemptId: string, body: { questionId: string; optionId: string; secondsSpent?: number }) =>
      request(`/api/quiz/${attemptId}/answer`, QuizAnswerResult, { method: 'POST', body: JSON.stringify(body) }),

    finish: (attemptId: string) =>
      request(`/api/quiz/${attemptId}/finish`, z.object({ score: z.number().int(), total: z.number().int() }), { method: 'POST' }),
  },

  mistakes: {
    list: (textbookId?: string) =>
      request(`/api/mistakes${textbookId ? `?textbookId=${textbookId}` : ''}`, z.array(MistakeRow)),

    practiceTarget: () =>
      request('/api/mistakes/practice', z.object({ chapterId: z.string().uuid(), mistakeWeight: z.number() })),
  },

  planner: {
    get: () => request('/api/planner', PlannerResponse),

    generate: (body: { dailyMinutes?: number; horizonDays?: number; examDateId?: string }) =>
      request('/api/planner/generate', z.object({ planId: z.string().uuid(), itemCount: z.number().int() }), {
        method: 'POST', body: JSON.stringify(body),
      }),

    complete: (itemId: string, completed: boolean) =>
      request(`/api/planner/${itemId}`, z.object({ ok: z.boolean() }), {
        method: 'PATCH', body: JSON.stringify({ completed }),
      }),
  },

  analytics: {
    summary: () => request('/api/analytics', AnalyticsResponse),
  },

  auth: {
    logout: () => request('/api/auth/logout', z.object({ ok: z.boolean() }), { method: 'POST' }),
  },
  notes: {
    list: (params?: { textbookId?: string; chapterId?: string; q?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return request(`/api/notes${qs ? `?${qs}` : ''}`, z.array(NoteRow));
    },
    create: (body: { title: string; body?: string; textbookId?: string; chapterId?: string }) =>
      request('/api/notes', z.object({ id: z.string().uuid() }), { method: 'POST', body: JSON.stringify(body) }),
    generate: (body: { chapterId: string; mode?: string }) =>
      request('/api/notes/generate', z.object({ id: z.string().uuid(), body: z.string() }), {
        method: 'POST', body: JSON.stringify(body),
      }),
    update: (id: string, patch: { title?: string; body?: string; pinned?: boolean; favorite?: boolean }) =>
      request(`/api/notes/${id}`, z.object({ ok: z.boolean() }), { method: 'PATCH', body: JSON.stringify(patch) }),
    remove: (id: string) =>
      request(`/api/notes/${id}`, z.object({ deleted: z.boolean() }), { method: 'DELETE' }),
  },

  achievements: {
    list: () => request('/api/achievements', AchievementsResponse),
  },

  skills: {
    list: () => request('/api/skills', z.array(SkillRow)),
  },

  career: {
    list: () => request('/api/career', z.array(CareerRow)),
  },

  projects: {
    list: () => request('/api/projects', z.array(ProjectRow)),
    create: (body: { title: string; description?: string; deadline?: string }) =>
      request('/api/projects', z.object({ id: z.string().uuid() }), { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, patch: Partial<{ title: string; description: string; status: ProjectRow['status']; deadline: string | null }>) =>
      request(`/api/projects/${id}`, z.object({ ok: z.boolean() }), { method: 'PATCH', body: JSON.stringify(patch) }),
    remove: (id: string) =>
      request(`/api/projects/${id}`, z.object({ deleted: z.boolean() }), { method: 'DELETE' }),
  },

  scanner: {
    solve: (body: { imageBase64: string; depth?: 'hint' | 'step_by_step' | 'full_solution'; textbookId?: string }) =>
      request('/api/scanner', ScannerResult, { method: 'POST', body: JSON.stringify(body) }),
  },
};