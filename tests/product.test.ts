import { describe, it, expect } from 'vitest';
import { buildKnowledgeGraph, extractConcepts, type GraphSourceChunk } from '@/lib/knowledge/graph';
import {
  accuracy, accuracyDelta, accuracyTrend, studyMinutesTrend,
  mistakeBreakdown, currentStreak,
} from '@/lib/analytics/aggregate';
import {
  parseQuestion, detectLanguage, detectSubject, extractKnownValues,
  isNumericalQuestion, solveInstruction,
} from '@/lib/scanner/question';
import {
  projectForRole, canReportAggregate, ALWAYS_PRIVATE, MIN_COHORT_FOR_AGGREGATE,
} from '@/lib/privacy/visibility';
import { DEMO_PAGES, DEMO_SCRIPT } from '@/lib/demo/seed-data';

const DAY = 86_400_000;
const NOW = new Date('2026-06-10T12:00:00Z');

function chunk(over: Partial<GraphSourceChunk> = {}): GraphSourceChunk {
  return {
    chunkId: 'k1', chapterId: 'ch1', chapterTitle: 'Motion',
    section: '1.2 Speed and Velocity', pageNumber: 2,
    text: 'Velocity is defined as the rate of change of displacement.',
    sourceType: 'definition', ...over,
  };
}

describe('concept extraction', () => {
  it('extracts terms the textbook explicitly defines', () => {
    const concepts = extractConcepts('Velocity is defined as the rate of change of displacement.');
    expect(concepts).toContain('Velocity');
  });

  it('does not invent concepts from ordinary prose', () => {
    expect(extractConcepts('The runner went around the track twice in the morning.')).toHaveLength(0);
  });

  it('rejects stopword-headed fragments', () => {
    expect(extractConcepts('This is defined as something vague.')).toHaveLength(0);
  });

  it('handles Bangla definition phrasing', () => {
    const concepts = extractConcepts('সরণ কে বলা হয়');
    expect(concepts.length).toBeGreaterThan(0);
  });
});

describe('knowledge graph', () => {
  it('builds chapter -> section -> concept containment from real structure', () => {
    const graph = buildKnowledgeGraph([chunk()]);
    const kinds = graph.nodes.map((n) => n.kind);
    expect(kinds).toContain('chapter');
    expect(kinds).toContain('section');
    expect(kinds).toContain('concept');
    expect(graph.edges.some((e) => e.kind === 'contains')).toBe(true);
  });

  it('records only pages the concept actually appears on', () => {
    const graph = buildKnowledgeGraph([chunk({ pageNumber: 2 })]);
    const concept = graph.nodes.find((n) => n.kind === 'concept');
    expect(concept!.pages).toEqual([2]);
  });

  it('does not create a co-occurrence edge from a single incidental mention', () => {
    const graph = buildKnowledgeGraph([
      chunk({ text: 'Speed is defined as distance per unit time. Velocity is defined as rate of change of displacement.' }),
    ]);
    expect(graph.edges.filter((e) => e.kind === 'co_occurs')).toHaveLength(0);
  });

  it('creates a co-occurrence edge once the pairing is repeatedly attested', () => {
    const text = 'Speed is defined as distance per unit time. Velocity is defined as rate of change of displacement.';
    const graph = buildKnowledgeGraph([
      chunk({ chunkId: 'a', text, pageNumber: 2 }),
      chunk({ chunkId: 'b', text, pageNumber: 3 }),
    ]);
    expect(graph.edges.some((e) => e.kind === 'co_occurs')).toBe(true);
  });

  it('produces no concept nodes for a textbook with no definitions', () => {
    const graph = buildKnowledgeGraph([chunk({ text: 'Some ordinary narrative text about a journey.' })]);
    expect(graph.nodes.filter((n) => n.kind === 'concept')).toHaveLength(0);
  });

  it('never emits an edge referencing a node it did not create', () => {
    const graph = buildKnowledgeGraph([chunk(), chunk({ chunkId: 'c2', pageNumber: 3 })]);
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(ids.has(e.from) || ids.has(e.to)).toBe(true);
    }
  });
});

describe('analytics honesty', () => {
  const attempt = (daysAgo: number, correct: boolean) => ({
    answeredAt: new Date(NOW.getTime() - daysAgo * DAY),
    isCorrect: correct,
    chapterId: 'ch1',
  });

  it('returns NOT ENOUGH DATA for accuracy below the minimum sample', () => {
    expect(accuracy([attempt(0, true), attempt(0, true)])).toBeNull();
  });

  it('computes accuracy once there is enough evidence', () => {
    const rows = [true, true, true, false, false].map((c) => attempt(0, c));
    expect(accuracy(rows)).toBeCloseTo(0.6);
  });

  it('refuses an improvement figure when either half is too thin', () => {
    const rows = Array.from({ length: 6 }, (_, i) => attempt(i, true));
    expect(accuracyDelta(rows)).toBeNull();
  });

  it('reports a real improvement when both halves are well evidenced', () => {
    const early = Array.from({ length: 6 }, (_, i) => attempt(20 - i, false));
    const late = Array.from({ length: 6 }, (_, i) => attempt(5 - i, true));
    expect(accuracyDelta([...early, ...late])!).toBeGreaterThan(0.5);
  });

  it('returns NOT ENOUGH DATA for a trend spanning too few days', () => {
    const sessions = [{ startedAt: NOW, durationSeconds: 1800 }];
    expect(studyMinutesTrend(sessions)).toBeNull();
  });

  it('builds a study trend across enough distinct days', () => {
    const sessions = [0, 1, 2, 3].map((d) => ({
      startedAt: new Date(NOW.getTime() - d * DAY), durationSeconds: 1800,
    }));
    const trend = studyMinutesTrend(sessions)!;
    expect(trend).toHaveLength(4);
    expect(trend[0]!.value).toBe(30);
  });

  it('returns NOT ENOUGH DATA for an accuracy trend with sparse days', () => {
    expect(accuracyTrend([attempt(0, true)])).toBeNull();
  });

  it('returns NOT ENOUGH DATA rather than an empty mistake chart', () => {
    expect(mistakeBreakdown([])).toBeNull();
  });

  it('ranks mistake categories by real frequency', () => {
    const rows = [
      { kind: 'calculation', resolved: false },
      { kind: 'calculation', resolved: false },
      { kind: 'conceptual', resolved: false },
    ];
    expect(mistakeBreakdown(rows)![0]).toEqual({ kind: 'calculation', count: 2 });
  });

  it('counts a streak of consecutive study days', () => {
    const sessions = [0, 1, 2].map((d) => ({
      startedAt: new Date(NOW.getTime() - d * DAY), durationSeconds: 600,
    }));
    expect(currentStreak(sessions, NOW)).toBe(3);
  });

  it('does not break the streak before today has had a chance', () => {
    const sessions = [1, 2].map((d) => ({
      startedAt: new Date(NOW.getTime() - d * DAY), durationSeconds: 600,
    }));
    expect(currentStreak(sessions, NOW)).toBe(2);
  });

  it('ends the streak at a real gap', () => {
    const sessions = [0, 1, 5].map((d) => ({
      startedAt: new Date(NOW.getTime() - d * DAY), durationSeconds: 600,
    }));
    expect(currentStreak(sessions, NOW)).toBe(2);
  });

  it('reports zero streak with no sessions at all', () => {
    expect(currentStreak([], NOW)).toBe(0);
  });
});

describe('question scanner', () => {
  it('detects English, Bangla and mixed input', () => {
    expect(detectLanguage('What is the velocity of the car?')).toBe('en');
    expect(detectLanguage('গাড়িটির বেগ কত?')).toBe('bn');
    expect(detectLanguage('এই question টার velocity বের করো')).toBe('mixed');
  });

  it('identifies subject from domain vocabulary in either script', () => {
    expect(detectSubject('Find the acceleration given force and mass')).toBe('physics');
    expect(detectSubject('সমীকরণটি সমাধান করো')).toBe('mathematics');
    expect(detectSubject('Write about your holiday')).toBe('unknown');
  });

  it('extracts labelled known values from a word problem', () => {
    const values = extractKnownValues('Given mass = 4 kg and force = 20 N, find acceleration.');
    expect(values.map((v) => v.label)).toContain('mass');
    expect(values.find((v) => v.label === 'force')!.value).toContain('20');
  });

  it('distinguishes numerical from conceptual questions', () => {
    expect(isNumericalQuestion('A body of mass 4 kg experiences 20 N of force')).toBe(true);
    expect(isNumericalQuestion('Explain why inertia depends on mass')).toBe(false);
  });

  it('parses a full question into structured fields', () => {
    const parsed = parseQuestion('  A force = 20 N acts on mass = 4 kg.  Find acceleration. ');
    expect(parsed.subject).toBe('physics');
    expect(parsed.isNumerical).toBe(true);
    expect(parsed.knownValues.length).toBeGreaterThan(0);
    expect(parsed.text).not.toMatch(/\s{2,}/);
  });

  it('withholds the answer at hint depth', () => {
    const parsed = parseQuestion('force = 20 N, mass = 4 kg, find acceleration');
    const instruction = solveInstruction(parsed, 'hint');
    expect(instruction).toMatch(/ONE hint only/);
    expect(instruction).toMatch(/Do not reveal/);
  });

  it('stops short of the final step at step_by_step depth', () => {
    const parsed = parseQuestion('force = 20 N, mass = 4 kg, find acceleration');
    expect(solveInstruction(parsed, 'step_by_step')).toMatch(/Stop before stating the final answer/);
  });

  it('only gives a complete solution at full_solution depth', () => {
    const parsed = parseQuestion('force = 20 N, mass = 4 kg, find acceleration');
    expect(solveInstruction(parsed, 'full_solution')).toMatch(/complete worked solution/);
  });

  it('orders numerical solving through formula before calculation', () => {
    const parsed = parseQuestion('force = 20 N, mass = 4 kg, find acceleration');
    const text = solveInstruction(parsed, 'full_solution');
    expect(text.indexOf('formula')).toBeLessThan(text.indexOf('calculate'));
  });
});

describe('teacher and parent privacy', () => {
  const studentRecord = {
    displayName: 'Rafi',
    accuracy: 0.72,
    studyMinutes: 320,
    aiMessages: ['private conversation content'],
    notes: ['private note'],
    email: 'rafi@example.test',
    passwordHash: 'scrypt$...',
  };

  it('never exposes AI conversations to a teacher', () => {
    const projected = projectForRole(studentRecord, 'teacher');
    expect(projected.aiMessages).toBeUndefined();
  });

  it('never exposes private notes to a parent', () => {
    const projected = projectForRole(studentRecord, 'parent');
    expect(projected.notes).toBeUndefined();
  });

  it('never leaks credentials or email through any role projection', () => {
    for (const role of ['teacher', 'parent', 'admin', 'student'] as const) {
      const projected = projectForRole(studentRecord, role);
      expect(projected.passwordHash).toBeUndefined();
      expect(projected.email).toBeUndefined();
    }
  });

  it('gives a teacher performance fields but not wellbeing-time fields', () => {
    const projected = projectForRole(studentRecord, 'teacher');
    expect(projected.accuracy).toBe(0.72);
    expect(projected.studyMinutes).toBeUndefined();
  });

  it('gives a parent time and consistency but not question-level accuracy', () => {
    const projected = projectForRole(studentRecord, 'parent');
    expect(projected.studyMinutes).toBe(320);
    expect(projected.accuracy).toBeUndefined();
  });

  it('keeps the always-private list free of any teacher-visible field', () => {
    const teacherView = projectForRole(studentRecord, 'teacher');
    for (const key of ALWAYS_PRIVATE) {
      expect(Object.keys(teacherView)).not.toContain(key);
    }
  });

  it('suppresses class aggregates for a cohort small enough to deanonymise', () => {
    expect(canReportAggregate(MIN_COHORT_FOR_AGGREGATE - 1)).toBe(false);
    expect(canReportAggregate(MIN_COHORT_FOR_AGGREGATE)).toBe(true);
  });
});

describe('demo seed', () => {
  it('contains enough pages and definitions to drive the scripted demo', () => {
    expect(DEMO_PAGES.length).toBeGreaterThanOrEqual(5);
    const all = DEMO_PAGES.map((p) => p.text).join(' ');
    expect(extractConcepts(all).length).toBeGreaterThanOrEqual(3);
  });

  it('has detectable chapter structure for the processing pipeline', () => {
    expect(DEMO_PAGES.some((p) => /Chapter 1/.test(p.text))).toBe(true);
    expect(DEMO_PAGES.some((p) => /Chapter 2/.test(p.text))).toBe(true);
  });

  it('keeps the scripted demo short enough for a carnival slot', () => {
    expect(DEMO_SCRIPT.length).toBeLessThanOrEqual(15);
    expect(DEMO_SCRIPT[0]!.step).toBe(1);
  });

  it('scripts the mastery step to avoid overclaiming', () => {
    const masteryStep = DEMO_SCRIPT.find((s) => s.label === 'Mastery')!;
    expect(masteryStep.detail).toMatch(/not to MASTERED/);
  });
});
