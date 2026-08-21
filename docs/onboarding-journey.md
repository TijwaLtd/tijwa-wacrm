# User Journey: Onboarding

## New User (Creating Account)

```
Signup → Email Verify → Onboarding → Create Workspace → Dashboard
```

1. **Signup** (`/signup`)
   - User enters email + password
   - Supabase creates `auth.users` row
   - Trigger creates `accounts` row (personal) + `profiles` row (no membership yet)

2. **Email Verification**
   - User clicks link in email
   - Returns to app as verified user

3. **Onboarding** (`/onboarding`)
   - Shown because user has no workspace membership
   - User enters workspace name (e.g., "Acme Corp")
   - System auto-generates subdomain: `acme-corp.wacrm.com`
   - User clicks "Create workspace"
   - API creates:
     - `account_memberships` row (role: owner)
     - `tenant_settings` row (plan: starter)
     - `subscriptions` row (plan: starter, status: active)

4. **Dashboard** (`/dashboard`)
   - Redirected to dashboard with active workspace set
   - Cookie `wacrm_active_account` stores current workspace

---

## Invited User

```
Signup/Login → Accept Invite → Dashboard
```

### Option A: New User

1. **Signup** (`/signup?invite=<token>`)
   - User enters email + password
   - Trigger creates personal account + profile

2. **Accept Invite** (`/join/<token>`)
   - Page shows workspace name + role being offered
   - User clicks "Accept invitation"
   - API calls `redeem_invitation` RPC
   - RPC creates `account_memberships` row with assigned role
   - Personal account kept but unused

3. **Dashboard** (`/dashboard`)
   - Redirected to dashboard with invited workspace active

### Option B: Existing User

1. **Login** (`/login?invite=<token>`)
   - User signs in with existing credentials

2. **Accept Invite** (`/join/<token>`)
   - Same flow as Option A, skipping signup

---

## Workspace Selection (No Active Workspace)

When user has memberships but no `wacrm_active_account` cookie:

```
/select-workspace → Choose Workspace → Dashboard
```

1. User redirected to `/select-workspace`
2. Grid shows all workspaces user belongs to with:
   - Workspace name + subdomain
   - Role badge
   - Unread notification count
   - Active indicator
3. User clicks a workspace → cookie set → dashboard

---

## Workspace Switcher (Header)

Located in header (desktop only), shows current workspace name with notification badge.

**Dropdown options:**
- "All workspaces" - aggregated view
- Individual workspaces with unread counts
- "Create new workspace" link

---

## Settings → Workspace

**Settings → Workspace** panel allows:
- Edit workspace name
- View subdomain (auto-generated)
- Set logo URL
- Set accent color
- **Danger zone:**
  - Leave workspace (all users)
  - Delete workspace (owner only, requires no other members)

---

## Key Pages & Routes

| Route | Purpose |
|-------|---------|
| `/onboarding` | Create or join first workspace |
| `/select-workspace` | Choose workspace when multiple exist |
| `/settings?tab=workspace` | Edit workspace settings |
| `/settings?tab=members` | Manage team members & invites |
| `/settings?tab=plans` | View/change plan |
| `/plans` | Standalone plans page |

---

## Key Flows

### Creating Additional Workspace
1. Header dropdown → "Create new workspace" OR Settings → Workspace
2. Same as onboarding flow but for existing users

### Leaving Workspace
- Settings → Workspace → "Leave workspace"
- User removed from `account_memberships`
- Redirected to another workspace or `/onboarding`

### Deleting Workspace
- Settings → Workspace → "Delete workspace" (owner only)
- Must have no other members
- Cascades deletion to all workspace data

### Switching Workspaces
- Header dropdown → select workspace
- Cookie updated
- All data views filter to selected workspace
