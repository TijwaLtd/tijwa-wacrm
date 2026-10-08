'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  RAIL_GROUPS,
  SECTION_META,
  visibleSectionsForRole,
  type AccountRole,
  type SettingsSection,
} from './settings-sections';

/**
 * Mobile drill-down index for Settings. Below `lg` the desktop rail's
 * horizontal chip strip is unusable, so the sections are listed
 * vertically (grouped, one tappable row each) and tapping a row opens
 * that section's panel with a back button returning here.
 *
 * Role-sensitive: rows are filtered with the same
 * `visibleSectionsForRole` helper as the desktop rail, so viewers
 * never see admin-only entries.
 */
export function SettingsMobileIndex({
  onSelect,
  accountRole,
}: {
  onSelect: (section: SettingsSection) => void;
  accountRole?: AccountRole | null;
}) {
  const t = useTranslations('Settings');

  return (
    <nav aria-label={t('pageTitle')} className="space-y-6 lg:hidden">
      {RAIL_GROUPS.map(({ label, group }) => {
        const items = visibleSectionsForRole(group, accountRole);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            {label && (
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                {t(`groups.${group}`)}
              </div>
            )}
            <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
              {items.map((s) => {
                const Icon = SECTION_META[s].icon;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSelect(s)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="flex-1">{t(`sections.${s}`)}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
