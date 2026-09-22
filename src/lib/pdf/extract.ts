import pdfParse from 'pdf-parse';

export interface ExtractedPage { pageNumber: number; text: string; extractedBy: 'text_layer' | 'ocr'; }
export interface ExtractionResult {
  pages: ExtractedPage[];
  pageCount: number;
  /** True when the text layer is too sparse to learn from — OCR is required. */
  needsOcr: boolean;
}

export class PdfExtractionError extends Error {}

const MIN_CHARS_PER_PAGE = 40;
const OCR_THRESHOLD = 0.6;

/**
 * Extract the PDF text layer page by page. pdf-parse concatenates by default, so
 * we use its pagerender hook to keep page boundaries — without them, citations
 * cannot name a real page number.
 */
export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const pages: ExtractedPage[] = [];

  try {
    await pdfParse(buffer, {
      pagerender: async (pageData: any) => {
        const content = await pageData.getTextContent();
        const text = content.items.map((i: any) => i.str).join(' ').replace(/\s+/g, ' ').trim();
        pages.push({ pageNumber: pageData.pageNumber, text, extractedBy: 'text_layer' });
        return text;
      },
    });
  } catch (err) {
    throw new PdfExtractionError(
      `The PDF could not be read. It may be corrupted or password-protected. (${(err as Error).message})`,
    );
  }

  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  const sparse = pages.filter((p) => p.text.length < MIN_CHARS_PER_PAGE).length;
  const needsOcr = pages.length > 0 && sparse / pages.length > OCR_THRESHOLD;

  return { pages, pageCount: pages.length, needsOcr };
}
