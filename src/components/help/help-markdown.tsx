// ============================================================
// Server-side markdown renderer for the help docs.
//
// react-markdown + remark-gfm, no raw-HTML passthrough (safe by
// default). Styling comes from the components map rather than a
// typography plugin, mirroring how the legal pages handle prose.
// Links to internal routes stay plain <a> — the docs are full-page
// navigations anyway.
// ============================================================

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'

const components = {
  h1: (props: React.ComponentProps<'h1'>) => (
    <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl" {...props} />
  ),
  h2: (props: React.ComponentProps<'h2'>) => (
    <h2 className="mt-8 scroll-mt-32 text-lg font-semibold text-foreground" {...props} />
  ),
  h3: (props: React.ComponentProps<'h3'>) => (
    <h3 className="mt-6 text-base font-semibold text-foreground" {...props} />
  ),
  p: (props: React.ComponentProps<'p'>) => (
    <p className="text-[15px] leading-relaxed text-foreground/85" {...props} />
  ),
  ul: (props: React.ComponentProps<'ul'>) => (
    <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-foreground/85" {...props} />
  ),
  ol: (props: React.ComponentProps<'ol'>) => (
    <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-foreground/85" {...props} />
  ),
  li: (props: React.ComponentProps<'li'>) => <li className="marker:text-muted-foreground" {...props} />,
  a: ({ href, children, ...props }: React.ComponentProps<'a'>) => {
    const isInternal = typeof href === 'string' && href.startsWith('/')
    if (isInternal && href) {
      return (
        <Link href={href} className="font-medium text-primary underline underline-offset-2" {...props}>
          {children}
        </Link>
      )
    }
    return (
      <a
        href={href}
        className="font-medium text-primary underline underline-offset-2"
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noreferrer noopener' : undefined}
        {...props}
      >
        {children}
      </a>
    )
  },
  strong: (props: React.ComponentProps<'strong'>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  code: (props: React.ComponentProps<'code'>) => (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px] text-foreground"
      {...props}
    />
  ),
  blockquote: (props: React.ComponentProps<'blockquote'>) => (
    <blockquote
      className="border-l-2 border-primary/40 bg-muted/40 py-2 pl-4 text-[15px] leading-relaxed text-foreground/85"
      {...props}
    />
  ),
  table: (props: React.ComponentProps<'table'>) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props: React.ComponentProps<'th'>) => (
    <th className="border border-border bg-muted/60 px-3 py-2 text-left font-semibold" {...props} />
  ),
  td: (props: React.ComponentProps<'td'>) => (
    <td className="border border-border px-3 py-2 align-top" {...props} />
  ),
  hr: () => <hr className="my-8 border-border" />,
}

export function HelpMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
