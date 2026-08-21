'use client';

import { useAuth } from '@/hooks/use-auth';

interface WorkspaceBadgeProps {
  accountId: string;
  className?: string;
  size?: 'sm' | 'md';
}

export function WorkspaceBadge({ accountId, className = '', size = 'sm' }: WorkspaceBadgeProps) {
  const { workspaces } = useAuth();
  const workspace = workspaces.find(w => w.account_id === accountId);
  
  if (!workspace) return null;

  const sizeClasses = size === 'sm' 
    ? 'px-1.5 py-0.5 text-[10px]' 
    : 'px-2 py-1 text-xs';

  return (
    <span 
      className={`inline-flex items-center rounded-full bg-muted font-medium text-muted-foreground ${sizeClasses} ${className}`}
      title={workspace.account_name}
    >
      {workspace.account_name}
    </span>
  );
}

interface WorkspaceDotProps {
  accountId: string;
  className?: string;
}

export function WorkspaceDot({ accountId, className = '' }: WorkspaceDotProps) {
  const { workspaces } = useAuth();
  const workspace = workspaces.find(w => w.account_id === accountId);
  
  if (!workspace) return null;

  return (
    <span 
      className={`inline-block w-2 h-2 rounded-full ${className}`}
      style={{ backgroundColor: '#6366f1' }}
      title={workspace.account_name}
    />
  );
}
