export interface PageInput {
  pageNumber: number;
  text: string;
}

export interface ChapterInput {
  id: string | null;
  ordinal: number;
  title: string;
  startPage: number;
  endPage: number;
}

export interface Chunk {
  chapterId: string | null;
  pageNumber: number;
  pageEnd: number;
  section: string | null;
  topic: string | null;
  sourceType: 'body' | 'definition' | 'formula' | 'exercise' | 'example';
  text: string;
  startOffset: number;
  endOffset: number;
  tokenEstimate: number;
}

const TARGET_CHARS = 1400;
const MAX_CHARS = 2200;
const OVERLAP_CHARS = 180;

/** Rough token estimate. Bangla is denser per char than English, so we bias up. */
export function estimateTokens(text: string): number {
  const bengali = (text.match(/[\u0980-\u09FF]/g) ?? []).length;
  const ratio = bengali / Math.max(text.length, 1) > 0.3 ? 2.6 : 4.0;
  return Math.ceil(text.length / ratio);
}

/** Section headings: "3.2 Newton's Laws", "৩.২ গতি", or an ALL-CAPS/bold-ish line. */
const SECTION_RE = /(?:^|\n)\s*((?:\d+\.\d+|[০-৯]+\.[০-৯]+)\s+[^\n]{3,80})/g;

const CLASSIFIERS: { type: Chunk['sourceType']; re: RegExp }[] = [
  { type: 'formula',    re: /(=\s*[^\s]|সূত্র|formula)/i },
  { type: 'definition', re: /\b(is defined as|refers to|means that|সংজ্ঞা|বলা হয়)\b/i },
  { type: 'exercise',   re: /\b(exercise|questions?|অনুশীলন|প্রশ্ন)\b/i },
  { type: 'example',    re: /\b(example|for instance|উদাহরণ)\b/i },
];

function classify(text: string): Chunk['sourceType'] {
  for (const c of CLASSIFIERS) if (c.re.test(text)) return c.type;
  return 'body';
}

function findChapter(page: number, chapters: ChapterInput[]): ChapterInput | null {
  for (const ch of chapters) {
    if (page >= ch.startPage && page <= ch.endPage) return ch;
  }
  return null;
}

/** Split a long block on paragraph boundaries, falling back to sentences, then hard cut. */
function splitBlock(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const paras = text.split(/\n{2,}/).filter((p) => p.trim());
  const out: string[] = [];
  let buf = '';
  const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = ''; };

  for (const para of paras) {
    if (para.length > MAX_CHARS) {
      flush();
      // Sentence-level split. Handles the Bangla danda (।) as well as '.', '?', '!'.
      const sentences = para.split(/(?<=[।.?!])\s+/);
      let sbuf = '';
      for (const s of sentences) {
        if ((sbuf + s).length > TARGET_CHARS && sbuf) { out.push(sbuf.trim()); sbuf = ''; }
        if (s.length > MAX_CHARS) {
          for (let i = 0; i < s.length; i += TARGET_CHARS) out.push(s.slice(i, i + TARGET_CHARS));
        } else {
          sbuf += (sbuf ? ' ' : '') + s;
        }
      }
      if (sbuf.trim()) out.push(sbuf.trim());
      continue;
    }
    if ((buf + para).length > TARGET_CHARS && buf) flush();
    buf += (buf ? '\n\n' : '') + para;
  }
  flush();
  return out.filter(Boolean);
}

/**
 * Chunk a textbook along semantic boundaries: chapter -> section -> paragraph
 * group. Never a blind every-N-characters split, because a chunk that straddles
 * two unrelated concepts retrieves badly and cites misleadingly.
 *
 * Every chunk keeps the page it came from so citations stay truthful.
 */
export function chunkTextbook(pages: PageInput[], chapters: ChapterInput[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const page of pages) {
    const raw = page.text.trim();
    if (raw.length < 40) continue; // blank or image-only page contributes nothing

    const chapter = findChapter(page.pageNumber, chapters);

    // Locate section headings so a chunk can be labelled with its section.
    const headings: { index: number; title: string }[] = [];
    SECTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SECTION_RE.exec(raw)) !== null) {
      headings.push({ index: m.index, title: (m[1] ?? '').trim() });
    }

    const segments: { text: string; section: string | null; offset: number }[] = [];
    if (headings.length === 0) {
      segments.push({ text: raw, section: null, offset: 0 });
    } else {
      if ((headings[0]?.index ?? 0) > 0) {
        segments.push({ text: raw.slice(0, headings[0]!.index), section: null, offset: 0 });
      }
      headings.forEach((h, i) => {
        const end = headings[i + 1]?.index ?? raw.length;
        segments.push({ text: raw.slice(h.index, end), section: h.title, offset: h.index });
      });
    }

    for (const seg of segments) {
      const parts = splitBlock(seg.text);
      parts.forEach((part, i) => {
        // Carry a small tail of the previous part so a concept split across a
        // boundary is still retrievable from either side.
        const prev = i > 0 ? parts[i - 1]!.slice(-OVERLAP_CHARS) : '';
        const text = (prev ? prev + ' … ' : '') + part;
        if (text.trim().length < 40) return;
        const start = seg.offset + seg.text.indexOf(part);
        chunks.push({
          chapterId: chapter?.id ?? null,
          pageNumber: page.pageNumber,
          pageEnd: page.pageNumber,
          section: seg.section,
          topic: seg.section,
          sourceType: classify(part),
          text: text.trim(),
          startOffset: Math.max(start, 0),
          endOffset: Math.max(start, 0) + part.length,
          tokenEstimate: estimateTokens(text),
        });
      });
    }
  }

  return chunks;
}
