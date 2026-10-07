'use client';

import { MembersTab } from '@/components/settings/members-tab';

/**
 * Team — the account roster and pending invites.
 *
 * This used to live in Settings → Team members; it's a top-level
 * destination now (sidebar, admin+). MembersTab already brings its own
 * panel head, action button, and role gating (mutations are admin+,
 * server-checked), so this page is a thin wrapper.
 */
export default function TeamPage() {
  return (
    <div>
      <MembersTab />
    </div>
  );
}
