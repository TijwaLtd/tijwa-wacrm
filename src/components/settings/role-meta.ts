import {
  Crown,
  Shield,
  UserCog,
  UserIcon,
  Briefcase,
  Truck,
  Package,
  Calendar,
  Stethoscope,
  GraduationCap,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { AccountRole } from '@/lib/auth/roles';
import type { ChipVariant } from './settings-chip';

export const ROLE_META: Record<
  AccountRole,
  { icon: LucideIcon; label: string; variant: ChipVariant; className: string }
> = {
  owner: {
    icon: Crown,
    label: 'owner',
    variant: 'owner',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  admin: {
    icon: Shield,
    label: 'admin',
    variant: 'admin',
    className: 'border-primary/40 bg-primary/10 text-primary',
  },
  manager: {
    icon: Briefcase,
    label: 'manager',
    variant: 'admin',
    className: 'border-blue-500/40 bg-blue-500/10 text-blue-400',
  },
  agent: {
    icon: UserCog,
    label: 'agent',
    variant: 'muted',
    className: 'border-border bg-muted text-muted-foreground',
  },
  driver: {
    icon: Truck,
    label: 'driver',
    variant: 'ok',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  },
  rider: {
    icon: Package,
    label: 'rider',
    variant: 'ok',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  },
  receptionist: {
    icon: Calendar,
    label: 'receptionist',
    variant: 'muted',
    className: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
  },
  doctor: {
    icon: Stethoscope,
    label: 'doctor',
    variant: 'admin',
    className: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400',
  },
  instructor: {
    icon: GraduationCap,
    label: 'instructor',
    variant: 'muted',
    className: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400',
  },
  waiter: {
    icon: UtensilsCrossed,
    label: 'waiter',
    variant: 'muted',
    className: 'border-orange-500/40 bg-orange-500/10 text-orange-400',
  },
  cleaner: {
    icon: Wrench,
    label: 'cleaner',
    variant: 'muted',
    className: 'border-slate-500/40 bg-slate-500/10 text-slate-400',
  },
  viewer: {
    icon: UserIcon,
    label: 'viewer',
    variant: 'muted',
    className: 'border-border bg-transparent text-muted-foreground',
  },
};
