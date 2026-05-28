import type { RunStatus } from "@/types/runs";

export const RUN_STATUS_OPTIONS: Array<{ value: RunStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "paused", label: "Paused" },
  { value: "verifying", label: "Verifying" },
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Unverified" },
  { value: "failed", label: "Failed" },
  { value: "stopped", label: "Stopped" },
  { value: "completed", label: "Completed" },
];
