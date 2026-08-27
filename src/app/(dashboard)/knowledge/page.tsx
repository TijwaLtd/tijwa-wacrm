'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  CardDescription,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface DocSummary {
  id: string;
  title: string;
  updated_at: string;
  source_type?: string;
}

type EditTarget = 'new' | string | null;
type InputMode = 'text' | 'file';

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.txt,.csv,.md,.tsv';
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const AI_ENABLED_PLANS = new Set(['business', 'growth', 'enterprise']);

interface CreditBalance {
  creditsRemaining: number;
  creditsUsed: number;
  lastResetAt: string | null;
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
  const t = useTranslations('Settings.aiKnowledge');

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
    setLoading(true);
    try {
      const res = await fetch('/api/ai/knowledge');
      const data = await res.json();
      if (res.ok) setDocs(data.documents ?? []);
      else toast.error(data.error ?? t('loadFailed'));
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchDocs();
    void fetchCredits();
  }, [accountId, fetchDocs, fetchCredits]);

  const openNew = () => {
    setEditing('new');
    setTitle('');
    setContent('');
    setInputMode('text');
    setSelectedFile(null);
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
          body: JSON.stringify({ title: title.trim(), content: content.trim() }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        if (data.warning) toast.warning(data.warning);
        else toast.success(isNew ? t('saveSuccessNew') : t('saveSuccessUpdate'));
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
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
      toast.error('AI credits are required for file uploads. Upgrade your plan to continue.');
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
      toast.error(t('saveFailed'));
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
      } else {
        const data = await res.json();
        toast.error(data.error ?? t('removeFailed'));
      }
    } catch {
      toast.error(t('removeFailed'));
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
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    if (!hasAiCredits) {
      toast.error('AI credits are required for file uploads. Upgrade your plan to continue.');
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
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  // Plan gating: AI knowledge requires Pro or Enterprise
  if (!aiIncluded) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <h1 className="mb-2 text-2xl font-semibold text-foreground">Knowledge Base</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Add FAQs, policies, or product details. The AI assistant retrieves relevant pieces when drafting and auto-replying.
        </p>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-3">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              Knowledge Base
            </h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Upload documents and build a knowledge base for AI-powered replies. Available on Pro and Enterprise plans.
            </p>
            <a href="/billing" className={cn(buttonVariants({ variant: 'default' }))}>
              Upgrade plan
              <ArrowUpRight className="ml-1.5 h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Knowledge Base</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add FAQs, policies, or product details. The AI assistant retrieves relevant pieces when drafting and auto-replying.
          {hasEmbeddingsKey
            ? ' Semantic search is on.'
            : ' Using keyword search — add an embeddings key for semantic search.'}
        </p>
      </div>

      {/* Credits status */}
      {!creditsLoading && (
        <div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5" />
            AI Credits: {credits?.creditsRemaining?.toFixed(2) ?? '0.00'} remaining
          </span>
          {!hasAiCredits && (
            <span className="text-destructive">
              No credits left — file uploads disabled.{' '}
              <a href="/billing" className="underline">Upgrade plan</a>
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center py-4 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : (
        <div className="space-y-4">
          {docs.length === 0 && editing === null && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('noDocs')}</p>
                {canEdit && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={openNew}>
                    <Plus className="mr-2 h-4 w-4" /> {t('addDoc')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {docs.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-2 px-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                    {doc.source_type === 'file' ? (
                      <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate font-medium">{doc.title}</span>
                  </span>
                  {canEdit && (
                    <span className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => void openEdit(doc.id)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => void remove(doc.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {editing !== null ? (
            <Card>
              <CardContent className="space-y-3 pt-6">
                {/* Mode toggle — only when creating new */}
                {editing === 'new' && (
                  <div className="flex gap-1 rounded-md bg-muted p-0.5">
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
                          toast.error('AI credits are required for file uploads.');
                          return;
                        }
                        setInputMode('file');
                        setContent('');
                      }}
                      title={!hasAiCredits ? 'No AI credits remaining' : undefined}
                    >
                      {t('modeFile')}
                      {!hasAiCredits && <Lock className="ml-1 inline h-3 w-3" />}
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
                      rows={8}
                      disabled={saving}
                    />
                  </div>
                )}

                {/* File upload mode */}
                {editing === 'new' && inputMode === 'file' && (
                  <div className="space-y-2">
                    <Label>{t('uploadFile')}</Label>
                    <div
                      className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors ${
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
                        }}
                      />
                      {selectedFile ? (
                        <div className="flex flex-col items-center gap-1 text-center">
                          <FileText className="h-8 w-8 text-green-600" />
                          <span className="text-sm font-medium">
                            {selectedFile.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </span>
                          <button
                            type="button"
                            className="mt-1 text-xs text-destructive hover:underline"
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
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {t('dropOrClick')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t('acceptedFormats', { max: MAX_FILE_SIZE_MB })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                    {t('cancel')}
                  </Button>
                  <Button onClick={save} disabled={saving || !canSave}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('saveDoc')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            canEdit && (
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={openNew}>
                  <Plus className="mr-2 h-4 w-4" /> {t('addDoc')}
                </Button>
                {hasEmbeddingsKey && docs.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reindex}
                    disabled={reindexing}
                    title={t('reindexTooltip')}
                  >
                    {reindexing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {t('reindex')}
                  </Button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
