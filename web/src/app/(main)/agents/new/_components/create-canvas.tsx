"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

// ─── Targets shown in the right canvas's first slide-up card ──────────────
const TARGETS: Array<{ id: AgentTarget; title: string; blurb: string; emoji: string }> = [
  { id: "cloud", title: "Cloud", blurb: "Runs in a fresh cloud browser. Best for tasks that don't need your logins.", emoji: "☁️" },
  { id: "computer", title: "Computer use", blurb: "Drives your Mac — apps, Finder, system stuff.", emoji: "🖥️" },
  { id: "chrome", title: "Your Chrome", blurb: "Acts inside your real Chrome with your logged-in sessions.", emoji: "🌐" },
];

// Static suggested-tool catalog. Real connections come from /api/connections;
// for v1 we just show the toolkit name + a Connect placeholder.
const TOOL_CATALOG: Record<string, { label: string; description: string }> = {
  gmail: { label: "Gmail", description: "Read and send mail" },
  google_calendar: { label: "Google Calendar", description: "Read and create events" },
  google_sheets: { label: "Google Sheets", description: "Read and edit spreadsheets" },
  slack: { label: "Slack", description: "Send and read channel messages" },
  notion: { label: "Notion", description: "Read pages and databases" },
  linear: { label: "Linear", description: "Read and create issues" },
  github: { label: "GitHub", description: "Read repos, open PRs" },
  x: { label: "X", description: "Read your timeline + post" },
  browser: { label: "Browser session", description: "Use your signed-in cookies" },
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

  // The agent being birthed. Each Basics turn applies a patch into this state.
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("✨");
  const [instructions, setInstructions] = useState("");
  const [target, setTarget] = useState<AgentTarget | null>(null);
  const [schedule, setSchedule] = useState<AgentSchedule | null>(null);
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [suggestedTools, setSuggestedTools] = useState<string[]>([]);

  // Per-section "Complete" toggles — when the user marks a card complete the
  // green check shows + the canvas advances to the next slide-up.
  const [instructionsDone, setInstructionsDone] = useState(false);
  const [hostingDone, setHostingDone] = useState(false);
  const [toolsDone, setToolsDone] = useState(false);

  const allDone = Boolean(name && instructions && target && instructionsDone && hostingDone && toolsDone);

  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, thinking]);

  const applyPatch = (patch: AgentDraftPatch) => {
    if (patch.name) setName(patch.name);
    if (patch.avatar) setAvatar(patch.avatar);
    if (patch.instructions) setInstructions(patch.instructions);
    if (patch.target && (patch.target === "cloud" || patch.target === "computer" || patch.target === "chrome")) {
      setTarget(patch.target);
    }
    if (patch.suggestedTools && patch.suggestedTools.length > 0) {
      setSuggestedTools(patch.suggestedTools);
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
      setChat(nextChat);
    } finally {
      setThinking(false);
    }
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

  return (
    <div className="grid h-full grid-cols-[minmax(320px,400px)_1fr] overflow-hidden">
      {/* ── Middle: Basics conversation ─────────────────────────────────────*/}
      <div className="flex h-full flex-col border-r bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Sparkles className="size-4 text-foreground/70" />
          <div className="font-medium text-sm">Basics</div>
          <div className="ml-auto text-muted-foreground text-xs">Describe what you want this agent to do</div>
        </div>
        <div ref={chatRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {chat.map((turn, i) => (
            <ChatBubble key={i} turn={turn} />
          ))}
          {thinking ? <ChatBubble turn={{ role: "assistant", content: "…" }} dim /> : null}
        </div>
        <div className="border-t p-3">
          <div className="flex items-end gap-2">
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
              className="min-h-10 resize-none"
              rows={1}
              disabled={thinking}
            />
            <Button onClick={() => void send()} disabled={!draft.trim() || thinking} size="sm">
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Right: Aurora canvas + slide-up section cards ─────────────────*/}
      <div className="relative h-full overflow-y-auto">
        <AuroraCanvas className="pointer-events-none fixed inset-y-0 right-0 left-[calc(var(--sidebar-width,16rem)+400px)]" />
        <div className="relative z-10 mx-auto max-w-2xl px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-medium text-base text-foreground/80">Create Agent</h2>
            <Button onClick={() => void save()} disabled={!allDone || createAgent.isPending} size="sm">
              {createAgent.isPending ? "Saving…" : "Save agent"}
            </Button>
          </div>

          <AgentCardPreview name={name} avatar={avatar} target={target} />

          {/* Section 1: Target picker — always visible (first thing the user does). */}
          <SlideUpCard title="Where should this agent run?" complete={hostingDone} onComplete={() => setHostingDone(true)} canComplete={Boolean(target)}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTarget(t.id)}
                  className={`rounded-lg border bg-card p-3 text-left transition-colors ${
                    target === t.id ? "border-foreground bg-accent/40" : "hover:border-foreground/30"
                  }`}
                >
                  <div className="text-lg">{t.emoji}</div>
                  <div className="mt-1 font-medium text-sm">{t.title}</div>
                  <div className="mt-0.5 text-muted-foreground text-xs leading-snug">{t.blurb}</div>
                </button>
              ))}
            </div>

            {target ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border bg-card p-2.5">
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
                    className="ml-auto h-8 w-44 rounded border bg-background px-2 text-xs"
                  />
                ) : null}
              </div>
            ) : null}
          </SlideUpCard>

          {/* Section 2: Instructions — appears after Basics drafts them. */}
          {instructions ? (
            <SlideUpCard
              title="Instructions"
              complete={instructionsDone}
              onComplete={() => setInstructionsDone(true)}
              canComplete={Boolean(instructions)}
            >
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="min-h-32 text-sm"
              />
            </SlideUpCard>
          ) : null}

          {/* Section 3: Tools — appears once Basics suggests some. */}
          {(suggestedTools.length > 0 || tools.length > 0) ? (
            <SlideUpCard
              title="Tools"
              complete={toolsDone}
              onComplete={() => setToolsDone(true)}
              canComplete
            >
              <ToolsList
                suggested={suggestedTools}
                tools={tools}
                setTools={setTools}
              />
            </SlideUpCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ turn, dim }: { turn: ChatTurn; dim?: boolean }) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-snug ${
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
    <div className="relative mx-auto mb-6 flex w-56 flex-col items-center rounded-2xl border bg-card p-5 shadow-lg shadow-foreground/5">
      <div className="flex size-16 items-center justify-center rounded-xl bg-accent/40 text-3xl">{avatar}</div>
      <div className="mt-3 text-center font-medium text-base">{name || "Untitled agent"}</div>
      {targetLabel ? (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-muted-foreground text-xs">
          {targetLabel}
        </div>
      ) : (
        <div className="mt-1.5 text-muted-foreground text-xs italic">Awaiting target</div>
      )}
    </div>
  );
}

function SlideUpCard({
  title,
  complete,
  canComplete,
  onComplete,
  children,
}: {
  title: string;
  complete: boolean;
  canComplete: boolean;
  onComplete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="slide-up-card mt-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-sm">{title}</h3>
        {complete ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--chart-2)]/15 px-2 py-0.5 text-[color:var(--chart-2)] text-xs">
            <Check className="size-3" /> Complete
          </span>
        ) : (
          <Button size="sm" variant="ghost" disabled={!canComplete} onClick={onComplete} className="h-7 px-2 text-xs">
            Mark complete
          </Button>
        )}
      </div>
      {children}
      <style jsx>{`
        .slide-up-card {
          animation: slide-up 0.4s ease-out;
        }
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function ToolsList({
  suggested,
  tools,
  setTools,
}: {
  suggested: string[];
  tools: AgentTool[];
  setTools: (t: AgentTool[]) => void;
}) {
  const all = Array.from(new Set([...suggested, ...tools.map((t) => t.tool)]));
  const isConnected = (slug: string) => tools.some((t) => t.tool === slug);
  const toggle = (slug: string, mode: AgentTool["mode"]) => {
    if (isConnected(slug)) setTools(tools.filter((t) => t.tool !== slug));
    else setTools([...tools, { tool: slug, mode }]);
  };
  return (
    <div className="space-y-2">
      {all.length === 0 ? (
        <div className="text-muted-foreground text-xs">No tools yet — Basics will suggest some.</div>
      ) : null}
      {all.map((slug) => {
        const meta = TOOL_CATALOG[slug] ?? { label: slug, description: "" };
        const connected = isConnected(slug);
        return (
          <div key={slug} className="flex items-center justify-between rounded-md border bg-background p-2.5">
            <div className="min-w-0">
              <div className="truncate font-medium text-sm">{meta.label}</div>
              {meta.description ? <div className="truncate text-muted-foreground text-xs">{meta.description}</div> : null}
            </div>
            <Button
              size="sm"
              variant={connected ? "outline" : "default"}
              onClick={() => toggle(slug, slug === "browser" ? "browser" : "api")}
              className="h-7 px-3 text-xs"
            >
              {connected ? "Remove" : "Connect"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
