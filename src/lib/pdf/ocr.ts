import type { ExtractedPage } from './extract';

export class OcrUnavailableError extends Error {}

export interface OcrProvider {
  readonly name: string;
  /** Rasterise + recognise. Returns text per page, in page order. */
  recognise(pdf: Buffer, pageNumbers: number[]): Promise<Map<number, string>>;
}

/**
 * Tesseract via the `tesseract` CLI. Requires the binary plus language packs
 * installed on the worker host:
 *   apt-get install tesseract-ocr tesseract-ocr-ben tesseract-ocr-eng poppler-utils
 * Bangla recognition quality depends entirely on the `ben` traineddata.
 */
export class TesseractOcr implements OcrProvider {
  readonly name = 'tesseract';
  constructor(private languages: string) {}

  async recognise(pdf: Buffer, pageNumbers: number[]): Promise<Map<number, string>> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const run = promisify(execFile);

    const dir = await mkdtemp(path.join(tmpdir(), 'studyos-ocr-'));
    const out = new Map<number, string>();
    try {
      const pdfPath = path.join(dir, 'in.pdf');
      await writeFile(pdfPath, pdf);

      for (const page of pageNumbers) {
        const base = path.join(dir, `p${page}`);
        // 300 DPI is the practical floor for reliable Bangla conjunct recognition.
        await run('pdftoppm', ['-f', String(page), '-l', String(page), '-r', '300', '-png', pdfPath, base]);
        const { readdir } = await import('node:fs/promises');
        const produced = (await readdir(dir)).filter((f) => f.startsWith(`p${page}-`) && f.endsWith('.png'));
        const img = produced[0];
        if (!img) continue;
        const txtBase = path.join(dir, `t${page}`);
        await run('tesseract', [path.join(dir, img), txtBase, '-l', this.languages, '--psm', '3']);
        const text = await readFile(`${txtBase}.txt`, 'utf8').catch(() => '');
        out.set(page, text.replace(/\s+/g, ' ').trim());
      }
      return out;
    } catch (err) {
      throw new OcrUnavailableError(
        `OCR failed. Check that tesseract and poppler-utils are installed on the worker. (${(err as Error).message})`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

export function ocrProvider(): OcrProvider | null {
  const p = process.env.OCR_PROVIDER ?? 'none';
  if (p === 'none') return null;
  if (p === 'tesseract') return new TesseractOcr(process.env.OCR_LANGUAGES ?? 'ben+eng');
  throw new Error(`Unknown OCR_PROVIDER "${p}".`);
}

export async function ocrPages(pdf: Buffer, pages: ExtractedPage[]): Promise<ExtractedPage[]> {
  const provider = ocrProvider();
  if (!provider) {
    throw new OcrUnavailableError(
      'Text could not be extracted from this PDF and OCR is not configured. Set OCR_PROVIDER in your environment.',
    );
  }
  const targets = pages.filter((p) => p.text.length < 40).map((p) => p.pageNumber);
  const results = await provider.recognise(pdf, targets);
  return pages.map((p) => {
    const text = results.get(p.pageNumber);
    return text ? { ...p, text, extractedBy: 'ocr' as const } : p;
  });
}
