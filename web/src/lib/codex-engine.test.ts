import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultCodexEngineStore, evaluateCodexPolicy, projectCodexJsonlEvents, setCodexEngineUnauthenticated } from "@/lib/codex-engine";

test("projects Codex JSONL into Basics run events and tool calls", () => {
  const projected = projectCodexJsonlEvents(
    [
      { type: "thread.started", thread_id: "thread_123" },
      { type: "turn.started" },
      {
        type: "item.started",
        item: {
          id: "cmd_1",
          item_type: "command_execution",
          command: "pnpm test",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "cmd_1",
          item_type: "command_execution",
          command: "pnpm test",
        },
      },
      { type: "turn.completed" },
    ],
    {
      runId: "run_local_codex",
      actorAccountId: "local-dev-owner",
      deviceId: "device_local",
      target: "codex_exec",
      runtime: "codex_exec",
      startedAt: "2026-05-28T09:00:00.000Z",
    },
  );

  assert.equal(projected.terminalStatus, "complete");
  assert.equal(projected.toolCalls[0]?.id, "tool_cmd_1");
  assert.equal(projected.toolCalls[0]?.name, "codex.command_execution");
  assert.equal(projected.events.some((event) => event.type === "codex.thread.started"), true);
  assert.equal(projected.events.some((event) => event.type === "tool_call.started" && event.toolCallId === "tool_cmd_1"), true);
  assert.equal(projected.events.every((event) => event.actorAccountId && event.deviceId && event.target && event.runtime && event.createdAt), true);
});

test("Codex policy fails closed when the local account is unavailable", () => {
  const store = setCodexEngineUnauthenticated(createDefaultCodexEngineStore());
  const policy = evaluateCodexPolicy({
    prompt: "Build an internal app",
    mode: "codex_app_server",
    taskKind: "build_app",
    requestedTarget: "codex_app_server",
    status: store.status,
  });

  assert.equal(policy.allowed, false);
  assert.equal(policy.fallbackAllowed, false);
  assert.equal(policy.approvalPolicy, "blocked");
  assert.equal(policy.deniedReason, "Codex is unavailable or unauthenticated.");
});

test("Codex policy allows app-building but blocks local Codex cloud authority", () => {
  const store = createDefaultCodexEngineStore();
  const policy = evaluateCodexPolicy({
    prompt: "Build and deploy an internal app",
    mode: "codex_app_server",
    taskKind: "deploy_app",
    requestedTarget: "auto",
    status: store.status,
  });

  assert.equal(policy.allowed, true);
  assert.equal(policy.appBuilding, "allowed");
  assert.equal(policy.filesystem, "workspace_write");
  assert.equal(policy.commandExecution, "requires_approval");
  assert.equal(policy.network, "blocked");
  assert.equal(policy.cloudUse, "blocked_local_codex");
  assert.equal(policy.fallbackAllowed, true);
});
