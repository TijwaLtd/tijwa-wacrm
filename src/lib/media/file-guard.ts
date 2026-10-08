// ────────────────────────────────────────────────────────────────
// Inbound media file guard.
//
// The webhook used to trust whatever Meta's CDN returned: the
// `Content-Type` header was copied straight onto the Supabase upload
// and used to derive the stored file extension. A spoofed or mislabelled
// header therefore decided both "is this allowed?" and "what does the
// browser think it is?" — and the only backstop was the storage bucket's
// `allowed_mime_types`, with failures swallowed silently.
//
// This module makes the **bytes** the source of truth:
//
//   1. `sniffMime()` inspects magic bytes and returns a canonical MIME
//      we can actually vouch for, or null.
//   2. The canonical MIME must be on `ALLOWED_INBOUND_MIMES`.
//   3. That allowlist is kept **1:1 with the `chat-media` bucket's
//      `allowed_mime_types`** (supabase/migrations/023_chat_media.sql)
//      so app validation can never diverge from storage enforcement.
//
// Anything that fails these checks is dropped before it is ever written.
// ────────────────────────────────────────────────────────────────

/**
 * Mirror of the `chat-media` bucket's `allowed_mime_types`.
 * Keep in sync with supabase/migrations/023_chat_media.sql.
 */
export const ALLOWED_INBOUND_MIMES: ReadonlySet<string> = new Set([
  // images
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  // video
  'video/mp4',
  'video/3gpp',
  // documents
  'application/pdf',
  'application/msword',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  // audio
  'audio/ogg',
  'audio/mpeg',
  'audio/aac',
  'audio/mp4',
  'audio/amr',
])

/** Canonical MIME → storage extension. 1:1 with ALLOWED_INBOUND_MIMES. */
export const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/amr': 'amr',
}

/** Bucket file_size_limit (supabase/migrations/023_chat_media.sql). */
export const MAX_INBOUND_MEDIA_BYTES = 16 * 1024 * 1024

const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false
  }
  return true
}

function asciiAt(buf: Buffer, offset: number, text: string): boolean {
  if (buf.length < offset + text.length) return false
  return buf.toString('latin1', offset, offset + text.length) === text
}

function isZip(buf: Buffer): boolean {
  // PK\x03\x04 (occupied), PK\x05\x06 (empty), PK\x07\x08 (spanned)
  return (
    startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buf, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(buf, [0x50, 0x4b, 0x07, 0x08])
  )
}

/** Search a buffer for an ASCII needle (used to sniff OOXML / OLE parts). */
function containsAscii(buf: Buffer, needle: string): boolean {
  return buf.indexOf(needle) !== -1
}

/** Search for a UTF-16LE-encoded needle (OLE2 directory entry names). */
function containsUtf16(buf: Buffer, needle: string): boolean {
  return buf.indexOf(Buffer.from(needle, 'utf16le')) !== -1
}

/**
 * Distinguish the three OOXML flavours (all are ZIP archives) by the
 * primary part folder baked into the local file headers near the start
 * of the archive. A generic ZIP — not on the allowlist — returns null.
 */
function sniffOoxml(buf: Buffer): string | null {
  const head = buf.subarray(0, 8192)
  if (containsAscii(head, 'word/') || containsAscii(head, 'word/document.xml')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (containsAscii(head, 'xl/') || containsAscii(head, 'xl/workbook.xml')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  if (containsAscii(head, 'ppt/') || containsAscii(head, 'ppt/presentation.xml')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
  return null
}

/**
 * Distinguish the three legacy OLE2 flavours (doc/xls/ppt share one
 * magic number) by their OLE2 directory stream names, which are stored
 * UTF-16LE.
 */
function sniffOle2(buf: Buffer): string | null {
  if (containsUtf16(buf, 'PowerPoint Document')) {
    return 'application/vnd.ms-powerpoint'
  }
  if (containsUtf16(buf, 'Workbook') || containsUtf16(buf, 'Book')) {
    return 'application/vnd.ms-excel'
  }
  if (containsUtf16(buf, 'WordDocument')) {
    return 'application/msword'
  }
  return null
}

/**
 * ISO base-media container: MP4 / 3GP / M4A share the `ftyp` box at
 * offset 4 and are told apart by the major-brand string at offset 8.
 */
function sniffIsoBmff(buf: Buffer): string | null {
  if (!asciiAt(buf, 4, 'ftyp') || buf.length < 12) return null
  const brand = buf.toString('latin1', 8, 12)

  if (brand.startsWith('3g') || brand.startsWith('3G')) return 'video/3gpp'
  if (brand === 'M4A ' || brand === 'M4B ') return 'audio/mp4'
  // isom, iso2, mp41, mp42, avc1, M4V , dash, MSNV …
  return 'video/mp4'
}

/**
 * MPEG-1/2 audio frame sync. The 2-bit layer field separates AAC
 * (layer 00 → ADTS) from MP3 (layer 01 → Layer III).
 */
function sniffMpegAudio(buf: Buffer): string | null {
  if (buf.length < 2) return null
  if (asciiAt(buf, 0, 'ID3')) return 'audio/mpeg'

  if (buf[0] !== 0xff) return null
  // bits 7-5 of byte 1 must be 111 (frame sync continuation)
  if ((buf[1] & 0xe0) !== 0xe0) return null

  const layer = (buf[1] >> 1) & 0x03
  if (layer === 0x00) return 'audio/aac' // ADTS
  if (layer === 0x01) return 'audio/mpeg' // Layer III
  return null
}

/**
 * Conservative text/plain heuristic: valid UTF-8, no NUL bytes, and
 * overwhelmingly printable. Prevents arbitrary binaries from being
 * classified as text.
 */
function looksLikeText(buf: Buffer): boolean {
  if (buf.length === 0) return false
  if (buf.includes(0x00)) return false

  // Reject likely binaries (ELF, MZ, Mach-O, gzip …) up front.
  if (startsWith(buf, [0x7f, 0x45, 0x4c, 0x46])) return false // ELF
  if (asciiAt(buf, 0, 'MZ')) return false // PE/DOS
  if (startsWith(buf, [0xcf, 0xfa, 0xed, 0xfe])) return false // Mach-O 64
  if (startsWith(buf, [0xfe, 0xed, 0xfa, 0xce])) return false // Mach-O 32
  if (startsWith(buf, [0x1f, 0x8b])) return false // gzip

  // Reject markup outright. HTML/SVG/XML would otherwise sail through
  // the printable-text heuristic and become a stored-XSS vector the
  // moment anything serves them with a markup content type. WhatsApp
  // text messages carry no media, so a text/plain document that opens
  // with `<` is not something we need to keep.
  let start = 0
  while (start < buf.length && (buf[start] === 0x20 || buf[start] === 0x09 || buf[start] === 0x0a || buf[start] === 0x0d)) {
    start++
  }
  if (buf[start] === 0x3c) return false // '<'

  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  if (decoded.includes('�')) return false

  let printable = 0
  const limit = Math.min(buf.length, 8192)
  for (let i = 0; i < limit; i++) {
    const b = buf[i]
    if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80) {
      printable++
    }
  }
  return printable / limit >= 0.95
}

/**
 * Identify a file from its bytes.
 *
 * Returns a canonical MIME on the allowlist, or null when the content
 * cannot be vouchered for (unknown signature, disallowed type, or a
 * container that doesn't match a supported document type).
 *
 * The returned value — not the upstream `Content-Type` header — is what
 * callers must use for both the allowlist decision and the stored
 * extension.
 */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length === 0) return null

  // Images
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (asciiAt(buf, 0, 'RIFF') && asciiAt(buf, 8, 'WEBP')) return 'image/webp'
  if (asciiAt(buf, 0, 'GIF87a') || asciiAt(buf, 0, 'GIF89a')) return 'image/gif'

  // Documents
  if (asciiAt(buf, 0, '%PDF')) return 'application/pdf'
  if (startsWith(buf, OLE2_MAGIC)) return sniffOle2(buf)
  if (isZip(buf)) return sniffOoxml(buf)

  // Audio / video
  if (asciiAt(buf, 0, 'OggS')) return 'audio/ogg'
  if (asciiAt(buf, 0, '#!AMR')) return 'audio/amr'
  if (asciiAt(buf, 0, 'ftyp')) return sniffIsoBmff(buf)
  if (buf.length >= 12 && asciiAt(buf, 4, 'ftyp')) return sniffIsoBmff(buf)
  const mpeg = sniffMpegAudio(buf)
  if (mpeg) return mpeg

  // Last resort: plain text.
  if (looksLikeText(buf)) return 'text/plain'

  return null
}

export function isAllowedInboundMime(mime: string): boolean {
  return ALLOWED_INBOUND_MIMES.has(mime.split(';')[0].trim().toLowerCase())
}

export function extForAllowedMime(mime: string): string | null {
  return MIME_TO_EXT[mime.split(';')[0].trim().toLowerCase()] ?? null
}
