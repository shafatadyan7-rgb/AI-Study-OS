export interface DetectedChapter { ordinal: number; title: string; startPage: number; endPage: number; }

/**
 * Chapter heading patterns. Carried forward from the working prototype and
 * extended: English "Chapter N", Bangla "অধ্যায় N", and Roman "Unit IV".
 */
const PATTERNS: RegExp[] = [
  /\bchapter\s+(\d+|[ivxlc]+)\b[:.\-\s]/i,
  /অধ্যায়\s*[০-৯0-9]+/,
  /\bunit\s+(\d+|[ivxlc]+)\b[:.\-\s]/i,
  /\bপরিচ্ছেদ\s*[০-৯0-9]+/,
];

function headingIn(text: string): string | null {
  const head = text.slice(0, 400); // headings live at the top of a page
  for (const re of PATTERNS) {
    const m = head.match(re);
    if (!m || m.index === undefined) continue;
    const slice = head.slice(m.index, m.index + 90);
    const title = slice.split(/[।.\n]|\s{3,}/)[0]?.trim();
    if (title && title.length >= 3) return title;
  }
  return null;
}

/**
 * Heuristic chapter detection. Returns a single "Full Textbook" chapter when the
 * document has no detectable structure — better an honest single unit than
 * invented chapter names.
 */
export function detectChapters(pages: { pageNumber: number; text: string }[]): DetectedChapter[] {
  const hits: { title: string; startPage: number }[] = [];

  for (const p of pages) {
    const title = headingIn(p.text);
    if (!title) continue;
    const last = hits[hits.length - 1];
    // A heading repeated on the very next page is a running header, not a new chapter.
    if (last && p.pageNumber - last.startPage <= 1) continue;
    if (last && last.title.toLowerCase() === title.toLowerCase()) continue;
    hits.push({ title, startPage: p.pageNumber });
  }

  const lastPage = pages[pages.length - 1]?.pageNumber ?? 1;
  if (hits.length === 0) {
    return [{ ordinal: 1, title: 'Full Textbook', startPage: pages[0]?.pageNumber ?? 1, endPage: lastPage }];
  }

  return hits.map((h, i) => ({
    ordinal: i + 1,
    title: h.title,
    startPage: h.startPage,
    endPage: hits[i + 1] ? hits[i + 1]!.startPage - 1 : lastPage,
  }));
}
