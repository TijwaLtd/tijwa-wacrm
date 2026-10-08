'use client';

// ============================================================
// MembersTab — Settings → Members
//
// Two stacked sections:
//   1. Roster   — every member of the account. Admin+ can change a
//                 teammate's role inline and remove them. Owner row
//                 is non-editable everywhere (transfer is its own
//                 separate flow, deferred to a later PR).
//   2. Pending  — outstanding invite links. Admin+ can revoke. The
//                 plaintext URL is gone after the create dialog
//                 closes, so we surface a "revoke + new link" hint
//                 rather than pretending we can resurface it.
//
// Role-gating
//   The tab itself is reachable by any member, but mutation buttons
//   are wrapped in `<RequireRole min="admin">` / `useCan` so an
//   agent or viewer sees the roster read-only. The server-side
//   RPCs (set_member_role, remove_account_member) double-check
//   the role anyway.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Loader2,
  Mail,
  MailX,
  Plus,
  Trash2,
  UsersRound,
} from 'lucide-react';

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GatedButton } from '@/components/ui/gated-button';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import { usePresence } from '@/hooks/use-presence';
import type { AccountRole } from '@/lib/auth/roles';
import { hasMetadataSchema } from '@/lib/assignments/team-metadata';
import { presenceLabel, summarize } from '@/lib/presence';
import {
  PRESENCE_DOT_CLASS,
  PresenceDot,
} from '@/components/presence/presence-dot';
import { InviteMemberDialog } from './invite-member-dialog';
import { SeatPurchaseDialog } from './seat-purchase-dialog';
import {
  ResponsiveDataListing,
  type CardMapper,
  type ColumnDef,
} from '@/components/shared/responsive-data-listing';
import type { CardAction } from '@/components/shared/responsive-mobile-card';
import { ROLE_META } from './role-meta';
import { BusinessMetadataDialog } from './business-metadata-dialog';
import { Settings } from 'lucide-react';

interface SeatInfo {
  included_seats: number;
  extra_seats: number;
  total_seats: number;
  seat_price_kes: number;
  current_members: number;
  plan: string;
}

interface Member {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  role: AccountRole;
  joined_at: string;
}

interface Invitation {
  id: string;
  role: 'admin' | 'agent' | 'viewer';
  label: string | null;
  created_at: string;
  expires_at: string;
}

// These roles are translated via `useTranslations("Settings.roles")` where they are used.
const EDITABLE_ROLES: { value: AccountRole }[] = [
  { value: 'admin' },
  { value: 'manager' },
  { value: 'agent' },
  { value: 'receptionist' },
  { value: 'doctor' },
  { value: 'instructor' },
  { value: 'waiter' },
  { value: 'driver' },
  { value: 'rider' },
  { value: 'cleaner' },
  { value: 'viewer' },
];

// Per-role chip metadata (icon / label / colour) lives in the shared
// ROLE_META module so this roster and the Overview identity chip can't
// drift. The colour scale runs amber (owner — scarce, immutable) →
// primary (admin) → muted (agent / viewer).

function fmtDate(iso: string): string {
  // Match the rest of the dashboard's locale-light formatting.
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtExpiresIn(iso: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t('expired');
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return t('expiresInDays', { days });
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return t('expiresInHours', { hours });
}

export function MembersTab() {
  const t = useTranslations('Settings.members');
  const tRoles = useTranslations('Settings.roles');
  const { user, canManageMembers, businessType } = useAuth();
  // The metadata (gear) affordance only exists for business types that
  // actually have a schema — otherwise the dialog opens to a dead shell.
  const showMetadata = canManageMembers && hasMetadataSchema(businessType);
  const { getPresence, getRow, now } = usePresence();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const [pendingMemberAction, setPendingMemberAction] = useState<string | null>(
    null,
  );
  const [seatInfo, setSeatInfo] = useState<SeatInfo | null>(null);
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; price_kes: number; features?: { max_team_members: number } }>>([]);
  const [metadataDialogMember, setMetadataDialogMember] = useState<Member | null>(null);

  const loadEverything = useCallback(async () => {
    try {
      const [mres, ires, seatsRes, plansRes] = await Promise.all([
        fetch('/api/account/members', { cache: 'no-store' }),
        canManageMembers
          ? fetch('/api/account/invitations', { cache: 'no-store' })
          : Promise.resolve(null),
        fetch('/api/subscription/seats', { cache: 'no-store' }),
        fetch('/api/plans', { cache: 'no-store' }),
      ]);

      if (!mres.ok) {
        const payload = await mres.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to load members');
        return;
      }
      const mdata = (await mres.json()) as { members: Member[] };
      setMembers(mdata.members);

      if (ires) {
        if (!ires.ok) {
          const payload = await ires.json().catch(() => ({}));
          toast.error(payload.error || 'Failed to load invitations');
          return;
        }
        const idata = (await ires.json()) as { invitations: Invitation[] };
        setInvitations(idata.invitations);
      } else {
        setInvitations([]);
      }

      if (seatsRes.ok) {
        const sdata = (await seatsRes.json()) as SeatInfo;
        setSeatInfo(sdata);
      }

      if (plansRes.ok) {
        const pdata = (await plansRes.json()) as { plans: Array<{ id: string; name: string; price_kes: number; features?: { max_team_members: number } }> };
        setPlans(pdata.plans ?? []);
      }
    } catch (err) {
      console.error('[MembersTab] load error:', err);
      toast.error('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, [canManageMembers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEverything();
  }, [loadEverything]);

  async function handleRoleChange(member: Member, nextRole: AccountRole) {
    if (member.role === nextRole) return;
    // Optimistic update — flip the dropdown immediately so the UI
    // feels snappy. If the server PATCH fails we revert below so
    // the dropdown doesn't lie about the persisted state.
    const previousRole = member.role;
    setPendingMemberAction(member.user_id);
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === member.user_id ? { ...m, role: nextRole } : m,
      ),
    );
    try {
      const res = await fetch(`/api/account/members/${member.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        // Revert the optimistic flip. The toast on its own wasn't
        // enough — the dropdown was left showing the new role
        // forever, so the next interaction operated on a wrong
        // baseline (re-trying the same change would no-op via the
        // `member.role === nextRole` guard at the top).
        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === member.user_id ? { ...m, role: previousRole } : m,
          ),
        );
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to update role');
        return;
      }
      toast.success(t('updatedToast', { name: member.full_name || t('unnamed'), role: tRoles(nextRole) }));
    } catch (err) {
      // Same revert on network failure.
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === member.user_id ? { ...m, role: previousRole } : m,
        ),
      );
      console.error('[MembersTab] role change error:', err);
      toast.error('Could not reach the server');
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleRemove() {
    if (!removingMember) return;
    setPendingMemberAction(removingMember.user_id);
    try {
      const res = await fetch(
        `/api/account/members/${removingMember.user_id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to remove member');
        return;
      }
      toast.success(t('removedToast', { name: removingMember.full_name || t('unnamed') }));
      setMembers((prev) =>
        prev.filter((m) => m.user_id !== removingMember.user_id),
      );
      setRemovingMember(null);
    } catch (err) {
      console.error('[MembersTab] remove error:', err);
      toast.error('Could not reach the server');
    } finally {
      setPendingMemberAction(null);
    }
  }

  async function handleRevoke(invite: Invitation) {
    try {
      const res = await fetch(`/api/account/invitations/${invite.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to revoke invitation');
        return;
      }
      toast.success(t('revokedToast'));
      setInvitations((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err) {
      console.error('[MembersTab] revoke error:', err);
      toast.error('Could not reach the server');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const canEditRow = (member: Member) =>
    canManageMembers && member.role !== 'owner' && member.user_id !== user?.id;

  const roleBadge = (member: Member) => {
    const roleMeta = ROLE_META[member.role];
    const RoleIcon = roleMeta.icon;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${roleMeta.className}`}
      >
        <RoleIcon className="size-3.5" />
        {tRoles(member.role)}
      </span>
    );
  };

  // Inline role editor — admin+ only AND not allowed on the owner row
  // (owner changes go through transfer, which lands later) or your own
  // row.
  const roleEditor = (member: Member) => {
    const isBusy = pendingMemberAction === member.user_id;
    return (
      <Select
        value={member.role}
        onValueChange={(v) =>
          // Base UI Select can emit null on clear. We don't expose a
          // clear affordance, so the guard is defensive — but the typed
          // signature requires it.
          v && handleRoleChange(member, v as AccountRole)
        }
      >
        <SelectTrigger
          className="w-32 bg-muted border-border text-foreground"
          disabled={isBusy}
        >
          <SelectValue>{tRoles(member.role)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {EDITABLE_ROLES.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {tRoles(r.value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const memberPresenceText = (member: Member) =>
    presenceLabel(
      getPresence(member.user_id),
      getRow(member.user_id)?.last_seen_at ?? null,
      now,
    );

  const columns: ColumnDef<Member>[] = [
    {
      header: t('tableColumns.member'),
      cell: (member) => {
        const isSelf = member.user_id === user?.id;
        const presence = getPresence(member.user_id);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Avatar className="size-9 shrink-0">
                    {member.avatar_url ? (
                      <AvatarImage
                        src={member.avatar_url}
                        alt={member.full_name || 'Member'}
                      />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                      {(member.full_name || member.email || 'U')
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                    {/* role+label so screen readers announce presence —
                        the hover tooltip alone isn't reachable by
                        keyboard/AT on a non-focusable avatar. */}
                    <AvatarBadge
                      role="img"
                      aria-label={memberPresenceText(member)}
                      className={PRESENCE_DOT_CLASS[presence]}
                    />
                  </Avatar>
                }
              />
              <TooltipContent>{memberPresenceText(member)}</TooltipContent>
            </Tooltip>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {member.full_name || t('unnamed')}
                </span>
                {isSelf && (
                  <Badge className="bg-muted text-muted-foreground border-border text-[10px] uppercase tracking-wide">
                    {t('you')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      header: t('tableColumns.email'),
      cell: (member) => (
        <span className="text-sm text-muted-foreground">
          {member.email || '—'}
        </span>
      ),
    },
    {
      header: t('tableColumns.joined'),
      cell: (member) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {fmtDate(member.joined_at)}
        </span>
      ),
    },
    {
      header: t('tableColumns.role'),
      cell: (member) =>
        canEditRow(member) ? roleEditor(member) : roleBadge(member),
    },
    {
      header: t('tableColumns.actions'),
      headerClassName: 'w-24',
      cell: (member) => {
        if (!canManageMembers || member.role === 'owner') return null;
        const isSelf = member.user_id === user?.id;
        // Nothing actionable on your own row without a metadata schema.
        if (isSelf && !showMetadata) return null;
        const isBusy = pendingMemberAction === member.user_id;
        return (
          <div className="flex items-center gap-2">
            {showMetadata && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMetadataDialogMember(member)}
                disabled={isBusy}
                className="h-8 w-8 p-0"
                aria-label={t('businessInfo')}
              >
                <Settings className="size-4" />
              </Button>
            )}
            {!isSelf && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRemovingMember(member)}
                disabled={isBusy}
                className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-200"
                aria-label={t('remove')}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const cardMapper: CardMapper<Member> = {
    id: (member) => member.user_id,
    title: (member) => member.full_name || t('unnamed'),
    subtitle: (member) => member.email || undefined,
    image: (member) => member.avatar_url,
    fallbackIcon: (member) => (
      <span className="text-sm font-medium text-primary">
        {(member.full_name || member.email || 'U').charAt(0).toUpperCase()}
      </span>
    ),
    statusBadge: (member) => roleBadge(member),
    detailFields: (member) => {
      const presence = getPresence(member.user_id);
      return [
        {
          label: t('tableColumns.status'),
          value: (
            <span className="inline-flex items-center gap-1.5">
              <PresenceDot status={presence} />
              {memberPresenceText(member)}
            </span>
          ),
        },
        { label: t('tableColumns.joined'), value: fmtDate(member.joined_at) },
        ...(canEditRow(member)
          ? [
              {
                label: t('tableColumns.role'),
                value: roleEditor(member),
                fullWidth: true,
              },
            ]
          : []),
      ];
    },
    actions: (member): CardAction[] => {
      if (!canManageMembers || member.role === 'owner') return [];
      const isSelf = member.user_id === user?.id;
      return [
        ...(showMetadata
          ? [
              {
                label: t('businessInfo'),
                icon: Settings,
                onClick: () => setMetadataDialogMember(member),
              },
            ]
          : []),
        ...(isSelf
          ? []
          : [
              {
                label: t('remove'),
                icon: Trash2,
                variant: 'destructive' as const,
                onClick: () => setRemovingMember(member),
              },
            ]),
      ];
    },
  };

  // Live presence summary across the roster. Updates without a full
  // refresh as heartbeats and the local re-derive tick land.
  const presenceCounts =
    members.length > 0
      ? summarize(members.map((m) => getPresence(m.user_id)))
      : null;

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      {/* Page header — sits above the tabs so the invite action stays
          reachable from either tab. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="mt-0.5 max-w-[62ch] text-xs text-muted-foreground sm:text-sm">
            {t('description')}
          </p>
        </div>
        <GatedButton
          canAct={canManageMembers}
          gateReason="invite team members"
          onClick={() => {
            // Check if at seat limit
            if (seatInfo && seatInfo.current_members >= seatInfo.total_seats) {
              setSeatDialogOpen(true);
            } else {
              setInviteOpen(true);
            }
          }}
          className="h-9 gap-2 text-xs shadow-xs sm:text-sm"
        >
          <Plus className="h-4 w-4" />
          {t('inviteMember')}
        </GatedButton>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members" className="gap-1.5">
            <UsersRound className="h-4 w-4" />
            {t('title')}
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
              {members.length}
            </span>
          </TabsTrigger>
          {/* Invites tab is admin-only — matches the old RequireRole
              gate on the pending section. */}
          {canManageMembers && (
            <TabsTrigger value="invites" className="gap-1.5">
              <Mail className="h-4 w-4" />
              {t('pendingInvitations')}
              <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                {invitations.length}
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="members" className="pt-4 outline-none">
          <ResponsiveDataListing<Member>
            headerExtra={
              presenceCounts ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <PresenceDot status="online" />
                    {presenceCounts.online} {t('online')}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <PresenceDot status="away" />
                    {presenceCounts.away} {t('away')}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <PresenceDot status="offline" />
                    {presenceCounts.offline} {t('offline')}
                  </span>
                  <span className="text-muted-foreground/70">
                    · {t('memberCount', { count: members.length })}
                  </span>
                </div>
              ) : null
            }
            items={members}
            columns={columns}
            cardMapper={cardMapper}
            loading={false}
            emptyState={{
              icon: UsersRound,
              title: t('noMembersTitle'),
            }}
            rowKey={(member) => member.user_id}
          />
        </TabsContent>

        {canManageMembers && (
          <TabsContent value="invites" className="pt-4 outline-none">
            {/* Pending invitations — tab label + count badge above carry
                the heading, so it's not repeated here. */}
            <RequireRole min="admin">
              <div>
                {/* P10 — make the no-resend design explicit. Admins were
                    confused why the pending list shows roles + expiry but
                    no "copy link again" button. Stating the constraint up
                    front (rather than letting the user discover it by
                    looking for a button) keeps it from feeling like a bug. */}
                {invitations.length > 0 ? (
                  <p className="mb-3 text-xs text-muted-foreground">
                    {t('inviteHint')}
                  </p>
                ) : null}

                {invitations.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                      <Mail className="size-6 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t('noPendingTitle')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.rich('noPendingDesc', { bold: (chunks) => <strong>{chunks}</strong> })}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <ul className="divide-y divide-border">
                        {invitations.map((inv) => {
                          const inviteRoleMeta = ROLE_META[inv.role];
                          const InviteRoleIcon = inviteRoleMeta.icon;
                          return (
                          <li
                            key={inv.id}
                            className="flex items-center gap-4 px-4 py-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {inv.label || t('untitledInvite')}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${inviteRoleMeta.className}`}
                                >
                                  <InviteRoleIcon className="size-3" />
                                  {tRoles(inv.role)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {t('created', { date: fmtDate(inv.created_at) })} · {fmtExpiresIn(inv.expires_at, t)}
                              </p>
                            </div>

                            {/* Revoke: red default state, mirrors the
                                members-tab Remove button. Pre-polish version
                                read as a neutral secondary button until
                                hover. */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRevoke(inv)}
                              className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 hover:text-red-200"
                            >
                              <MailX className="size-4" />
                              {t('revoke')}
                            </Button>
                          </li>
                          );
                        })}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </RequireRole>
          </TabsContent>
        )}
      </Tabs>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onCreated={loadEverything}
        onSeatLimitReached={() => setSeatDialogOpen(true)}
      />

      {seatInfo && (
        <SeatPurchaseDialog
          open={seatDialogOpen}
          onOpenChange={setSeatDialogOpen}
          onSeatPurchased={loadEverything}
          onUpgrade={(planId) => {
            setSeatDialogOpen(false);
            window.location.href = `/billing?upgrade=${planId}`;
          }}
          currentPlan={seatInfo.plan}
          plans={plans}
          currentMembers={seatInfo.current_members}
          includedSeats={seatInfo.included_seats}
          seatPrice={seatInfo.seat_price_kes}
          proratedCharge={Math.round(seatInfo.seat_price_kes * 0.5)}
          daysRemaining={15}
        />
      )}

      <Dialog
        open={removingMember !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingMember(null);
        }}
      >
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-popover-foreground">
              <AlertTriangle className="size-4 text-amber-400" />
              {t('removeDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t.rich('removeDialogDesc', { 
                name: removingMember?.full_name || t('unnamed'),
                bold: (chunks: React.ReactNode) => <strong>{chunks}</strong>
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setRemovingMember(null)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleRemove}
              disabled={!!pendingMemberAction}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {pendingMemberAction ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('removing')}
                </>
              ) : (
                t('removeBtn')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {metadataDialogMember && (
        <BusinessMetadataDialog
          open={metadataDialogMember !== null}
          onOpenChange={(open) => {
            if (!open) setMetadataDialogMember(null);
          }}
          memberUserId={metadataDialogMember.user_id}
          memberName={metadataDialogMember.full_name || t('unnamed')}
        />
      )}
    </section>
  );
}
