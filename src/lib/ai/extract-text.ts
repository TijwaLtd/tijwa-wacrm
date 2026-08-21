/**
 * Server-side document text extraction.
 *
 * Accepts a Buffer + MIME type and returns the extracted plain text.
 * Supports PDF, DOCX, TXT, CSV, MD, and TSV.
 * Throws on unsupported types so the upload route can reject early.
 */

import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/tab-separated-values',
  'application/octet-stream', // fallback for .txt files mis-typed
])

const PDF_MIME = 'application/pdf'
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** File extensions we accept (used for fallback MIME detection). */
const EXTENSION_MAP: Record<string, string> = {
  '.pdf': PDF_MIME,
  '.docx': DOCX_MIME,
  '.doc': DOCX_MIME, // treat as DOCX (mammoth handles basic .doc)
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.tsv': 'text/tab-separated-values',
}

export function mimeFromFilename(filename: string): string | null {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return EXTENSION_MAP[ext] ?? null
}

export function isAcceptedFileType(mime: string): boolean {
  return mime === PDF_MIME || mime === DOCX_MIME || TEXT_MIME_TYPES.has(mime)
}

export class DocumentExtractionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentExtractionError'
  }
}

/**
 * Extract plain text from a file buffer.
 *
 * @param buffer  Raw file bytes
 * @param mime    MIME type (from upload header or detected from extension)
 * @param filename Original filename (for error messages)
 */
export async function extractText(
  buffer: Buffer,
  mime: string,
  filename: string,
): Promise<string> {
  if (mime === PDF_MIME) {
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      const result = await parser.getText()
      const text = result.text?.trim()
      if (!text) {
        throw new DocumentExtractionError(
          'PDF contains no extractable text (it may be a scanned image)',
        )
      }
      return text
    } catch (err) {
      if (err instanceof DocumentExtractionError) throw err
      throw new DocumentExtractionError(
        `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (mime === DOCX_MIME) {
    try {
      const result = await mammoth.extractRawText({ buffer })
      const text = result.value?.trim()
      if (!text) {
        throw new DocumentExtractionError('DOCX contains no extractable text')
      }
      return text
    } catch (err) {
      if (err instanceof DocumentExtractionError) throw err
      throw new DocumentExtractionError(
        `Failed to parse DOCX: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (TEXT_MIME_TYPES.has(mime)) {
    const text = buffer.toString('utf-8').trim()
    if (!text) {
      throw new DocumentExtractionError('File is empty')
    }
    return text
  }

  throw new DocumentExtractionError(
    `Unsupported file type: ${mime || 'unknown'} (${filename})`,
  )
}
