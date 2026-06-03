import { createMiddleware } from 'hono/factory'

import { hasRole, type WorkspaceRole, type WorkspaceToken } from '../lib/jwt.js'

/**
 * `requireRole(min)` — guard mutating endpoints so only callers whose
 * workspace JWT carries at least `min` role can hit them. Defaults to
 * `member` (i.e. blocks `viewer`).
 *
 * Use AFTER `requireWorkspaceJwt` on the same path so `c.var.workspace`
 * is populated. Returns 403 with a clear error code when the role is
 * insufficient — callers can map it to a "ask your admin to upgrade your
 * seat" affordance in the UI.
 *
 * The `viewer` role exists in `WorkspaceRole`/`ROLE_RANK` but is currently
 * NOT in the DB CHECK constraint on `workspace_members.role`. A separate
 * migration must align them before invite UIs can assign `viewer`. This
 * middleware respects the type-level role regardless.
 */
export function requireRole(min: WorkspaceRole = 'member') {
  return createMiddleware<{ Variables: { workspace: WorkspaceToken } }>(
    async (c, next) => {
      const role = c.var.workspace?.role ?? 'member'
      if (!hasRole(role, min)) {
        return c.json(
          {
            error: 'insufficient_role',
            message:
              min === 'admin' || min === 'owner'
                ? `This action requires the ${min} role. Ask an admin to upgrade your seat.`
                : `Read-only role: you don't have permission to do this. Ask an admin to upgrade your seat.`,
            requiredRole: min,
            yourRole: role,
          },
          403,
        )
      }
      await next()
    },
  )
}
