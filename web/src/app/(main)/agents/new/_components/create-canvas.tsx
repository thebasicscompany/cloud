"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";

import { ArrowUp, Check, Sparkles } from "@/icons";

import { AuroraCanvas } from "@/components/aurora-canvas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { draftWithBasics, useAgentActions } from "@/hooks/queries/use-agents";
import type {
  AgentDraftMessage,
  AgentDraftPatch,
  AgentSchedule,
  AgentTarget,
  AgentTool,
} from "@/types/agent";

const TARGETS: Array<{ id: AgentTarget; title: string; blurb: string; emoji: string }> = [
  { id: "cloud", title: "Cloud", blurb: "A fresh cloud browser. No logins needed.", emoji: "☁️" },
  { id: "computer", title: "Computer use", blurb: "Your Mac — apps, Finder, system stuff.", emoji: "🖥️" },
  { id: "chrome", title: "Your Chrome", blurb: "Your real Chrome, your logged-in sessions.", emoji: "🌐" },
];

// Catalog of tools Basics can suggest. `kind` decides which Connect flow runs:
//  • api    — Composio OAuth (POST /api/connections/connect)
//  • site   — per-host cookie capture (POST /api/browser-sites/connect)
//  • both   — both flows are shown side-by-side
//
// The label for `site` reads "Sign in on <host>" so the user understands
// what's being captured (cookies from a real sign-in, not a generic session).
type ToolKind = "api" | "site" | "both";
interface ToolMeta { label: string; description: string; kind: ToolKind; host?: string }
const TOOL_CATALOG: Record<string, ToolMeta> = {
  gmail: { label: "Gmail", description: "Read and send mail", kind: "api" },
  google_calendar: { label: "Google Calendar", description: "Read and create events", kind: "api" },
  google_sheets: { label: "Google Sheets", description: "Read and edit spreadsheets", kind: "api" },
  google_docs: { label: "Google Docs", description: "Read and write docs", kind: "api" },
  slack: { label: "Slack", description: "Send and read channel messages", kind: "api" },
  notion: { label: "Notion", description: "Read pages and databases", kind: "api" },
  linear: { label: "Linear", description: "Read and create issues", kind: "api" },
  github: { label: "GitHub", description: "Read repos, open PRs", kind: "api" },
  x: { label: "X (Twitter)", description: "Read your timeline + post (needs cookies)", kind: "both", host: "x.com" },
};

interface ChatTurn extends AgentDraftMessage {}

const INTRO: ChatTurn = {
  role: "assistant",
  content: "I'm Basics. Tell me what you want your new agent to do — a sentence is enough.",
};

export function CreateAgentCanvas() {
  const router = useRouter();
  const { create: createAgent } = useAgentActions();

  const [chat, setChat] = useState<ChatTurn[]>([INTRO]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const [name, setName] = useState("");
  const [avatar] = useState("✨");
  const [instructions, setInstructions] = useState("");
  const [target, setTarget] = useState<AgentTarget | null>(null);
  const [schedule, setSchedule] = useState<AgentSchedule | null>(null);
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [suggestedTools, setSuggestedTools] = useState<string[]>([]);

  const [activeSection, setActiveSection] = useState<"hosting" | "instructions" | "tools">("hosting");
  // Tracks which sections have been "completed" — once complete, they collapse
  // to a green chip in the section ribbon and the canvas advances.
  const [completed, setCompleted] = useState<Record<"hosting" | "instructions" | "tools", boolean>>({
    hosting: false,
    instructions: false,
    tools: false,
  });

  const visibleSections = useMemo(() => {
    const out: Array<"hosting" | "instructions" | "tools"> = ["hosting"];
    if (instructions) out.push("instructions");
    if (suggestedTools.length > 0 || tools.length > 0) out.push("tools");
    return out;
  }, [instructions, suggestedTools.length, tools.length]);

  const allDone = Boolean(name && instructions && target && completed.hosting && completed.instructions && completed.tools);

  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, thinking]);

  const applyPatch = (patch: AgentDraftPatch) => {
    if (patch.name) setName(patch.name);
    if (patch.instructions) {
      setInstructions(patch.instructions);
      if (activeSection === "hosting") setActiveSection("instructions");
    }
    if (patch.target && (patch.target === "cloud" || patch.target === "computer" || patch.target === "chrome")) {
      setTarget(patch.target);
    }
    if (patch.suggestedTools && patch.suggestedTools.length > 0) {
      setSuggestedTools(patch.suggestedTools);
      if (activeSection !== "tools") setActiveSection("tools");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || thinking) return;
    const nextChat: ChatTurn[] = [...chat, { role: "user", content: text }];
    setChat(nextChat);
    setDraft("");
    setThinking(true);
    try {
      const res = await draftWithBasics(nextChat, { name, instructions, target: target ?? undefined });
      applyPatch(res.patch);
      setChat([...nextChat, { role: "assistant", content: res.reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Basics is offline");
    } finally {
      setThinking(false);
    }
  };

  const markComplete = (section: "hosting" | "instructions" | "tools") => {
    setCompleted((c) => ({ ...c, [section]: true }));
    // Advance to the next visible incomplete section.
    const order: typeof activeSection[] = ["hosting", "instructions", "tools"];
    const next = order.find((s) => s !== section && visibleSections.includes(s) && !completed[s]);
    if (next) setActiveSection(next);
  };

  const save = async () => {
    if (!allDone || !target) return;
    try {
      const result = await createAgent.mutateAsync({
        name,
        avatar,
        instructions,
        target,
        tools,
        schedule: schedule?.enabled ? schedule : null,
      });
      toast.success(`${name} is ready.`);
      router.push(`/agents/${result.agent.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save agent");
    }
  };

  // Cancel out the (main) layout's p-6 pb-28 padding so the canvas spans the
  // full available area. Calc gives us a deterministic height: full viewport
  // minus the 12-unit (3rem) sticky header in the (main) layout.
  return (
    <div className="-m-4 grid h-[calc(100svh-3rem)] grid-cols-[380px_1fr] overflow-hidden md:-m-6 md:-mb-28">
      {/* ── Middle: Basics chat ──────────────────────────────────────────── */}
      <div className="flex h-full min-h-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex size-6 items-center justify-center rounded-md bg-foreground/5">
            <Sparkles className="size-3.5" />
          </div>
          <div className="font-medium text-sm">Basics</div>
        </div>
        <div ref={chatRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {chat.map((turn, i) => (
            <ChatBubble key={i} turn={turn} />
          ))}
          {thinking ? <ChatBubble turn={{ role: "assistant", content: "…" }} dim /> : null}
        </div>
        <div className="border-t p-3">
          <div className="flex items-end gap-2 rounded-lg border bg-background p-1.5 focus-within:border-foreground/30">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Reply to Basics"
              className="min-h-8 resize-none border-0 px-2 py-1 text-sm focus-visible:ring-0"
              rows={1}
              disabled={thinking}
            />
            <Button onClick={() => void send()} disabled={!draft.trim() || thinking} size="icon" className="size-8 shrink-0">
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Right: Aurora canvas with agent card + section overlay ──────── */}
      <div className="relative h-full min-h-0 overflow-hidden">
        <AuroraCanvas className="absolute inset-0" />

        {/* Top bar — small title + Save button.  */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-4">
          <div className="text-foreground/60 text-sm">Create Agent</div>
          <Button
            onClick={() => void save()}
            disabled={!allDone || createAgent.isPending}
            size="sm"
            className="shadow-sm"
          >
            {createAgent.isPending ? "Saving…" : allDone ? `Save ${name}` : "Save agent"}
          </Button>
        </div>

        {/* Floating agent card — vertically centered above the slide-up panel. */}
        <div className="absolute inset-x-0 top-0 z-10 flex h-[55%] items-center justify-center pt-8">
          <AgentCardPreview name={name} avatar={avatar} target={target} />
        </div>

        {/* Slide-up section panel — pinned to the bottom of the canvas. */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6">
          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl border border-white/40 bg-white/85 p-4 shadow-xl shadow-foreground/10 backdrop-blur-xl">
              <SectionTabs
                visible={visibleSections}
                active={activeSection}
                completed={completed}
                onPick={(s) => setActiveSection(s)}
              />
              <div className="mt-3">
                {activeSection === "hosting" ? (
                  <HostingSection
                    target={target}
                    setTarget={setTarget}
                    schedule={schedule}
                    setSchedule={setSchedule}
                    completed={completed.hosting}
                    onComplete={() => markComplete("hosting")}
                  />
                ) : null}
                {activeSection === "instructions" ? (
                  <InstructionsSection
                    instructions={instructions}
                    setInstructions={setInstructions}
                    completed={completed.instructions}
                    onComplete={() => markComplete("instructions")}
                  />
                ) : null}
                {activeSection === "tools" ? (
                  <ToolsSection
                    suggested={suggestedTools}
                    tools={tools}
                    setTools={setTools}
                    completed={completed.tools}
                    onComplete={() => markComplete("tools")}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function ChatBubble({ turn, dim }: { turn: ChatTurn; dim?: boolean }) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-snug ${
          isUser ? "bg-foreground text-background" : "bg-muted text-foreground"
        } ${dim ? "opacity-60" : ""}`}
      >
        {turn.content}
      </div>
    </div>
  );
}

function AgentCardPreview({ name, avatar, target }: { name: string; avatar: string; target: AgentTarget | null }) {
  const targetLabel = target ? TARGETS.find((t) => t.id === target)?.title : null;
  return (
    <div className="relative flex w-60 flex-col items-center rounded-3xl border border-white/50 bg-white/85 p-6 shadow-2xl shadow-foreground/10 backdrop-blur-xl">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-foreground/5 text-4xl">{avatar}</div>
      <div className="mt-3 text-center font-medium text-base">{name || "Untitled agent"}</div>
      {targetLabel ? (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border bg-white/60 px-2 py-0.5 text-foreground/70 text-xs">
          {targetLabel}
        </div>
      ) : (
        <div className="mt-1.5 text-foreground/40 text-xs italic">Awaiting target</div>
      )}
    </div>
  );
}

function SectionTabs({
  visible,
  active,
  completed,
  onPick,
}: {
  visible: Array<"hosting" | "instructions" | "tools">;
  active: "hosting" | "instructions" | "tools";
  completed: Record<"hosting" | "instructions" | "tools", boolean>;
  onPick: (s: "hosting" | "instructions" | "tools") => void;
}) {
  const labels: Record<"hosting" | "instructions" | "tools", string> = {
    hosting: "Hosting",
    instructions: "Instructions",
    tools: "Tools",
  };
  return (
    <div className="flex items-center gap-1.5">
      {visible.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
            active === s ? "bg-foreground text-background" : "bg-foreground/5 text-foreground/70 hover:bg-foreground/10"
          }`}
        >
          {labels[s]}
          {completed[s] ? <Check className="size-3" /> : null}
        </button>
      ))}
    </div>
  );
}

function HostingSection({
  target,
  setTarget,
  schedule,
  setSchedule,
  completed,
  onComplete,
}: {
  target: AgentTarget | null;
  setTarget: (t: AgentTarget) => void;
  schedule: AgentSchedule | null;
  setSchedule: (s: AgentSchedule | null) => void;
  completed: boolean;
  onComplete: () => void;
}) {
  return (
    <div>
      <SectionHeader title="Where should this agent run?" completed={completed} canComplete={Boolean(target)} onComplete={onComplete} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTarget(t.id)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              target === t.id ? "border-foreground bg-foreground/5" : "border-border bg-white hover:border-foreground/30"
            }`}
          >
            <div className="text-lg">{t.emoji}</div>
            <div className="mt-1 font-medium text-sm">{t.title}</div>
            <div className="mt-0.5 text-foreground/60 text-xs leading-snug">{t.blurb}</div>
          </button>
        ))}
      </div>
      {target ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-foreground/5 p-2.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(schedule?.enabled)}
              onChange={(e) =>
                setSchedule(e.target.checked ? { cron: schedule?.cron ?? "0 9 * * *", enabled: true } : null)
              }
            />
            Run on a schedule
          </label>
          {schedule?.enabled ? (
            <input
              type="text"
              value={schedule.cron}
              onChange={(e) => setSchedule({ cron: e.target.value, enabled: true })}
              placeholder="cron, e.g. 0 9 * * *"
              className="ml-auto h-7 w-40 rounded border bg-background px-2 text-xs"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function InstructionsSection({
  instructions,
  setInstructions,
  completed,
  onComplete,
}: {
  instructions: string;
  setInstructions: (s: string) => void;
  completed: boolean;
  onComplete: () => void;
}) {
  return (
    <div>
      <SectionHeader title="Instructions" completed={completed} canComplete={Boolean(instructions)} onComplete={onComplete} />
      <Textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        className="mt-3 min-h-28 resize-none bg-white text-sm"
        placeholder="Basics will draft this for you — or type your own."
      />
    </div>
  );
}

function ToolsSection({
  suggested,
  tools,
  setTools,
  completed,
  onComplete,
}: {
  suggested: string[];
  tools: AgentTool[];
  setTools: (t: AgentTool[]) => void;
  completed: boolean;
  onComplete: () => void;
}) {
  const all = Array.from(new Set([...suggested, ...tools.map((t) => t.tool)]));
  const isConnected = (slug: string, mode: AgentTool["mode"]) =>
    tools.some((t) => t.tool === slug && t.mode === mode);

  // Composio OAuth — opens the redirect URL in a new tab. Agent picks up the
  // connection once the user finishes the flow.
  const connectApi = async (toolkit: string) => {
    try {
      const r = await fetch("/api/connections/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.redirectUrl) {
        window.open(j.redirectUrl, "_blank", "noopener");
        toast.success(`Sign in to ${toolkit} in the new tab to finish.`);
        // Optimistically mark this tool's api mode as connected.
        if (!isConnected(toolkit, "api")) setTools([...tools, { tool: toolkit, mode: "api" }]);
      } else {
        toast.error(j.error ?? `Could not start ${toolkit} connection.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection error");
    }
  };

  // Per-host cookie capture. On desktop we have a bridge that exports the
  // user's local Chrome cookies for the given host directly into the cloud
  // workspace — no Browserbase round-trip, no separate page. Off-desktop we
  // gracefully tell the user to open in the desktop app.
  const connectSite = async (host: string, slug: string) => {
    interface CookieBridge { exportLocalCookies?: (host: string) => Promise<{ ok?: boolean; error?: string; count?: number }> }
    const bridge = (typeof window !== "undefined"
      ? ((window as unknown as { basichome?: CookieBridge }).basichome ?? null)
      : null);
    if (!bridge?.exportLocalCookies) {
      toast.error(`Open Basics on your Mac to capture ${host} cookies.`);
      return;
    }
    try {
      const res = await bridge.exportLocalCookies(host);
      if (res?.ok) {
        toast.success(`Captured ${res.count ?? "your"} ${host} cookies.`);
        if (!isConnected(slug, "browser")) setTools([...tools, { tool: slug, mode: "browser" }]);
      } else {
        toast.error(res?.error ?? `Couldn't grab ${host} cookies from Chrome.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cookie capture failed");
    }
  };

  const remove = (slug: string, mode: AgentTool["mode"]) =>
    setTools(tools.filter((t) => !(t.tool === slug && t.mode === mode)));

  return (
    <div>
      <SectionHeader title="Tools" completed={completed} canComplete onComplete={onComplete} />
      <div className="mt-3 space-y-2">
        {all.length === 0 ? (
          <div className="text-foreground/60 text-xs">Basics will suggest tools based on what this agent does.</div>
        ) : null}
        {all.map((slug) => {
          const meta = TOOL_CATALOG[slug] ?? { label: slug, description: "", kind: "api" as ToolKind };
          const showApi = meta.kind === "api" || meta.kind === "both";
          const showSite = meta.kind === "site" || meta.kind === "both";
          const apiConnected = isConnected(slug, "api");
          const siteConnected = isConnected(slug, "browser");
          return (
            <div key={slug} className="rounded-lg border bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-sm">{meta.label}</div>
                  {meta.description ? <div className="truncate text-foreground/60 text-xs">{meta.description}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {showApi ? (
                    apiConnected ? (
                      <Button size="sm" variant="outline" onClick={() => remove(slug, "api")} className="h-7 px-2.5 text-xs">
                        ✓ Connected
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => void connectApi(slug)} className="h-7 px-2.5 text-xs">
                        Connect
                      </Button>
                    )
                  ) : null}
                  {showSite && meta.host ? (
                    siteConnected ? (
                      <Button size="sm" variant="outline" onClick={() => remove(slug, "browser")} className="h-7 px-2.5 text-xs">
                        ✓ Signed in on {meta.host}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void connectSite(meta.host!, slug)} className="h-7 px-2.5 text-xs">
                        Sign in on {meta.host}
                      </Button>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  completed,
  canComplete,
  onComplete,
}: {
  title: string;
  completed: boolean;
  canComplete: boolean;
  onComplete: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-medium text-sm">{title}</h3>
      {completed ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--chart-2)]/15 px-2 py-0.5 text-[color:var(--chart-2)] text-xs">
          <Check className="size-3" /> Complete
        </span>
      ) : (
        <Button size="sm" variant="ghost" disabled={!canComplete} onClick={onComplete} className="h-7 px-2 text-xs">
          Mark complete
        </Button>
      )}
    </div>
  );
}
