'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  BookOpen,
  Upload,
  FileText,
  File,
  Lock,
  ArrowUpRight,
  Coins,
  Eye,
  ArrowLeft,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { getKnowledgeDocumentsByTenant } from '@/lib/db';
import {
  cacheKnowledgeDocuments,
  removeCachedKnowledgeDocument,
  queueKnowledgeUpload,
  syncKnowledgeOutbox,
} from '@/lib/sync/knowledge-sync';
import {
  ResponsiveDataListing,
  type ColumnDef,
  type CardMapper,
} from '@/components/shared/responsive-data-listing';
import type { CardAction } from '@/components/shared/responsive-mobile-card';
import { DocumentPreviewDialog } from '@/components/knowledge/document-preview-dialog';

interface DocSummary {
  id: string;
  title: string;
  content?: string;
  updated_at: string;
  source_type?: string;
  file_path?: string | null;
}

type EditTarget = 'new' | string | null;
type InputMode = 'text' | 'file';

// Single source of truth for what may be uploaded — mirrored server-side
// by EXTENSION_MAP in src/lib/ai/extract-text.ts (extension-authoritative).
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.csv', '.md', '.tsv'];
const ACCEPTED_EXTENSIONS = ALLOWED_EXTENSIONS.join(',');
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const PREVIEW_LINES = 3;

const AI_ENABLED_PLANS = new Set(['business', 'growth', 'enterprise']);

interface CreditBalance {
  creditsRemaining: number;
  creditsUsed: number;
  lastResetAt: string | null;
}

function truncateContent(
  content: string | undefined,
  maxLines: number = PREVIEW_LINES
): string {
  if (!content) return '';
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join('\n') + '...';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function KnowledgePage() {
  const { accountId, accountRole, activeWorkspace, profileLoading } = useAuth();
  const currentPlan = activeWorkspace?.plan ?? 'starter';
  const aiIncluded = AI_ENABLED_PLANS.has(currentPlan);
  const canEdit = accountRole === 'owner' || accountRole === 'admin';

  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const loadedAccountIdRef = useRef<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('Settings.aiKnowledge');

  // The create/edit form renders below the list — bring it into view so
  // the Back button (and fields) are visible immediately on open.
  const scrollToForm = () => {
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  // List state
  const [search, setSearch] = useState('');
  const [previewDoc, setPreviewDoc] = useState<DocSummary | null>(null);

  // File upload state
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Credits + embeddings key
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [hasEmbeddingsKey, setHasEmbeddingsKey] = useState(false);
  const [creditsLoading, setCreditsLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!accountId) return;
    setCreditsLoading(true);
    try {
      const res = await fetch('/api/ai/config');
      const data = await res.json();
      if (res.ok) {
        setCredits(data.credits ?? null);
        setHasEmbeddingsKey(Boolean(data.has_embeddings_key));
      }
    } catch {
      // non-critical
    } finally {
      setCreditsLoading(false);
    }
  }, [accountId]);

  const hasAiCredits = Boolean(credits && credits.creditsRemaining > 0);

  const fetchDocs = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai/knowledge');
      const data = await res.json();
      if (res.ok) {
        const list = data.documents ?? [];
        setDocs(list);
        // Cache to IndexedDB for offline access
        await cacheKnowledgeDocuments(accountId, list);
      } else {
        toast.error(data.error ?? t('loadFailed'));
      }
    } catch {
      // Offline fallback: load from IndexedDB
      try {
        const cached = await getKnowledgeDocumentsByTenant(accountId);
        if (cached.length > 0) {
          setDocs(
            cached.map((d) => ({
              id: d.id,
              title: d.title,
              content: d.content,
              updated_at: d.updated_at,
              source_type: d.source_type,
              file_path: d.file_path,
            }))
          );
          toast.info('Showing cached documents (offline)');
        } else {
          toast.error(t('loadFailed'));
        }
      } catch {
        toast.error(t('loadFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [accountId, t]);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchDocs();
    void fetchCredits();
    // Sync any pending offline uploads when we come back online
    void syncKnowledgeOutbox().then(({ synced }) => {
      if (synced > 0) {
        toast.success(`${synced} document(s) synced from offline queue`);
        void fetchDocs();
      }
    });
  }, [accountId, fetchDocs, fetchCredits]);

  // Client-side filter over title + extracted content (the listing is
  // small enough — no server round-trip needed).
  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.content ?? '').toLowerCase().includes(q)
    );
  }, [docs, search]);

  const openNew = () => {
    setEditing('new');
    setTitle('');
    setContent('');
    setInputMode('text');
    setSelectedFile(null);
    scrollToForm();
  };

  const openEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('openFailed'));
        return;
      }
      setEditing(id);
      setTitle(data.title ?? '');
      setContent(data.content ?? '');
      scrollToForm();
    } catch {
      toast.error(t('openFailed'));
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle('');
    setContent('');
    setInputMode('text');
    setSelectedFile(null);
  };

  const saveText = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(t('titleContentRequired'));
      return;
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const res = await fetch(
        isNew ? '/api/ai/knowledge' : `/api/ai/knowledge/${editing}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            content: content.trim(),
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        if (data.warning) toast.warning(data.warning);
        else
          toast.success(isNew ? t('saveSuccessNew') : t('saveSuccessUpdate'));
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      // Offline: queue to outbox
      if (accountId) {
        await queueKnowledgeUpload({
          accountId,
          title: title.trim(),
          content: content.trim(),
          sourceType: 'text',
        });
        toast.info("Saved locally — will sync when you're back online");
        cancelEdit();
        // Show the doc in the list immediately
        await fetchDocs();
      } else {
        toast.error(t('saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) {
      toast.error(t('fileRequired'));
      return;
    }
    if (!hasAiCredits) {
      toast.error(t('creditsRequired'));
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (title.trim()) formData.append('title', title.trim());

      const res = await fetch('/api/ai/knowledge/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        if (data.warning) toast.warning(data.warning);
        else toast.success(t('saveSuccessNew'));
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      // Offline: queue file to outbox
      if (accountId) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: selectedFile.type });
        await queueKnowledgeUpload({
          accountId,
          title: title.trim() || selectedFile.name.replace(/\.[^.]+$/, ''),
          content: '',
          sourceType: 'file',
          fileData: blob,
          fileName: selectedFile.name,
          fileMime: selectedFile.type,
        });
        toast.info("File saved locally — will upload when you're back online");
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(t('saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (editing === 'new' && inputMode === 'file') {
      void saveFile();
    } else {
      void saveText();
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('removeSuccess'));
        setDocs((d) => d.filter((x) => x.id !== id));
        await removeCachedKnowledgeDocument(id);
      } else {
        const data = await res.json();
        toast.error(data.error ?? t('removeFailed'));
      }
    } catch {
      // Offline: remove locally and note it'll need full re-sync later
      setDocs((d) => d.filter((x) => x.id !== id));
      await removeCachedKnowledgeDocument(id);
      toast.info(
        "Removed locally — deletion will sync when you're back online"
      );
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch('/api/ai/knowledge/reindex', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t('reindexSuccess', { count: data.reindexed }));
      } else {
        toast.error(data.error ?? t('reindexFailed'));
      }
    } catch {
      toast.error(t('reindexFailed'));
    } finally {
      setReindexing(false);
    }
  };

  const handleFileSelect = (file: File) => {
    // The `accept` attribute only filters the picker — drag-and-drop and
    // "All files" bypass it, so validate the extension explicitly.
    const ext = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      : '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(t('invalidFileType', { name: file.name }));
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(t('fileTooLarge', { max: MAX_FILE_SIZE_MB }));
      return;
    }
    if (!hasAiCredits) {
      toast.error(t('creditsRequired'));
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const canSave =
    editing === 'new'
      ? inputMode === 'text'
        ? title.trim() && content.trim()
        : !!selectedFile
      : title.trim() && content.trim();

  if (loading || profileLoading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-16">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  // Plan gating: AI knowledge requires Pro or Enterprise
  if (!aiIncluded) {
    return (
      <div className="py-6 sm:py-8">
        <h1 className="text-foreground mb-2 text-xl font-semibold sm:text-2xl">
          Knowledge Base
        </h1>
        <p className="text-muted-foreground mb-4 text-xs sm:mb-6 sm:text-sm">
          Add FAQs, policies, or product details. The AI assistant retrieves
          relevant pieces when drafting and auto-replying.
        </p>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center sm:py-16">
            <div className="bg-muted mb-3 rounded-full p-2.5 sm:mb-4 sm:p-3">
              <Lock className="text-muted-foreground h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <h3 className="text-foreground mb-1 text-base font-semibold sm:text-lg">
              Knowledge Base
            </h3>
            <p className="text-muted-foreground mb-4 max-w-sm text-xs sm:mb-6 sm:text-sm">
              Upload documents and build a knowledge base for AI-powered
              replies. Available on Pro and Enterprise plans.
            </p>
            <Link
              href="/billing"
              className={cn(buttonVariants({ variant: 'default' }))}
            >
              Upgrade plan
              <ArrowUpRight className="ml-1.5 h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const typeBadge = (doc: DocSummary) => (
    <span className="bg-muted inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
      {doc.source_type === 'file' ? (
        <File className="size-3" />
      ) : (
        <FileText className="size-3" />
      )}
      {doc.source_type === 'file' ? t('typeFile') : t('typeText')}
    </span>
  );

  const columns: ColumnDef<DocSummary>[] = [
    {
      header: t('colDocument'),
      cell: (doc) => (
        <div className="flex min-w-0 items-center gap-2">
          <div className="bg-muted shrink-0 rounded-md p-1">
            {doc.source_type === 'file' ? (
              <File className="text-muted-foreground size-3.5" />
            ) : (
              <FileText className="text-muted-foreground size-3.5" />
            )}
          </div>
          <span className="text-foreground truncate text-sm font-medium">
            {doc.title}
          </span>
        </div>
      ),
    },
    {
      header: t('colType'),
      className: 'w-24',
      cell: typeBadge,
    },
    {
      header: t('colUpdated'),
      className: 'hidden w-28 md:table-cell',
      headerClassName: 'hidden w-28 md:table-cell',
      cell: (doc) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(doc.updated_at)}
        </span>
      ),
    },
    {
      header: '',
      className: 'w-28',
      headerClassName: 'w-28',
      cell: (doc) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setPreviewDoc(doc)}
            title={t('preview')}
          >
            <Eye className="size-4" />
          </Button>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => void openEdit(doc.id)}
                title={t('editAction')}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                onClick={() => void remove(doc.id)}
                title={t('deleteAction')}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const cardMapper: CardMapper<DocSummary> = {
    id: (doc) => doc.id,
    title: (doc) => doc.title,
    subtitle: (doc) => formatDate(doc.updated_at),
    fallbackIcon: (doc) => (
      <div className="bg-muted rounded-md p-1.5">
        {doc.source_type === 'file' ? (
          <File className="text-muted-foreground size-4" />
        ) : (
          <FileText className="text-muted-foreground size-4" />
        )}
      </div>
    ),
    statusBadge: typeBadge,
    description: (doc) => truncateContent(doc.content) || null,
    actions: (doc): CardAction[] => [
      {
        label: t('preview'),
        icon: Eye,
        variant: 'outline',
        onClick: () => setPreviewDoc(doc),
      },
      ...(canEdit
        ? ([
            {
              label: t('editAction'),
              icon: Pencil,
              variant: 'outline',
              onClick: () => void openEdit(doc.id),
            },
            {
              label: t('deleteAction'),
              icon: Trash2,
              variant: 'destructive',
              onClick: () => void remove(doc.id),
            },
          ] as CardAction[])
        : []),
    ],
  };

  return (
    <div className="py-6 sm:py-8">
      {/* Header — page-owned (matches Team): title + actions right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-foreground text-xl font-semibold sm:text-2xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1 max-w-[72ch] text-xs sm:text-sm">
            {t('description', {
              searchType: hasEmbeddingsKey
                ? t('semanticSearchOn')
                : t('keywordSearchOn'),
            })}
          </p>
        </div>
        {canEdit && editing === null && (
          <div className="flex shrink-0 items-center gap-2">
            {hasEmbeddingsKey && docs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={reindex}
                disabled={reindexing}
                title={t('reindexTooltip')}
              >
                {reindexing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                <span className="hidden sm:inline">{t('reindex')}</span>
              </Button>
            )}
            <Button
              size="sm"
              onClick={openNew}
              className="flex-1 gap-1.5 sm:flex-none"
            >
              <Plus className="h-4 w-4" /> {t('addDoc')}
            </Button>
          </div>
        )}
      </div>

      {/* Credits status */}
      {!creditsLoading && (
        <div className="text-muted-foreground mt-3 mb-1 flex flex-wrap items-center gap-2 text-xs sm:mt-4 sm:gap-4 sm:text-sm">
          <span className="flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5" />
            AI Credits: {credits?.creditsRemaining?.toFixed(2) ?? '0.00'}{' '}
            remaining
          </span>
          {!hasAiCredits && (
            <span className="text-destructive">
              No credits left — file uploads disabled.{' '}
              <Link href="/billing" className="underline">
                Upgrade plan
              </Link>
            </span>
          )}
        </div>
      )}

      {/* Document list — shared responsive listing (desktop table,
          mobile tap-to-expand cards) */}
      <ResponsiveDataListing<DocSummary>
        items={filteredDocs}
        columns={columns}
        cardMapper={cardMapper}
        loading={false}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('searchPlaceholder')}
        emptyState={{
          icon: BookOpen,
          title: search.trim() ? t('searchNoResults') : t('noDocs'),
          actionLabel: search.trim() || !canEdit ? undefined : t('addDoc'),
          onAction: search.trim() || !canEdit ? undefined : openNew,
        }}
        rowKey={(doc) => doc.id}
      />

      {/* Create/Edit form */}
      {editing !== null && (
        <Card ref={formRef} className="mt-4 sm:mt-5">
          <CardHeader className="pb-3 sm:pb-4">
            <div className="col-span-full flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 shrink-0 gap-1.5 text-muted-foreground"
                onClick={cancelEdit}
                disabled={saving}
              >
                <ArrowLeft className="size-4" />
                {t('back')}
              </Button>
              <CardTitle className="truncate text-base sm:text-lg">
                {editing === 'new' ? t('addDoc') : t('editDocument')}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Mode toggle — only when creating new */}
            {editing === 'new' && (
              <div className="bg-muted flex gap-1 rounded-md p-0.5">
                <button
                  type="button"
                  className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    inputMode === 'text'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => {
                    setInputMode('text');
                    setSelectedFile(null);
                  }}
                >
                  {t('modeText')}
                </button>
                <button
                  type="button"
                  disabled={!hasAiCredits}
                  className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    inputMode === 'file'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  } ${!hasAiCredits ? 'cursor-not-allowed opacity-50' : ''}`}
                  onClick={() => {
                    if (!hasAiCredits) {
                      toast.error(t('creditsRequired'));
                      return;
                    }
                    setInputMode('file');
                    setContent('');
                  }}
                  title={
                    !hasAiCredits ? 'No AI credits remaining' : undefined
                  }
                >
                  {t('modeFile')}
                  {!hasAiCredits && (
                    <Lock className="ml-1 inline h-3 w-3" />
                  )}
                </button>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="kb-title">{t('editDocTitle')}</Label>
              <Input
                id="kb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('editDocTitlePlaceholder')}
                disabled={saving}
              />
            </div>

            {/* Text input mode */}
            {(editing !== 'new' || inputMode === 'text') && (
              <div className="space-y-2">
                <Label htmlFor="kb-content">{t('editDocContent')}</Label>
                <Textarea
                  id="kb-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('editDocContentPlaceholder')}
                  rows={6}
                  className="sm:rows-10 min-h-30 font-mono text-sm sm:min-h-0"
                  disabled={saving}
                />
              </div>
            )}

            {/* File upload mode */}
            {editing === 'new' && inputMode === 'file' && (
              <div className="space-y-2">
                <Label>{t('uploadFile')}</Label>
                <div
                  className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-4 transition-colors sm:p-6 ${
                    dragOver
                      ? 'border-primary bg-primary/5'
                      : selectedFile
                        ? 'border-green-500 bg-green-500/5'
                        : 'border-border hover:border-primary/50'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                      // Allow re-picking the same file after a rejection
                      e.target.value = '';
                    }}
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center gap-1 text-center">
                      <FileText className="h-6 w-6 text-green-600 sm:h-8 sm:w-8" />
                      <span className="text-xs font-medium sm:text-sm">
                        {selectedFile.name}
                      </span>
                      <span className="text-muted-foreground text-[10px] sm:text-xs">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </span>
                      <button
                        type="button"
                        className="text-destructive mt-1 text-xs hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                        }}
                      >
                        {t('removeFile')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-center">
                      <Upload className="text-muted-foreground h-6 w-6 sm:h-8 sm:w-8" />
                      <span className="text-muted-foreground text-xs sm:text-sm">
                        {t('dropOrClick')}
                      </span>
                      <span className="text-muted-foreground text-[10px] sm:text-xs">
                        {t('acceptedFormats', { max: MAX_FILE_SIZE_MB })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                onClick={cancelEdit}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={save}
                disabled={saving || !canSave}
                className="w-full sm:w-auto"
              >
                {saving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('saveDoc')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document preview: PDF embed via signed URL, text otherwise */}
      <DocumentPreviewDialog
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
}
