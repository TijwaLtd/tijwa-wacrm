// ============================================================
// renderReportPdf — ReportBundle → PDF Buffer via react-pdf.
// Used by the cron sender, the "email me the PDF" action and
// the download endpoint (which re-renders from stored metrics).
// ============================================================

import { pdf } from '@react-pdf/renderer'
import { ReportDocument } from './report-document'
import type { ReportBundle } from '../types'

export async function renderReportPdf(bundle: ReportBundle): Promise<Buffer> {
  const instance = pdf(<ReportDocument bundle={bundle} />)
  const out = (await instance.toBuffer()) as unknown
  if (Buffer.isBuffer(out)) return out
  if (out instanceof Uint8Array) return Buffer.from(out)
  // Stream-shaped result — collect chunks
  const chunks: Uint8Array[] = []
  const iterable = out as AsyncIterable<Uint8Array | string>
  for await (const chunk of iterable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export function reportPdfFilename(bundle: ReportBundle): string {
  const date = bundle.period.from.slice(0, 10)
  const slug =
    bundle.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'business'
  return `${slug}-report-${bundle.period.kind}-${date}.pdf`
}
