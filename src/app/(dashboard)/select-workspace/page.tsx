'use client';

import { useTranslations } from 'next-intl';
import { WorkspaceSelector } from './_components/workspace-selector';

export default function SelectWorkspacePage() {
  const t = useTranslations('SelectWorkspace');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <WorkspaceSelector />
    </div>
  );
}
