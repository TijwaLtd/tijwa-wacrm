"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  Zap,
  Plus,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
  FileText,
  MessageCircle,
  MessageSquare,
  Clock,
  Users,
  PhoneCall,
  Loader2,
  Workflow,
  PlayCircle,
  PauseCircle,
  Archive,
  HelpCircle,
  UserPlus,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useCan } from "@/hooks/use-can"
import { useTranslations } from "next-intl"
import type { Automation } from "@/types"
import { Button } from "@/components/ui/button"
import { GatedButton } from "@/components/ui/gated-button"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AUTOMATION_TEMPLATES, type TemplateSlug } from "@/lib/automations/templates"
import { triggerMeta, formatRelative } from "@/lib/automations/trigger-meta"
import { cn } from "@/lib/utils"

const TEMPLATE_ORDER: TemplateSlug[] = [
  "welcome_message",
  "out_of_office",
  "lead_qualifier",
  "follow_up_reminder",
]

const TEMPLATE_ICON: Record<TemplateSlug, typeof Zap> = {
  welcome_message: MessageCircle,
  out_of_office: Clock,
  lead_qualifier: Users,
  follow_up_reminder: PhoneCall,
}

function AutomationsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const canCreate = useCan("send-messages")
  const t = useTranslations("Automations.list")
  const tFlows = useTranslations("Flows.list")
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Flows state
  const [flows, setFlows] = useState<FlowRow[]>([])
  const [flowsLoading, setFlowsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [templates, setTemplates] = useState<TemplateSummary[]>([])

  const activeTab = searchParams.get("tab") === "flows" ? "flows" : "rules"

  const setActiveTab = useCallback((tab: string) => {
    const url = new URL(window.location.href)
    if (tab === "flows") {
      url.searchParams.set("tab", "flows")
    } else {
      url.searchParams.delete("tab")
    }
    router.replace(url.pathname + url.search)
  }, [router])

  async function loadAutomations() {
    try {
      const supabase = createClient()
      const { data, error: fetchErr } = await supabase
        .from("automations")
        .select("*")
        .order("created_at", { ascending: false })
      if (fetchErr) throw fetchErr
      setAutomations((data ?? []) as Automation[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automations")
    }
  }

  async function loadFlows() {
    try {
      const [flowsRes, tmplRes] = await Promise.all([
        fetch("/api/flows"),
        fetch("/api/flows/templates"),
      ])
      if (!flowsRes.ok) {
        throw new Error(`Failed to load flows: ${flowsRes.status}`)
      }
      const flowsJson = (await flowsRes.json()) as { flows: FlowRow[] }
      setFlows(flowsJson.flows ?? [])
      if (tmplRes.ok) {
        const tmplJson = (await tmplRes.json()) as {
          templates: TemplateSummary[]
        }
        setTemplates(tmplJson.templates ?? [])
      }
    } catch (err) {
      console.error(err)
      toast.error(tFlows("loadError"))
    } finally {
      setFlowsLoading(false)
    }
  }

  useEffect(() => {
    loadAutomations()
    loadFlows()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleActive(a: Automation, next: boolean) {
    setAutomations((prev) =>
      prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ?? prev,
    )
    const res = await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    })
    if (!res.ok) {
      setAutomations((prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x)) ?? prev,
      )
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? t("toasts.updateError"))
      return
    }
    toast.success(next ? t("toasts.activated") : t("toasts.paused"))
  }

  async function duplicate(a: Automation) {
    const res = await fetch(`/api/automations/${a.id}/duplicate`, { method: "POST" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? t("toasts.duplicateError"))
      return
    }
    toast.success(t("toasts.duplicated"))
    loadAutomations()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    const res = await fetch(`/api/automations/${pendingDelete.id}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? t("toasts.deleteError"))
      return
    }
    toast.success(t("toasts.deleted"))
    setPendingDelete(null)
    loadAutomations()
  }

  async function startFromTemplate(slug: TemplateSlug) {
    router.push(`/automations/new?template=${slug}`)
  }

  async function handleCreateFlow() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          trigger_type: "keyword",
          trigger_config: { keywords: [] },
        }),
      })
      if (!res.ok) throw new Error(`Create failed: ${res.status}`)
      const json = (await res.json()) as { flow: FlowRow }
      setCreateOpen(false)
      setNewName("")
      router.push(`/flows/${json.flow.id}`)
    } catch (err) {
      console.error(err)
      toast.error(tFlows("createError"))
    } finally {
      setCreating(false)
    }
  }

  async function handleUseFlowTemplate(slug: string) {
    setCreating(true)
    try {
      const res = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_slug: slug }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Clone failed: ${res.status}`)
      }
      const json = (await res.json()) as { flow: FlowRow }
      setCreateOpen(false)
      router.push(`/flows/${json.flow.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : tFlows("cloneError")
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteFlow(flow: FlowRow) {
    const yes = window.confirm(tFlows("deleteConfirm", { name: flow.name }))
    if (!yes) return
    try {
      const res = await fetch(`/api/flows/${flow.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
      setFlows((prev) => prev.filter((f) => f.id !== flow.id))
      toast.success(tFlows("deleteSuccess"))
    } catch (err) {
      console.error(err)
      toast.error(tFlows("deleteError"))
    }
  }

  const automationsLoading = automations === null
  const showTemplates = automations !== null && automations.length < 3

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border-b border-border">
          <TabsTrigger value="rules" className="data-active:bg-muted data-active:text-primary text-muted-foreground">
            <Zap className="h-4 w-4" />
            {t("tabRules")}
          </TabsTrigger>
          <TabsTrigger value="flows" className="data-active:bg-muted data-active:text-primary text-muted-foreground">
            <Workflow className="h-4 w-4" />
            {t("tabFlows")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          {automationsLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <GatedButton
                  canAct={canCreate}
                  gateReason="create automations"
                  onClick={() => router.push("/automations/new")}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  {t("create")}
                </GatedButton>
              </div>

              {showTemplates && (
                <section>
                  <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("templatesTitle")}</h2>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {TEMPLATE_ORDER.map((slug) => {
                      const tmpl = AUTOMATION_TEMPLATES[slug]
                      const Icon = TEMPLATE_ICON[slug]
                      return (
                        <button
                          key={slug}
                          onClick={() => startFromTemplate(slug)}
                          className="group flex flex-col items-start rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-card/80"
                        >
                          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="text-sm font-semibold text-foreground">{tmpl.name}</div>
                          <p className="mt-1 text-xs text-muted-foreground">{tmpl.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              {automations.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Zap className="h-6 w-6 text-primary" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{t("emptyTitle")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("emptyDesc")}
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {automations.map((a) => (
                    <AutomationCard
                      key={a.id}
                      automation={a}
                      onToggle={(next) => toggleActive(a, next)}
                      onEdit={() => router.push(`/automations/${a.id}/edit`)}
                      onDuplicate={() => duplicate(a)}
                      onLogs={() => router.push(`/automations/${a.id}/logs`)}
                      onDelete={() => setPendingDelete(a)}
                      t={t}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="flows">
          {flowsLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <GatedButton
                  canAct={canCreate}
                  gateReason="create flows"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  {tFlows("newFlow")}
                </GatedButton>
              </div>

              {flows.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <Workflow className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h2 className="mt-4 text-base font-medium text-foreground">
                    {tFlows("emptyTitle")}
                  </h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    {tFlows("emptyDesc")}
                  </p>
                  <GatedButton
                    canAct={canCreate}
                    gateReason="create flows"
                    onClick={() => setCreateOpen(true)}
                    className="mt-5"
                  >
                    <Plus className="h-4 w-4" />
                    {tFlows("createFirst")}
                  </GatedButton>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {flows.map((flow) => (
                    <FlowCard
                      key={flow.id}
                      flow={flow}
                      onEdit={() => router.push(`/flows/${flow.id}`)}
                      onDelete={() => handleDeleteFlow(flow)}
                      t={tFlows}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDesc", { name: pendingDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-4xl bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle>{tFlows("createTitle")}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {tFlows("createDesc")}
            </DialogDescription>
          </DialogHeader>

          {templates.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {tFlows("startTemplate")}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                  const Icon = FLOW_TEMPLATE_ICONS[template.icon] ?? FileText
                  return (
                    <button
                      key={template.slug}
                      type="button"
                      onClick={() => handleUseFlowTemplate(template.slug)}
                      disabled={creating}
                      className="flex flex-col gap-2.5 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted disabled:opacity-50"
                    >
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="text-sm font-semibold text-popover-foreground">
                        {template.name}
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {template.description}
                      </span>
                      <span className="mt-auto border-t border-border pt-2 text-[11px] text-muted-foreground">
                        {tFlows("nodeCount", { count: template.node_count })}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {tFlows("startBlank")}
            </p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={tFlows("placeholderName")}
              className="bg-muted"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFlow()
              }}
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {tFlows("cancel")}
            </Button>
            <Button onClick={handleCreateFlow} disabled={!newName.trim() || creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {tFlows("createBlank")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDuplicate,
  onLogs,
  onDelete,
  t,
}: {
  automation: Automation
  onToggle: (next: boolean) => void
  onEdit: () => void
  onDuplicate: () => void
  onLogs: () => void
  onDelete: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const meta = triggerMeta(automation.trigger_type)
  return (
    <li className="rounded-xl border border-border bg-card transition-colors hover:border-border">
      <div className="flex items-center gap-4 p-4">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10"
          aria-hidden
        >
          <Zap className="h-5 w-5 text-primary" />
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {automation.name}
            </span>
            {automation.is_active && (
              <span className="relative flex h-2 w-2" aria-label="active">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
            )}
          </div>
          {automation.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{automation.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                meta.pillClass,
              )}
            >
              {meta.label}
            </span>
            <span className="tabular-nums">
              {automation.execution_count === 1
                ? t("runs", { count: automation.execution_count })
                : t("runsPlural", { count: automation.execution_count })}
            </span>
            <span aria-hidden>·</span>
            <span>{t("lastRun", { time: formatRelative(automation.last_executed_at) })}</span>
          </div>
        </button>

        <div className="flex items-center gap-3">
          <Switch
            checked={automation.is_active}
            onCheckedChange={(v) => onToggle(!!v)}
            aria-label={automation.is_active ? t("deactivate") : t("activate")}
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4" />
                {t("duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogs}>
                <FileText className="h-4 w-4" />
                {t("viewLogs")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  )
}

interface FlowRow {
  id: string
  name: string
  description: string | null
  status: "draft" | "active" | "archived"
  trigger_type: "keyword" | "first_inbound_message" | "manual"
  trigger_config: { keywords?: string[] } | Record<string, unknown>
  execution_count: number
  last_executed_at: string | null
  created_at: string
  updated_at: string
}

interface TemplateSummary {
  slug: string
  name: string
  description: string
  icon: "MessageSquare" | "HelpCircle" | "UserPlus"
  trigger_type: string
  node_count: number
}

const FLOW_TEMPLATE_ICONS = {
  MessageSquare,
  HelpCircle,
  UserPlus,
} as const

const FLOW_STATUS_LABELS = (t: ReturnType<typeof useTranslations>): Record<FlowRow["status"], string> => ({
  draft: t("statusDraft"),
  active: t("statusActive"),
  archived: t("statusArchived"),
})

const FLOW_STATUS_COLORS: Record<FlowRow["status"], string> = {
  draft: "border-border bg-muted text-muted-foreground",
  active: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
  archived: "border-border bg-muted/50 text-muted-foreground",
}

function FlowCard({
  flow,
  onEdit,
  onDelete,
  t,
}: {
  flow: FlowRow
  onEdit: () => void
  onDelete: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const triggerSummary = describeTrigger(flow, t)
  const StatusIcon =
    flow.status === "active"
      ? PlayCircle
      : flow.status === "archived"
        ? Archive
        : PauseCircle
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Workflow className="h-4 w-4 shrink-0 text-primary" />
          <h3 className="truncate text-sm font-semibold text-foreground">
            {flow.name}
          </h3>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            FLOW_STATUS_COLORS[flow.status],
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {FLOW_STATUS_LABELS(t)[flow.status]}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
        {flow.description || triggerSummary}
      </p>

      <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          {t("runCount", { count: flow.execution_count })}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          {t("edit")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("delete")}
        </Button>
      </div>
    </div>
  )
}

function describeTrigger(flow: FlowRow, t: ReturnType<typeof useTranslations>): string {
  if (flow.trigger_type === "keyword") {
    const keywords = Array.isArray(flow.trigger_config.keywords)
      ? (flow.trigger_config.keywords as string[])
      : []
    if (keywords.length === 0) return t("triggerKeywordNone")
    return t("triggerKeyword", { keywords: keywords.join(", ") })
  }
  if (flow.trigger_type === "first_inbound_message") {
    return t("triggerFirstInbound")
  }
  return t("triggerManual")
}

export default function AutomationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <AutomationsPageInner />
    </Suspense>
  )
}
