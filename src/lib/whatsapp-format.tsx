/**
 * WhatsApp-style text formatter.
 *
 * Converts WhatsApp formatting markers into HTML:
 *   *bold*        → <strong>bold</strong>
 *   _italic_      → <em>italic</em>
 *   ~strikethrough~ → <del>strikethrough</del>
 *   `inline code` → <code>inline code</code>
 *   ```code block``` → <pre><code>code block</code></pre>
 *   > blockquote   → <blockquote>blockquote</blockquote>
 *   - list item    → <ul><li>list item</li></ul>
 *   1. list item   → <ol><li>list item</li></ol>
 *
 * Formatting markers must be balanced (opening + closing) and
 * cannot be nested (WhatsApp doesn't support nesting).
 *
 * The parser runs line-by-line for block elements (quotes, lists,
 * code blocks) and inline for the rest (bold, italic, etc.).
 */

import { type ReactNode } from "react";

type Segment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  code?: boolean;
};

/**
 * Parse inline formatting within a single line.
 * Returns an array of segments with their formatting flags.
 */
function parseInline(text: string): Segment[] {
  const segments: Segment[] = [];
  // Regex matches: *bold*, _italic_, ~strikethrough~, `code`
  // Order matters — match the opening marker, then find the closing.
  const regex = /(\*([^*]+)\*|_([^_]+)_|~([^~]+)~|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push any plain text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }

    if (match[2] !== undefined) {
      // *bold*
      segments.push({ text: match[2], bold: true });
    } else if (match[3] !== undefined) {
      // _italic_
      segments.push({ text: match[3], italic: true });
    } else if (match[4] !== undefined) {
      // ~strikethrough~
      segments.push({ text: match[4], strikethrough: true });
    } else if (match[5] !== undefined) {
      // `code`
      segments.push({ text: match[5], code: true });
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining plain text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

/**
 * Render inline segments as React elements.
 */
function renderSegments(segments: Segment[]): ReactNode[] {
  return segments.map((seg, i) => {
    let content: ReactNode = seg.text;

    if (seg.code) {
      content = (
        <code
          key={i}
          className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[13px]"
        >
          {seg.text}
        </code>
      );
    } else {
      if (seg.bold) {
        content = <strong className="font-semibold">{content}</strong>;
      }
      if (seg.italic) {
        content = <em>{content}</em>;
      }
      if (seg.strikethrough) {
        content = <del className="opacity-70">{content}</del>;
      }
    }

    return <span key={i}>{content}</span>;
  });
}

/**
 * Inline-only WhatsApp formatter for compact previews (conversation list, etc).
 *
 * Only renders inline formatting: *bold*, _italic_, ~strikethrough~, `code`.
 * Strips block-level markers (quotes, lists, code blocks) so the result
 * fits cleanly in a single truncated line.
 */
export function formatWhatsAppInline(text: string): ReactNode[] {
  // Strip block-level markers to keep preview clean
  const cleaned = text
    .replace(/^```[\s\S]*?```/gm, "[code]")   // fenced code blocks → placeholder
    .replace(/^>\s?/gm, "")                    // blockquotes → strip marker
    .replace(/^[-*]\s/gm, "")                  // unordered list markers
    .replace(/^\d+\.\s/gm, "");                // ordered list markers

  // Take only the first line for a single-line preview
  const firstLine = cleaned.split("\n")[0] ?? "";
  return renderSegments(parseInline(firstLine));
}

/**
 * Parse a full WhatsApp-formatted message and return React elements.
 *
 * Handles block-level elements (code blocks, blockquotes, lists)
 * and inline formatting (bold, italic, strikethrough, inline code).
 */
export function formatWhatsAppText(text: string): ReactNode[] {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block (```) ──────────────────────────────
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++; // skip opening ```
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={elements.length}
          className="my-1 overflow-x-auto rounded-lg bg-foreground/5 p-3 font-mono text-[13px]"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // ── Blockquote (> text) ──────────────────────────────────
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote
          key={elements.length}
          className="my-1 border-l-4 border-foreground/20 pl-3 text-foreground/70"
        >
          {quoteLines.map((ql, qi) => (
            <p key={qi} className="whitespace-pre-wrap text-sm">
              {renderSegments(parseInline(ql))}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // ── Unordered list (- item) ──────────────────────────────
    if (/^- /.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        listItems.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul
          key={elements.length}
          className="my-1 list-disc pl-5 text-sm"
        >
          {listItems.map((item, li) => (
            <li key={li} className="whitespace-pre-wrap">
              {renderSegments(parseInline(item))}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // ── Ordered list (1. item) ──────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol
          key={elements.length}
          className="my-1 list-decimal pl-5 text-sm"
        >
          {listItems.map((item, li) => (
            <li key={li} className="whitespace-pre-wrap">
              {renderSegments(parseInline(item))}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // ── Empty line → paragraph break ─────────────────────────
    if (line === "") {
      elements.push(<br key={elements.length} />);
      i++;
      continue;
    }

    // ── Regular paragraph with inline formatting ─────────────
    elements.push(
      <p key={elements.length} className="whitespace-pre-wrap text-sm">
        {renderSegments(parseInline(line))}
      </p>,
    );
    i++;
  }

  return elements;
}
