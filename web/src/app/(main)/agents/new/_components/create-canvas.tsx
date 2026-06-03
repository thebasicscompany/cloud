"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { toast } from "sonner";
import { Check, Robot, Sparkle } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ChatComposer, ChatMessage, ChatThread } from "@/components/chat/chat-primitives";

import { DemoRecorder } from "./demo-recorder";
import { ConnectionLogo } from "@/components/connection-logo";
import { Iridescence } from "@/components/iridescence";
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

// Mirror of the API's ALLOWED_TOOLKITS — only real Composio integrations the
// agent can actually OAuth into. Anything outside this list is ignored. The
// "browser" capability isn't a toolkit; it's built into cloud/chrome targets.
type ToolKind = "api" | "site" | "both";
interface ToolMeta { label: string; description: string; kind: ToolKind; host?: string }
const TOOL_CATALOG: Record<string, ToolMeta> = {
  gmail: { label: "Gmail", description: "Read and send mail", kind: "api" },
  google_calendar: { label: "Google Calendar", description: "Read and create events", kind: "api" },
  google_sheets: { label: "Google Sheets", description: "Read and edit spreadsheets", kind: "api" },
  google_docs: { label: "Google Docs", description: "Read and write docs", kind: "api" },
  google_drive: { label: "Google Drive", description: "Read and upload files", kind: "api" },
  slack: { label: "Slack", description: "Send and read channel messages", kind: "api" },
  notion: { label: "Notion", description: "Read pages and databases", kind: "api" },
  linear: { label: "Linear", description: "Read and create issues", kind: "api" },
  github: { label: "GitHub", description: "Read repos, open PRs", kind: "api" },
  asana: { label: "Asana", description: "Manage tasks and projects", kind: "api" },
  trello: { label: "Trello", description: "Boards, lists, cards", kind: "api" },
  airtable: { label: "Airtable", description: "Read and write bases", kind: "api" },
  hubspot: { label: "HubSpot", description: "Contacts and deals", kind: "api" },
  salesforce: { label: "Salesforce", description: "Records and reports", kind: "api" },
  jira: { label: "Jira", description: "Issues and projects", kind: "api" },
  stripe: { label: "Stripe", description: "Customers and payments", kind: "api" },
  shopify: { label: "Shopify", description: "Orders and products", kind: "api" },
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
  const [demoOpen, setDemoOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const [name, setName] = useState("");
  // Empty avatar by default → falls back to a Robot icon in the preview, NOT
  // the sparkles emoji. Basics can overwrite via patch.avatar (e.g. an emoji).
  const [avatar] = useState("");
  const [instructions, setInstructions] = useState("");
  const [target, setTarget] = useState<AgentTarget | null>(null);
  const [schedule, setSchedule] = useState<AgentSchedule | null>(null);
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [suggestedTools, setSuggestedTools] = useState<string[]>([]);

  // Section completion is now derived directly from the fields. As soon as
  // a section has valid content it shows the green ✓ chip; no manual
  // "Mark complete" click is needed. Save activates when the three
  // required fields (name, target, instructions) are present.
  const showInstructions = Boolean(instructions);
  const showTools = suggestedTools.length > 0 || tools.length > 0;
  const completed = {
    hosting: Boolean(target),
    instructions: Boolean(instructions),
    tools: !showTools || tools.length > 0,
  };
  const allDone = Boolean(name && instructions && target);

  const applyPatch = (patch: AgentDraftPatch) => {
    if (patch.name) setName(patch.name);
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
    <div className="-m-4 grid h-[calc(100svh-4rem)] max-h-[calc(100svh-4rem)] grid-cols-[380px_1fr] gap-0 overflow-hidden bg-background md:-m-6 md:-mb-28">
      {/* ── LEFT: Basics chat ──────────────────────────────────────────── */}
      <div className="flex h-full min-h-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex size-6 items-center justify-center rounded-md bg-foreground/5">
            <Sparkle weight="fill" className="size-3.5" />
          </div>
          <div className="font-medium text-sm">Basics</div>
          <button
            type="button"
            onClick={() => setDemoOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-foreground/70 text-xs transition-colors hover:border-foreground/30 hover:text-foreground"
            title="Show Basics what to do — screen + voice"
          >
            <span className="size-1.5 rounded-full bg-destructive" />
            Record a demo
          </button>
        </div>
        <ChatThread scrollKey={`${chat.length}-${thinking ? 1 : 0}`}>
          {chat.map((turn, i) => (
            <ChatMessage key={i} role={turn.role}>
              {turn.content}
            </ChatMessage>
          ))}
          {thinking ? (
            <ChatMessage role="assistant" pending>
              …
            </ChatMessage>
          ) : null}
        </ChatThread>
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void send()}
          placeholder="Reply to Basics"
          disabled={thinking}
        />
      </div>

      {/* ── RIGHT: rounded inner card holding the iridescence canvas ─────── */}
      <div className="flex h-full min-h-0 flex-col overflow-hidden p-4">
        <div
          className="relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-white/30 shadow-xl"
          style={{ backgroundColor: "#23ab68" }}
        >
          {/* Brand emerald (#23ab68) as the tint peak; the modified shader
              mixes white→uColor by the pattern so the dark troughs read white
              instead of black-green. Pointer-events off so the canvas never
              eats clicks meant for the cards above it. */}
          <Iridescence
            className="pointer-events-none absolute inset-0 z-0"
            color={[0.137, 0.671, 0.408]}
            speed={0.35}
            amplitude={0.1}
            mouseReact={false}
          />

          {/* Top bar */}
          <div className="relative z-20 flex items-center justify-between px-5 py-3">
            <div className="font-medium text-sm text-white drop-shadow-sm">Create Agent</div>
            <Button
              onClick={() => void save()}
              disabled={!allDone || createAgent.isPending}
              size="sm"
              className="bg-white text-foreground shadow-md hover:bg-white/90 disabled:bg-white/40 disabled:text-foreground/40"
            >
              {createAgent.isPending ? "Saving…" : allDone ? `Save ${name}` : "Save agent"}
            </Button>
          </div>

          {/* Content area — agent card always centered, sections stack
              centered beneath. Layout grows downward as Basics fills in the
              instructions/tools sections; when only the agent card is shown
              it sits roughly halfway down (justify-center). */}
          <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-5 pb-4">
            <div
              className={`mx-auto flex max-w-2xl flex-col items-center transition-all duration-500 ${
                showInstructions || showTools ? "min-h-full justify-start gap-4 pt-4" : "min-h-full justify-center gap-3"
              }`}
            >
              <AgentCardPreview
                name={name}
                onRename={setName}
                avatar={avatar}
                target={target}
                compact={showInstructions || showTools}
              />

              <div className="w-full space-y-2.5">
                <SectionCard title="Hosting" complete={completed.hosting}>
                  <div className="grid grid-cols-3 gap-2">
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
                </SectionCard>

                {showInstructions ? (
                  <SectionCard title="Instructions" complete={completed.instructions}>
                    <Textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      className="min-h-24 resize-none bg-white text-sm"
                      placeholder="Basics will draft this for you — or type your own."
                    />
                  </SectionCard>
                ) : null}

                {showTools ? (
                  <SectionCard title="Tools" complete={completed.tools}>
                    <ToolsList suggested={suggestedTools} tools={tools} setTools={setTools} />
                  </SectionCard>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <DemoRecorder
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        onPatch={(patch, summary) => {
          applyPatch(patch);
          setChat((prev) => [...prev, { role: "assistant", content: summary }]);
        }}
      />
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function AgentCardPreview({
  name,
  onRename,
  avatar,
  target,
  compact = false,
}: {
  name: string;
  onRename: (next: string) => void;
  avatar: string;
  target: AgentTarget | null;
  compact?: boolean;
}) {
  const targetLabel = target ? TARGETS.find((t) => t.id === target)?.title : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  return (
    <div
      className={`relative flex flex-col items-center rounded-2xl border border-white/60 bg-white/95 shadow-2xl shadow-black/10 backdrop-blur-xl transition-all duration-700 ${
        compact ? "w-40 p-3" : "w-56 p-5"
      }`}
    >
      <div
        className={`flex items-center justify-center rounded-xl bg-foreground/[0.04] transition-all duration-700 ${
          compact ? "size-9 text-xl" : "size-12 text-3xl"
        }`}
      >
        {avatar ? avatar : <Robot weight="fill" className={compact ? "size-5" : "size-7"} />}
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { onRename(draft.trim() || name); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onRename(draft.trim() || name); setEditing(false); }
            if (e.key === "Escape") { setDraft(name); setEditing(false); }
          }}
          className={`mt-2 w-full rounded border bg-white px-1.5 py-0.5 text-center font-medium outline-none ring-2 ring-foreground/20 ${
            compact ? "text-xs" : "text-sm"
          }`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to rename"
          className={`mt-2 max-w-full truncate rounded px-1 text-center font-medium transition-colors hover:bg-foreground/5 ${
            compact ? "text-xs" : "text-sm"
          } ${name ? "" : "text-foreground/40 italic"}`}
        >
          {name || "Click to name"}
        </button>
      )}
      {targetLabel ? (
        <div className="mt-1 inline-flex items-center gap-1 rounded-full border bg-white/80 px-2 py-0.5 text-foreground/70 text-[10px]">
          {targetLabel}
        </div>
      ) : (
        <div className="mt-1 text-foreground/40 text-[10px] italic">Awaiting target</div>
      )}
    </div>
  );
}

function SectionCard({
  title,
  complete,
  children,
}: {
  title: string;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="section-card overflow-hidden rounded-2xl border border-white/40 bg-white/85 p-3 shadow-xl shadow-black/5 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-medium text-sm">{title}</h3>
        {complete ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--chart-2)]/15 px-2 py-0.5 text-[color:var(--chart-2)] text-xs">
            <Check weight="bold" className="size-3" /> Complete
          </span>
        ) : null}
      </div>
      {children}
      <style jsx>{`
        .section-card {
          animation: section-in 0.5s cubic-bezier(0.2, 0.9, 0.3, 1);
        }
        @keyframes section-in {
          0% { transform: translateY(24px) scale(0.98); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
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
  const isConnected = (slug: string, mode: AgentTool["mode"]) =>
    tools.some((t) => t.tool === slug && t.mode === mode);

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
        if (!isConnected(toolkit, "api")) setTools([...tools, { tool: toolkit, mode: "api" }]);
      } else {
        toast.error(j.error ?? `Could not start ${toolkit} connection.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection error");
    }
  };

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
    <div className="space-y-2">
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
              <div className="flex min-w-0 items-center gap-2.5">
                <ConnectionLogo slug={slug} className="size-6 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-sm">{meta.label}</div>
                  {meta.description ? <div className="truncate text-foreground/60 text-xs">{meta.description}</div> : null}
                </div>
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
                      ✓ Cookies saved
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void connectSite(meta.host!, slug)} className="h-7 px-2.5 text-xs">
                      Use my {meta.host} cookies
                    </Button>
                  )
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
