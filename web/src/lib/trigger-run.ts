import "server-only";

import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Triggers a REAL cloud agent run by invoking the deployed basics-cron-kicker
 * Lambda (legacy cloud_agents path). The kicker INSERTs a cloud_runs row and
 * enqueues the job on basics-runs.fifo; the dispatcher routes it to a warm
 * worker pool which executes it via opencode. This is the same entry point the
 * scheduler uses — not a mock.
 */
const KICKER = process.env.CRON_KICKER_FUNCTION_NAME ?? "basics-cron-kicker";

let _lambda: LambdaClient | null = null;
function lambda(): LambdaClient {
  if (!_lambda) _lambda = new LambdaClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  return _lambda;
}

// Default workspace for ad-hoc UI-triggered runs (the primary populated
// workspace). Overridable per request.
const DEFAULT_WORKSPACE = "139e7cdc-7060-49c8-a04f-2afffddbd708";

export async function triggerCloudRun(input: {
  goal: string;
  workspaceId?: string;
}): Promise<{ ok: boolean; runId?: string; error?: string }> {
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Backend not connected." };
  const goal = input.goal?.trim();
  if (!goal) return { ok: false, error: "A goal is required." };

  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE;

  // Find the workspace's ad-hoc agent + an owner account to attribute the run.
  const agent = await supabase
    .from("cloud_agents")
    .select("id,account_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", "ad-hoc")
    .maybeSingle();
  let cloudAgentId = agent.data?.id as string | undefined;
  let accountId = agent.data?.account_id as string | undefined;

  if (!accountId) {
    const owner = await supabase
      .from("workspace_members")
      .select("account_id")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();
    accountId = owner.data?.account_id as string | undefined;
  }
  if (!cloudAgentId || !accountId) {
    return { ok: false, error: "No ad-hoc agent/owner for this workspace." };
  }

  try {
    const res = await lambda().send(
      new InvokeCommand({
        FunctionName: KICKER,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(JSON.stringify({ cloudAgentId, workspaceId, accountId, goal })),
      }),
    );
    const raw = res.Payload ? Buffer.from(res.Payload).toString("utf8") : "{}";
    const parsed = JSON.parse(raw) as { runId?: string; errorMessage?: string };
    if (parsed.errorMessage) return { ok: false, error: parsed.errorMessage };
    if (!parsed.runId) return { ok: false, error: "Kicker returned no runId." };
    return { ok: true, runId: parsed.runId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
