import {
  // ArrowRightLeft, — hidden section (auto-assign)
  Building2,
  Calendar,
  Calculator,
  Coins,
  CreditCard,
  FileText,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  Palette,
  PlugZap,
  Shield,
  // Sparkles, — hidden section (AI assistant)
  Tags,
  User,
  // Zap, — hidden section (quick replies)
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import { hasMinRole, type AccountRole } from '@/lib/auth/roles';

export type { AccountRole } from '@/lib/auth/roles';
export { hasMinRole } from '@/lib/auth/roles';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'help',
  'whatsapp',
  'templates',
  // Temporarily hidden from settings (commented, not deleted — the
  // panels themselves still exist). Re-enable by uncommenting here,
  // in SECTION_META, and in settings/page.tsx:
  // 'quick-replies',
  'fields',
  'deals',
  // 'ai',
  // 'auto-assign',
  'departments',
  // 'skills',
  'schedule',
  // Team members lives on its own page now (/team) — not a settings section.
  'workspace',
  'business',
  'payment-methods',
  'pricing',
  'api',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

/** Rail grouping. `minRole` restricts visibility to that role or higher. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
  minRole?: AccountRole;  // undefined = any authenticated user
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Overview', icon: LayoutGrid, group: 'top' },
  profile: { id: 'profile', label: 'Your profile', icon: User, group: 'account' },
  security: { id: 'security', label: 'Login & security', icon: Shield, group: 'account' },
  appearance: { id: 'appearance', label: 'Appearance', icon: Palette, group: 'account' },
  // No minRole: every member (viewers included) reaches help + tickets.
  help: { id: 'help', label: 'Help & support', icon: LifeBuoy, group: 'account' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace', minRole: 'admin' },
  templates: { id: 'templates', label: 'Templates', icon: FileText, group: 'workspace', minRole: 'admin' },
  // 'quick-replies': { id: 'quick-replies', label: 'Quick replies', icon: Zap, group: 'workspace', minRole: 'admin' },
  fields: { id: 'fields', label: 'Fields & tags', icon: Tags, group: 'workspace', minRole: 'admin' },
  deals: { id: 'deals', label: 'Deals & currency', icon: Coins, group: 'workspace', minRole: 'admin' },
  // ai: { id: 'ai', label: 'AI Assistant', icon: Sparkles, group: 'workspace', minRole: 'admin' },
  // 'auto-assign': { id: 'auto-assign', label: 'Auto-assignment', icon: ArrowRightLeft, group: 'workspace', minRole: 'admin' },
  departments: { id: 'departments', label: 'Departments', icon: Building2, group: 'workspace', minRole: 'admin' },
  // skills: { id: 'skills', label: 'Agent skills', icon: Tags, group: 'workspace', minRole: 'admin' },
  schedule: { id: 'schedule', label: 'Working hours', icon: Calendar, group: 'workspace', minRole: 'admin' },
  workspace: { id: 'workspace', label: 'Workspace', icon: Building2, group: 'workspace', minRole: 'owner' },
  business: { id: 'business', label: 'Business type', icon: Briefcase, group: 'workspace', minRole: 'owner' },
  'payment-methods': { id: 'payment-methods', label: 'Payment methods', icon: CreditCard, group: 'workspace', minRole: 'owner' },
  pricing: { id: 'pricing', label: 'Pricing formulas', icon: Calculator, group: 'workspace', minRole: 'owner' },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace', minRole: 'owner' },
};

export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Account', group: 'account' },
  { label: 'Workspace', group: 'workspace' },
];

/**
 * Sections of a rail group that this role may open — single source of
 * truth for the desktop rail AND the mobile drill-down index.
 * A null/undefined role shows everything (auth still loading; the page
 * redirects to Overview if the picked section turns out to be forbidden).
 */
export function visibleSectionsForRole(
  group: SectionMeta['group'],
  accountRole?: AccountRole | null,
): SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (s) =>
      SECTION_META[s].group === group &&
      (!accountRole ||
        !SECTION_META[s].minRole ||
        hasMinRole(accountRole, SECTION_META[s].minRole)),
  );
}

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (raw === 'plans') return 'overview';
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
