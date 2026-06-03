// `resource_register` - durable registry of artifacts the agent created or
// touched on a previous run. Calls POST /v1/resources on the API, which is
// idempotent on (workspace_id, kind, external_id) - so the agent can call
// this freely without worrying about duplicates.
//
// Use cases:
//   - Agent just created a Notion page / Airtable base / Google Doc; register
//     so the NEXT run sees it in the workspace-resources prompt fragment and
//     edits the existing one instead of making a parallel copy.
//   - Agent discovered an existing resource the user cares about (e.g. user
//     told the agent "use my Q3 leads tracker") and wants to remember it.
//
// The agent should NOT call this for ephemeral side-effects (a single email
// sent, a screenshot, a single tool-call result). Only for things the user
// will go back to and edit.

import { defineTool } from "@basics/shared";
import { z } from "zod";

import { signWorkerWorkspaceJwt } from "../authoring/jwt.js";
import type { WorkerToolContext } from "./context.js";

interface ResourceRegisterDeps {
  fetch?: typeof fetch;
  apiBaseUrl?: string;
  jwtSecret?: string;
}

let injectedDeps: ResourceRegisterDeps | null = null;
export function setResourceRegisterDeps(deps: ResourceRegisterDeps | null) {
  injectedDeps = deps;
}

function defaultDeps(): Required<ResourceRegisterDeps> {
  const apiBaseUrl = injectedDeps?.apiBaseUrl ?? process.env.API_BASE_URL;
  const jwtSecret = injectedDeps?.jwtSecret ?? process.env.WORKSPACE_JWT_SECRET;
  if (!apiBaseUrl) throw new Error("resource_register: API_BASE_URL not configured");
  if (!jwtSecret) throw new Error("resource_register: WORKSPACE_JWT_SECRET not configured");
  return {
    fetch: injectedDeps?.fetch ?? fetch,
    apiBaseUrl,
    jwtSecret,
  };
}

const ParamsSchema = z.object({
  kind: z
    .string()
    .regex(/^[a-z0-9_]{1,60}$/, "kind must be lowercase ASCII/underscores"),
  name: z.string().min(1).max(200),
  url: z.string().url().max(2048).optional(),
  externalId: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  toolkitSlug: z.string().regex(/^[a-z0-9_]{1,60}$/).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const resource_register = defineTool({
  name: "resource_register",
  description:
    "Register a long-lived artifact (Notion page, Google Doc/Sheet, Airtable base, Slack channel, Linear project, etc.) so future runs see it in <workspace_resources> and edit/append rather than recreate. Idempotent on (kind + externalId). Set externalId to the API's identifier (notion page id, google file id, etc.) so the agent can call back into the system. Set source='agent_created' is implicit; the agent doesn't set source itself.",
  params: ParamsSchema,
  // Writes a DB row but doesn't move money or notify a human - no approval gate.
  mutating: true,
  requiresApproval: false,
  cost: "low",
  execute: async (
    { kind, name, url, externalId, description, toolkitSlug, metadata },
    ctx: WorkerToolContext,
  ) => {
    const deps = defaultDeps();
    const token = signWorkerWorkspaceJwt(deps.jwtSecret, {
      workspaceId: ctx.workspaceId,
      accountId: ctx.accountId,
    });
    const body = {
      kind,
      name,
      url,
      externalId,
      description,
      toolkitSlug,
      metadata,
      source: "agent_created" as const,
      createdByRunId: ctx.runId,
    };
    const res = await deps.fetch(`${deps.apiBaseUrl}/v1/resources`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      await ctx.publish({
        type: "resource_register_failed",
        payload: { status: res.status, body: parsed, kind, externalId },
      });
      return {
        kind: "json" as const,
        json: { ok: false, status: res.status, error: parsed },
      };
    }
    const data = parsed as {
      resource: { id: string; kind: string; name: string; externalId: string | null };
      existed: boolean;
    };
    await ctx.publish({
      type: "resource_registered",
      payload: {
        resourceId: data.resource.id,
        kind: data.resource.kind,
        name: data.resource.name,
        existed: data.existed,
      },
    });
    return {
      kind: "json" as const,
      json: { ok: true, resourceId: data.resource.id, existed: data.existed },
    };
  },
});
