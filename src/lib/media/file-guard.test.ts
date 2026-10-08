import { describe, it, expect } from 'vitest'
import {
  sniffMime,
  isAllowedInboundMime,
  extForAllowedMime,
  ALLOWED_INBOUND_MIMES,
  MIME_TO_EXT,
  MAX_INBOUND_MEDIA_BYTES,
} from './file-guard'

// Tiny builders so fixtures stay readable.
type Chunk = number | number[] | string | Buffer
const buf = (...parts: Chunk[]): Buffer => {
  const chunks: Buffer[] = []
  for (const p of parts) {
    if (typeof p === 'string') chunks.push(Buffer.from(p, 'latin1'))
    else if (typeof p === 'number') chunks.push(Buffer.from([p]))
    else chunks.push(Buffer.from(p))
  }
  return Buffer.concat(chunks)
}

describe('file-guard allowlist', () => {
  it('stays 1:1 with MIME_TO_EXT', () => {
    expect(Object.keys(MIME_TO_EXT).sort()).toEqual(
      [...ALLOWED_INBOUND_MIMES].sort()
    )
  })

  it('excludes types the chat-media bucket rejects', () => {
    // svg, html, executables, archives are all deliberately absent.
    for (const mime of [
      'image/svg+xml',
      'text/html',
      'application/javascript',
      'application/x-msdownload',
      'application/zip',
      'application/octet-stream',
    ]) {
      expect(isAllowedInboundMime(mime)).toBe(false)
      expect(extForAllowedMime(mime)).toBeNull()
    }
  })

  it('matches the bucket size limit (16 MB)', () => {
    expect(MAX_INBOUND_MEDIA_BYTES).toBe(16 * 1024 * 1024)
  })
})

describe('sniffMime — images', () => {
  it('detects PNG', () => {
    expect(sniffMime(buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'rest'))).toBe(
      'image/png'
    )
  })

  it('detects JPEG', () => {
    expect(sniffMime(buf([0xff, 0xd8, 0xff, 0xe0], 'rest'))).toBe('image/jpeg')
  })

  it('detects WEBP via RIFF container', () => {
    expect(sniffMime(buf('RIFF', [0, 0, 0, 0], 'WEBPVP8 '))).toBe('image/webp')
  })

  it('detects GIF (GIF87a / GIF89a)', () => {
    expect(sniffMime(buf('GIF89a', [0x01, 0x00, 0x01, 0x00]))).toBe('image/gif')
    expect(sniffMime(buf('GIF87a', [0x01, 0x00, 0x01, 0x00]))).toBe('image/gif')
  })
})

describe('sniffMime — documents', () => {
  it('detects PDF', () => {
    expect(sniffMime(buf('%PDF-1.7\n%...'))).toBe('application/pdf')
  })

  it('detects OOXML (ZIP) by primary part', () => {
    expect(sniffMime(buf([0x50, 0x4b, 0x03, 0x04], 'junk', 'word/document.xml'))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    expect(sniffMime(buf([0x50, 0x4b, 0x03, 0x04], 'junk', 'xl/workbook.xml'))).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(sniffMime(buf([0x50, 0x4b, 0x03, 0x04], 'junk', 'ppt/presentation.xml'))).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )
  })

  it('rejects a plain ZIP (not an allowed type)', () => {
    expect(sniffMime(buf([0x50, 0x4b, 0x03, 0x04], 'junk', 'payload.exe'))).toBeNull()
  })

  it('detects legacy OLE2 by stream name', () => {
    const ole = buf([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], [0, 0])
    expect(sniffMime(buf(ole, Buffer.from('WordDocument', 'utf16le')))).toBe(
      'application/msword'
    )
    expect(sniffMime(buf(ole, Buffer.from('Workbook', 'utf16le')))).toBe(
      'application/vnd.ms-excel'
    )
    expect(
      sniffMime(buf(ole, Buffer.from('PowerPoint Document', 'utf16le')))
    ).toBe('application/vnd.ms-powerpoint')
  })

  it('rejects an OLE2 file with no recognisable stream', () => {
    expect(
      sniffMime(buf([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], [0, 0, 0, 0]))
    ).toBeNull()
  })
})

describe('sniffMime — audio / video', () => {
  it('detects OGG', () => {
    expect(sniffMime(buf('OggS', [0, 2], 'opushead'))).toBe('audio/ogg')
  })

  it('detects AMR', () => {
    expect(sniffMime(buf('#!AMR', [0x0a]))).toBe('audio/amr')
  })

  it('detects MP4 / M4A / 3GP by ftyp brand', () => {
    expect(sniffMime(buf([0, 0, 0, 0x20], 'ftypisom', [0, 0, 0, 0]))).toBe('video/mp4')
    expect(sniffMime(buf([0, 0, 0, 0x20], 'ftypM4A ', [0, 0, 0, 0]))).toBe('audio/mp4')
    expect(sniffMime(buf([0, 0, 0, 0x20], 'ftyp3gp4', [0, 0, 0, 0]))).toBe('video/3gpp')
  })

  it('detects MP3 (ID3 tag and frame sync)', () => {
    expect(sniffMime(buf('ID3', [0x04, 0x00, 0x00], [0, 0, 0, 0]))).toBe('audio/mpeg')
    // frame sync FF, then E0|layer01|... → Layer III
    expect(sniffMime(buf([0xff, 0xfb, 0x90, 0x44], [0, 0, 0, 0]))).toBe('audio/mpeg')
  })

  it('detects AAC (ADTS, layer bits 00)', () => {
    expect(sniffMime(buf([0xff, 0xf1, 0x50, 0x80], [0, 0, 0, 0]))).toBe('audio/aac')
  })
})

describe('sniffMime — hostile / unsupported content', () => {
  it('rejects an APK (it is a ZIP under the hood)', () => {
    // Real APKs open with a ZIP local-file header and reference
    // AndroidManifest.xml — must never classify as an OOXML document.
    const apk = buf(
      [0x50, 0x4b, 0x03, 0x04],
      [0x14, 0x00, 0x00, 0x00],
      'AndroidManifest.xml',
      [0, 0, 0, 0],
      'classes.dex'
    )
    expect(sniffMime(apk)).toBeNull()
    expect(isAllowedInboundMime('application/vnd.android.package-archive')).toBe(false)
  })

  it('rejects a bare ZIP archive', () => {
    const zip = buf([0x50, 0x4b, 0x03, 0x04], [0x14, 0x00, 0x00, 0x00], 'payload.bin')
    expect(sniffMime(zip)).toBeNull()
    expect(isAllowedInboundMime('application/zip')).toBe(false)
  })

  it('rejects a Windows PE executable', () => {
    expect(sniffMime(buf('MZ', [0x90, 0x00, 0x03, 0x00], [0, 0, 0, 0]))).toBeNull()
  })

  it('rejects an ELF binary', () => {
    expect(sniffMime(buf([0x7f, 0x45, 0x4c, 0x46], [0x02, 0x01, 0x01, 0x00]))).toBeNull()
  })

  it('rejects gzip', () => {
    expect(sniffMime(buf([0x1f, 0x8b, 0x08, 0x00], [0, 0, 0, 0]))).toBeNull()
  })

  it('rejects HTML (would execute if rendered)', () => {
    expect(sniffMime(buf('<!DOCTYPE html><html><script>alert(1)</script>'))).toBeNull()
  })

  it('rejects an SVG with embedded script', () => {
    expect(sniffMime(buf('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull()
  })

  it('rejects empty input', () => {
    expect(sniffMime(Buffer.alloc(0))).toBeNull()
  })

  it('accepts plain UTF-8 text', () => {
    expect(sniffMime(buf('Hello, this is a plain text note.\nLine two.\n'))).toBe(
      'text/plain'
    )
  })

  it('rejects binary garbage containing NUL bytes', () => {
    expect(sniffMime(buf([0x01, 0x02, 0x00, 0x03, 0x04, 0x00, 0xff, 0xfe]))).toBeNull()
  })
})

describe('sniffed type wins over the claimed header', () => {
  it('never returns a MIME outside the allowlist', () => {
    const samples = [
      buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      buf('%PDF-1.4'),
      buf('MZ', [0, 0, 0, 0]),
      buf('GIF89a'),
      buf([0x50, 0x4b, 0x03, 0x04], 'nope'),
    ]
    for (const sample of samples) {
      const sniffed = sniffMime(sample)
      if (sniffed !== null) {
        expect(ALLOWED_INBOUND_MIMES.has(sniffed)).toBe(true)
      }
    }
  })
})
