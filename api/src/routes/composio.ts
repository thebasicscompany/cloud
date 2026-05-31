import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { WorkspaceToken } from '../lib/jwt.js'
import {
  ComposioClient,
  ComposioUnavailableError,
  getComposioApiKey,
  getComposioWebhookSecret,
  handleComposioLifecycleEvent,
  listComposioManagedSkills,
  normalizeConnectLink,
  SUPPORTED_COMPOSIO_WEBHOOK_EVENTS,
  verifyComposioWebhookSignature,
} from '../lib/composio.js'
import { logger } from '../middleware/logger.js'
import { getComposioSkillPreferences } from '../lib/composio-skill-preferences.js'

type Vars = { requestId: string; workspace: WorkspaceToken }

export const composioSkillsRoute = new Hono<{ Variables: Vars }>()
export const composioWebhookRoute = new Hono()

function composioUserId(workspace: WorkspaceToken): string {
  return workspace.account_id || workspace.workspace_id
}

function errorResponse(c: { json: (body: unknown, status: 500 | 502 | 503) => Response }, err: unknown) {
  if (err instanceof ComposioUnavailableError || !getComposioApiKey()) {
    return c.json({ error: 'capability_unavailable', capability: 'composio' }, 503)
  }
  const status = (err as { status?: number })?.status
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return c.json({ error: 'composio_request_failed', status }, 502)
  }
  return c.json({ error: 'composio_request_failed' }, 500)
}

export async function managedComposioSkillsForWorkspace(
  workspace: WorkspaceToken,
  assistantId?: string,
  options?: { includeTools?: boolean },
): Promise<unknown[]> {
  if (!getComposioApiKey()) return []
  const preferences = assistantId
    ? await getComposioSkillPreferences({
        workspaceId: workspace.workspace_id,
        accountId: workspace.account_id,
        assistantId,
      })
    : undefined
  return listComposioManagedSkills(
    composioUserId(workspace),
    undefined,
    preferences,
    options,
  )
}

composioSkillsRoute.get(
  '/composio/tools',
  zValidator(
    'query',
    z.object({
      toolkit_slug: z.string().optional(),
      q: z.string().optional(),
      auth_config_ids: z.string().optional(),
    }),
  ),
  async (c) => {
    try {
      const q = c.req.valid('query')
      const client = new ComposioClient()
      const tools = await client.listTools({
        toolkitSlug: q.toolkit_slug,
        query: q.q,
        authConfigIds: q.auth_config_ids,
      })
      return c.json({ tools })
    } catch (err) {
      return errorResponse(c, err)
    }
  },
)

composioSkillsRoute.post(
  '/composio/connect',
  zValidator(
    'json',
    z.object({
      authConfigId: z.string().min(1),
      callbackUrl: z.string().url().optional(),
    }),
  ),
  async (c) => {
    try {
      const body = c.req.valid('json')
      const client = new ComposioClient()
      const link = await client.createConnectLink(
        body.authConfigId,
        composioUserId(c.var.workspace),
        body.callbackUrl ? { callbackUrl: body.callbackUrl } : undefined,
      )
      return c.json(normalizeConnectLink(link))
    } catch (err) {
      return errorResponse(c, err)
    }
  },
)

/**
 * POST /composio/connect-toolkit — initiate (or re-initiate) a Composio
 * connection by TOOLKIT SLUG (e.g. "gmail"), for the app's "connect /
 * reconnect a toolkit" flow. Unlike `/composio/connect` (which takes a
 * pre-resolved authConfigId), this resolves the toolkit's enabled
 * auth_config first, then mints the OAuth link.
 *
 * Ported verbatim from web `app/api/connections/connect/route.ts`:
 *  1. GET /auth_configs → find the toolkit's enabled (non-DISABLED) config.
 *  2. POST /connected_accounts/link → OAuth redirect URL.
 *
 * The connection is filed under the worker's Composio user_id
 * (`account_id || workspace_id`, same as the rest of this route) so agent
 * runs can see the connected account.
 */
composioSkillsRoute.post(
  '/composio/connect-toolkit',
  zValidator(
    'json',
    z.object({
      toolkit: z.string().min(1),
      callbackUrl: z.string().url().optional(),
    }),
  ),
  async (c) => {
    try {
      const body = c.req.valid('json')
      const toolkit = body.toolkit.trim().toLowerCase()
      if (!toolkit) return c.json({ ok: false, error: "Missing 'toolkit' in request body." }, 400)

      const client = new ComposioClient()

      // 1) Find the toolkit's enabled auth_config (required to mint a link).
      const authConfigs = await client.listAuthConfigs()
      const match = authConfigs.find(
        (a) =>
          (a.toolkit?.slug ?? '').toLowerCase() === toolkit &&
          (a.status ?? '').toUpperCase() !== 'DISABLED',
      )
      if (!match) {
        return c.json(
          {
            ok: false,
            error: `No enabled Composio auth config found for toolkit "${toolkit}".`,
            hint: 'Create/enable an auth config for this toolkit in the Composio dashboard first.',
          },
          404,
        )
      }

      // 2) Mint the OAuth connect link under the worker's Composio user_id
      //    (account_id) so the resulting connection is visible to agent runs.
      const link = await client.createConnectLink(
        match.id,
        composioUserId(c.var.workspace),
        body.callbackUrl ? { callbackUrl: body.callbackUrl } : undefined,
      )
      const normalized = normalizeConnectLink(link)
      const redirectUrl = normalized.redirectUrl
      if (!redirectUrl) {
        return c.json(
          {
            ok: false,
            error: 'Composio returned no redirect_url for the connection.',
            hint: 'The toolkit may use a non-OAuth auth scheme that cannot be completed via a redirect.',
          },
          502,
        )
      }

      return c.json({
        ok: true,
        toolkit,
        redirectUrl,
        connectedAccountId: normalized.connectedAccountId ?? null,
      })
    } catch (err) {
      return errorResponse(c, err)
    }
  },
)

composioSkillsRoute.delete('/composio/connections/:connectedAccountId', async (c) => {
  try {
    const connectedAccountId = c.req.param('connectedAccountId')?.trim()
    if (!connectedAccountId) return c.json({ error: 'invalid_request' }, 400)
    const client = new ComposioClient()
    await client.deleteConnectedAccount(connectedAccountId)
    return c.json({ ok: true })
  } catch (err) {
    return errorResponse(c, err)
  }
})

composioSkillsRoute.post(
  '/composio/tools/:toolSlug/execute',
  zValidator(
    'json',
    z.object({
      connectedAccountId: z.string().optional(),
      arguments: z.record(z.string(), z.unknown()).optional(),
      text: z.string().optional(),
    }),
  ),
  async (c) => {
    try {
      const toolSlug = c.req.param('toolSlug')?.trim()
      if (!toolSlug) return c.json({ error: 'invalid_request' }, 400)
      const body = c.req.valid('json')
      if (!body.arguments && !body.text) return c.json({ error: 'invalid_request' }, 400)
      const client = new ComposioClient()
      return c.json(
        await client.executeTool(toolSlug, {
          userId: composioUserId(c.var.workspace),
          connectedAccountId: body.connectedAccountId,
          arguments: body.arguments,
          text: body.text,
        }),
      )
    } catch (err) {
      return errorResponse(c, err)
    }
  },
)

composioWebhookRoute.post('/composio', async (c) => {
  const secret = getComposioWebhookSecret()
  if (!secret) return c.json({ error: 'Unauthorized' }, 401)

  const rawBody = await c.req.text()
  const verification = verifyComposioWebhookSignature({
    headers: c.req.raw.headers,
    rawBody,
    secret,
  })
  if (!verification.ok) {
    // D.9 diagnostic — capture which headers Composio actually sent so we
    // can match its signing scheme. Logs body shape but never the secret.
    const headersSeen: Record<string, string> = {}
    for (const [k, v] of c.req.raw.headers.entries()) {
      if (/^(webhook|x-|composio|signature|timestamp)/i.test(k)) {
        headersSeen[k] = k.toLowerCase().includes('signature')
          ? `${v.slice(0, 12)}...${v.slice(-8)}`  // partial signature only
          : v
      }
    }
    let bodyPreview = ''
    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>
      bodyPreview = JSON.stringify({
        type: parsed.type, id: parsed.id,
        metadata_keys: Object.keys((parsed.metadata as Record<string, unknown>) ?? {}),
        top_keys: Object.keys(parsed),
      })
    } catch {
      bodyPreview = `(non-json, ${rawBody.length} bytes)`
    }
    logger.warn(
      { reason: verification.reason, headersSeen, bodyPreview, bodyBytes: rawBody.length },
      'composio webhook: signature verification failed',
    )
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const type = typeof verification.payload.type === 'string' ? verification.payload.type : undefined
  if (!type || !SUPPORTED_COMPOSIO_WEBHOOK_EVENTS.has(type)) {
    return c.json({ ok: true, ignored: true })
  }

  return c.json(await handleComposioLifecycleEvent(verification.payload))
})

composioWebhookRoute.all('/composio', (c) => c.json({ error: 'Method not allowed' }, 405))
