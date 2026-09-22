export type ScanSubject = 'mathematics' | 'physics' | 'chemistry' | 'biology' | 'english' | 'bangla' | 'ict' | 'unknown';
export type SolveDepth = 'hint' | 'step_by_step' | 'full_solution';

export interface ParsedQuestion {
  text: string;
  language: 'en' | 'bn' | 'mixed';
  subject: ScanSubject;
  isNumerical: boolean;
  knownValues: { label: string; value: string }[];
}

const BENGALI = /[\u0980-\u09FF]/;
const LATIN = /[a-zA-Z]/;

export function detectLanguage(text: string): 'en' | 'bn' | 'mixed' {
  const bn = (text.match(/[\u0980-\u09FF]/g) ?? []).length;
  const en = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (bn === 0) return 'en';
  if (en === 0) return 'bn';
  const ratio = bn / (bn + en);
  return ratio > 0.15 && ratio < 0.85 ? 'mixed' : ratio >= 0.85 ? 'bn' : 'en';
}

const SUBJECT_SIGNALS: { subject: ScanSubject; patterns: RegExp[] }[] = [
  { subject: 'physics',      patterns: [/\b(velocity|acceleration|newton|force|momentum|joule|m\/s)\b/i, /বেগ|ত্বরণ|বল|ভরবেগ/] },
  { subject: 'chemistry',    patterns: [/\b(mole|molar|reaction|valency|periodic|H2O|NaCl)\b/i, /বিক্রিয়া|যোজনী|মৌল/] },
  { subject: 'mathematics',  patterns: [/\b(solve|equation|integral|derivative|theorem|polynomial)\b/i, /সমীকরণ|উপপাদ্য|সমাধান/] },
  { subject: 'biology',      patterns: [/\b(cell|photosynthesis|mitosis|enzyme|chromosome)\b/i, /কোষ|সালোকসংশ্লেষণ/] },
  { subject: 'ict',          patterns: [/\b(algorithm|database|network|binary|programming)\b/i, /অ্যালগরিদম|ডাটাবেজ/] },
  { subject: 'english',      patterns: [/\b(tense|voice|narration|preposition|synonym)\b/i] },
  { subject: 'bangla',       patterns: [/সন্ধি|সমাস|কারক|প্রত্যয়|ব্যাকরণ/] },
];

export function detectSubject(text: string): ScanSubject {
  for (const { subject, patterns } of SUBJECT_SIGNALS) {
    if (patterns.some((p) => p.test(text))) return subject;
  }
  return 'unknown';
}

/**
 * Pull labelled quantities out of a word problem, e.g. "mass = 5 kg", "v=20m/s",
 * or Bangla digit forms. Used to structure a guided solution rather than to
 * compute anything — the arithmetic is left to the tutor with textbook evidence.
 */
export function extractKnownValues(text: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const re = /([A-Za-z\u0980-\u09FF][A-Za-z\u0980-\u09FF\s]{0,20}?)\s*=\s*([\d০-৯]+(?:\.[\d০-৯]+)?\s*[A-Za-z\/²³]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Strip leading connectives the regex sweeps up: "Given mass" -> "mass".
    const label = (m[1] ?? '')
      .trim()
      .replace(/^(given|and|if|where|let|the|a|an|যদি|এবং)\s+/i, '')
      .trim();
    const value = (m[2] ?? '').trim();
    if (label && value) out.push({ label, value });
  }
  return out;
}

export function isNumericalQuestion(text: string): boolean {
  const hasDigits = /[\d০-৯]/.test(text);
  const hasUnitsOrOps = /(m\/s|kg|km|cm|mol|N\b|J\b|=|\+|\-|×|÷|\*)/.test(text);
  return hasDigits && hasUnitsOrOps;
}

export function parseQuestion(rawOcrText: string): ParsedQuestion {
  const text = rawOcrText.replace(/\s+/g, ' ').trim();
  return {
    text,
    language: detectLanguage(text),
    subject: detectSubject(text),
    isNumerical: isNumericalQuestion(text),
    knownValues: extractKnownValues(text),
  };
}

/**
 * Learning-first solving instruction. `hint` is the default depth: the scanner
 * must not become a homework-answer machine, which is the single fastest way to
 * make a study tool worthless for actual learning.
 */
export function solveInstruction(parsed: ParsedQuestion, depth: SolveDepth): string {
  const shared = parsed.isNumerical
    ? `This is a numerical problem. Work in this order: (1) restate what is known, (2) name the unknown, (3) state the formula from the textbook evidence and why it applies, (4) substitute, (5) calculate, (6) sanity-check the units and magnitude.`
    : `This is a conceptual question. Identify the concept, ground it in the textbook evidence, explain it, and name what the student likely misunderstood.`;

  switch (depth) {
    case 'hint':
      return `${shared}\n\nGive ONE hint only — enough to unblock the next step. Do not reveal the formula's result or the final answer. End by asking whether they want another hint.`;
    case 'step_by_step':
      return `${shared}\n\nWork through the steps one at a time, numbering each. Stop before stating the final answer and ask the student to complete the last step themselves.`;
    case 'full_solution':
      return `${shared}\n\nGive the complete worked solution, then set one similar practice problem so the student can verify their understanding.`;
  }
}
