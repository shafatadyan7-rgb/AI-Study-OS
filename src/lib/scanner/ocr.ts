import { OcrUnavailableError, ocrProvider } from '@/lib/pdf/ocr';

/**
 * OCR for a single uploaded photo (as opposed to pdf/ocr.ts, which rasterises
 * PDF pages first). Reuses the same OCR_PROVIDER configuration so there is one
 * place that knows how to run Tesseract, not two drifting implementations.
 */
export async function recognizeImage(image: Buffer): Promise<string> {
  const provider = ocrProvider();
  if (!provider) {
    throw new OcrUnavailableError(
      'Text could not be extracted from this image because OCR is not configured. Set OCR_PROVIDER in your environment.',
    );
  }

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const run = promisify(execFile);

  const dir = await mkdtemp(path.join(tmpdir(), 'studyos-scan-'));
  try {
    const imgPath = path.join(dir, 'q.png');
    await writeFile(imgPath, image);
    const txtBase = path.join(dir, 'q');
    const languages = process.env.OCR_LANGUAGES ?? 'ben+eng';
    await run('tesseract', [imgPath, txtBase, '-l', languages, '--psm', '6']);
    const text = await readFile(`${txtBase}.txt`, 'utf8').catch(() => '');
    return text.replace(/\s+/g, ' ').trim();
  } catch (err) {
    throw new OcrUnavailableError(`OCR failed on the uploaded image. (${(err as Error).message})`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
