/**
 * Agent — a named, workspace-scoped worker the user creates once and then
 * runs (or schedules) repeatedly. Mirrors the `runtime.client_agents` row.
 */

export type AgentTarget = "cloud" | "computer" | "chrome";

export type AgentToolMode = "api" | "browser" | "both";

export interface AgentTool {
  /** Toolkit slug (e.g. "gmail", "slack", "x"). */
  tool: string;
  /** How this agent uses the tool. `both` = needs API auth AND browser cookies. */
  mode: AgentToolMode;
}

export interface AgentSchedule {
  /** Standard 5-field cron expression. */
  cron: string;
  enabled: boolean;
}

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  avatar: string | null;
  instructions: string;
  target: AgentTarget;
  tools: AgentTool[];
  schedule: AgentSchedule | null;
  automationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentDraftMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentDraftPatch {
  name?: string;
  description?: string;
  avatar?: string;
  instructions?: string;
  target?: AgentTarget;
  suggestedTools?: string[];
}

export interface AgentDraftResponse {
  reply: string;
  patch: AgentDraftPatch;
  complete?: boolean;
}
