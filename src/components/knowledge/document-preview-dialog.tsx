'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface PreviewableDocument {
  id: string;
  title: string;
  content?: string;
  source_type?: string;
  file_path?: string | null;
}

/**
 * Document preview. PDFs embed through a short-lived signed URL; every
 * other type (text docs, DOCX, CSV, MD, TSV) previews the extracted
 * text that already lives on the document row, with a Download button
 * for the original file when one is stored.
 */
export function DocumentPreviewDialog({
  doc,
  onClose,
}: {
  doc: PreviewableDocument | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-popover border-border sm:max-w-3xl">
        {/* key: remount per document so URL/loading state starts fresh */}
        {doc && <PreviewBody key={doc.id} doc={doc} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  doc,
  onClose,
}: {
  doc: PreviewableDocument;
  onClose: () => void;
}) {
  const t = useTranslations('Settings.aiKnowledge');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(true);

  const isFile = Boolean(doc.source_type === 'file' && doc.file_path);
  const isPdf = isFile && (doc.file_path ?? '').toLowerCase().endsWith('.pdf');

  useEffect(() => {
    if (!isFile) return;
    let cancelled = false;
    fetch(`/api/ai/knowledge/${doc.id}/file`)
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error('sign failed'))
      )
      .then((data) => {
        if (!cancelled && data.url) setFileUrl(data.url);
      })
      .catch(() => {
        // Preview falls back to the extracted text below.
      })
      .finally(() => {
        if (!cancelled) setUrlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id, isFile]);

  const content = doc.content?.trim();

  let body: React.ReactNode;
  if (isPdf) {
    if (urlLoading) {
      body = (
        <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> {t('loading')}
        </div>
      );
    } else if (fileUrl) {
      body = (
        <iframe
          src={fileUrl}
          title={`${doc.title} preview`}
          className="h-[55vh] w-full rounded-md border"
        />
      );
    } else if (content) {
      body = <DocumentText text={content} />;
    } else {
      body = (
        <p className="text-muted-foreground flex min-h-40 items-center justify-center text-sm">
          {t('previewFailed')}
        </p>
      );
    }
  } else if (content) {
    body = <DocumentText text={content} />;
  } else if (isFile && urlLoading) {
    body = (
      <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> {t('loading')}
      </div>
    );
  } else {
    body = (
      <p className="text-muted-foreground flex min-h-40 items-center justify-center text-sm">
        {t('previewFailed')}
      </p>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-popover-foreground flex min-w-0 items-center gap-2">
          <FileText className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{doc.title}</span>
        </DialogTitle>
        <DialogDescription className="text-muted-foreground">
          {doc.source_type === 'file' ? t('typeFile') : t('typeText')}
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-auto rounded-md border p-3">{body}</div>

      <DialogFooter>
        {isFile && fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            <Download className="mr-1.5 size-4" />
            {t('download')}
          </a>
        )}
        <Button variant="ghost" onClick={onClose}>
          {t('cancel')}
        </Button>
      </DialogFooter>
    </>
  );
}

function DocumentText({ text }: { text: string }) {
  return (
    <pre className="text-foreground text-sm whitespace-pre-wrap">{text}</pre>
  );
}
