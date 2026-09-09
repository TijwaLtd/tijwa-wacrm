// ============================================================
// Account role helpers — pure, unit-testable, no I/O.
//
// Mirrors the `account_role_enum` Postgres type.
// Supports core hierarchical roles plus domain-specific operational roles
// (manager, driver, rider, receptionist, doctor, instructor, waiter, cleaner).
// ============================================================

export type AccountRole =
  | "owner"
  | "admin"
  | "manager"
  | "agent"
  | "driver"
  | "rider"
  | "receptionist"
  | "doctor"
  | "instructor"
  | "waiter"
  | "cleaner"
  | "viewer";

/** Ordered list of every valid role. */
export const ACCOUNT_ROLES: readonly AccountRole[] = [
  "viewer",
  "cleaner",
  "waiter",
  "driver",
  "rider",
  "doctor",
  "instructor",
  "receptionist",
  "agent",
  "manager",
  "admin",
  "owner",
] as const;

export const ROLE_LABELS: Record<AccountRole, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full organization ownership and billing control" },
  admin: { label: "Admin", description: "Workspace management, member invites, and system settings" },
  manager: { label: "Operations Manager", description: "Manages catalog, orders, bookings, and rider assignments" },
  agent: { label: "Customer Agent", description: "Handles customer messages, chats, and operational requests" },
  receptionist: { label: "Receptionist", description: "Front desk reservations, bookings, and guest check-ins" },
  instructor: { label: "Instructor / Teacher", description: "Manages courses, students, and education resources" },
  doctor: { label: "Doctor / Practitioner", description: "Manages appointments, patients, and clinical schedules" },
  waiter: { label: "Waiter / Server", description: "Takes food orders and handles table requests" },
  driver: { label: "Delivery Driver", description: "Mobile delivery job updates and parcel dispatch" },
  rider: { label: "Express Rider", description: "Mobile rider dispatch and instant errand updates" },
  cleaner: { label: "Service Technician", description: "Service task completion and maintenance logs" },
  viewer: { label: "Viewer", description: "Read-only access to analytics and activity logs" },
};

/**
 * Numeric rank of a role. Higher = more privileged.
 */
export function roleRank(role: AccountRole): number {
  switch (role) {
    case "owner":
      return 100;
    case "admin":
      return 80;
    case "manager":
      return 60;
    case "agent":
      return 40;
    case "receptionist":
    case "instructor":
    case "doctor":
      return 35;
    case "waiter":
    case "driver":
    case "rider":
    case "cleaner":
      return 30;
    case "viewer":
      return 10;
    default:
      return 10;
  }
}

/**
 * True iff `role` is at least as privileged as `min`.
 */
export function hasMinRole(role: AccountRole, min: AccountRole): boolean {
  return roleRank(role) >= roleRank(min);
}

/** Type-narrow an unknown string into a valid `AccountRole`. */
export function isAccountRole(value: unknown): value is AccountRole {
  return (
    typeof value === "string" &&
    (ACCOUNT_ROLES as readonly string[]).includes(value)
  );
}

// ============================================================
// Capability predicates
// ============================================================

/** Owner / admin: invite, remove, change roles. */
export function canManageMembers(role: AccountRole): boolean {
  return hasMinRole(role, "admin");
}

/** Owner / admin: edit account-wide settings. */
export function canEditSettings(role: AccountRole): boolean {
  return hasMinRole(role, "admin");
}

/** Owner / admin / manager / agent: manage catalog, orders, and bookings. */
export function canManageOperations(role: AccountRole): boolean {
  return hasMinRole(role, "agent");
}

/** Owner / admin / manager / agent / receptionist / waiter: write operational data. */
export function canSendMessages(role: AccountRole): boolean {
  return hasMinRole(role, "agent") || role === "receptionist" || role === "waiter";
}

/** Field delivery staff check: driver or rider. */
export function isFieldStaff(role: AccountRole): boolean {
  return role === "driver" || role === "rider" || role === "cleaner";
}

/** Viewer: read-only across everything. */
export function canViewOnly(role: AccountRole): boolean {
  return role === "viewer";
}

/** Owner only: irreversible destructive operations. */
export function canDeleteAccount(role: AccountRole): boolean {
  return role === "owner";
}

/** Owner only: hand the account to another member. */
export function canTransferOwnership(role: AccountRole): boolean {
  return role === "owner";
}

/** Owner / admin / manager: view audit logs. */
export function canViewAudit(role: AccountRole): boolean {
  return hasMinRole(role, "manager");
}
