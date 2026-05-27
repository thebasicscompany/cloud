import { useDemo } from '@/store'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/* -----------------------------------------------------------------------------
   ChatGPT-style layout (per assistant-ui.com/examples/chatgpt structure):
   - centered single column, no avatars
   - user message: right-aligned, bg-secondary, rounded-3xl pill
   - assistant message: left-aligned, no background, plain text on the canvas
   - composer: rounded-[28px] pill, send button = circle with arrow
   - right rail: condensed tool-call log (no card frames, just a thin list)
----------------------------------------------------------------------------- */

export function AuthoringPanel() {
  const chat = useDemo((s) => s.chat)
  const tools = useDemo((s) => s.toolCalls)
  const status = useDemo((s) => s.authoringStatus)
  const viewportRef = useRef<HTMLDivElement>(null)

  // shadcn ScrollArea exposes the viewport via data-radix-scroll-area-viewport
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const viewport = el.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]')
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [chat, tools, status])

  return (
    <div className="h-full grid grid-cols-[1fr_320px] bg-background">
      {/* main chat column */}
      <div className="flex flex-col min-w-0 min-h-0 border-r">
        <ScrollArea ref={viewportRef} className="flex-1 min-h-0">
          <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
            <AnimatePresence initial={false}>
              {chat.map((m) => <Message key={m.id} msg={m} />)}
            </AnimatePresence>
            {status === 'thinking' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[14px] text-muted-foreground italic">
                Thinking<span className="inline-block animate-pulse">…</span>
              </motion.div>
            )}
            <div className="h-12" />
          </div>
        </ScrollArea>

        {/* composer */}
        <div className="shrink-0 px-6 pb-6 pt-2 bg-background">
          <div className="mx-auto max-w-2xl">
            <div className="relative">
              <Input
                disabled
                placeholder="Tell Basics what you want to automate…"
                className="!h-14 !text-[15px] !rounded-[28px] pl-5 pr-14 border-border/70 shadow-sm bg-card"
              />
              <Button
                size="icon"
                disabled
                className="absolute right-1.5 top-1.5 size-11 rounded-full bg-foreground text-background hover:bg-foreground/90"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </Button>
            </div>
            <div className="text-center text-[11px] text-muted-foreground/70 mt-3">
              Basics authoring agent — Opus 4.7 — full worker tool registry
            </div>
          </div>
        </div>
      </div>

      {/* right rail: tool log */}
      <aside className="bg-sidebar/40 flex flex-col min-h-0">
        <div className="px-5 py-4 border-b">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Agent activity</div>
          <div className="text-[11.5px] text-muted-foreground/80 mt-0.5">
            {tools.length === 0 ? 'idle' : `${tools.length} ${tools.length === 1 ? 'call' : 'calls'}`}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-3">
            {tools.length === 0 && (
              <div className="text-[12.5px] text-muted-foreground/70 leading-relaxed">
                The agent's tool calls will stream here as it works.
              </div>
            )}
            {tools.map((tc) => <ToolLine key={tc.id} tool={tc} />)}
          </div>
        </ScrollArea>
      </aside>
    </div>
  )
}

function Message({ msg }: { msg: ReturnType<typeof useDemo.getState>['chat'][number] }) {
  const visible = msg.streamedChars !== undefined ? msg.text.slice(0, msg.streamedChars) : msg.text
  const streaming = msg.streamedChars !== undefined && msg.streamedChars < msg.text.length

  if (msg.role === 'system') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="text-[12px] text-muted-foreground/70 italic text-center">
        {msg.text}
      </motion.div>
    )
  }

  if (msg.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="bg-secondary text-secondary-foreground px-4 py-2.5 rounded-3xl max-w-[80%] text-[15px] leading-relaxed whitespace-pre-wrap">
          <span className={streaming ? 'caret' : ''}>{visible}</span>
        </div>
      </motion.div>
    )
  }

  // assistant: small attribution row (logo + name) then plain text
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 pr-4">
      <img
        src="/logo.png"
        alt=""
        className="size-6 rounded-[5px] mt-0.5 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[12px] font-semibold text-foreground">Basics</span>
          <span className="text-[10.5px] text-muted-foreground/80">agent</span>
        </div>
        <div className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
          <span className={streaming ? 'caret' : ''}>{visible}</span>
        </div>
      </div>
    </motion.div>
  )
}

function ToolLine({ tool }: { tool: ReturnType<typeof useDemo.getState>['toolCalls'][number] }) {
  return (
    <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} className="text-[12px]">
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full shrink-0" style={{
          background: tool.status === 'done' ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
          opacity: tool.status === 'running' ? 0.5 : 1,
        }} />
        <code className="font-mono text-[10.5px] uppercase tracking-wider text-primary">{tool.tool}</code>
        <span className="ml-auto text-[10px] text-muted-foreground/70 font-mono">{tool.status === 'done' ? 'ok' : tool.status}</span>
      </div>
      <div className="font-mono text-[11px] text-foreground/85 mt-0.5 truncate pl-3">{tool.label}</div>
      {tool.reasoning && (
        <div className="text-[11px] text-muted-foreground mt-1 leading-snug pl-3 italic">"{tool.reasoning}"</div>
      )}
    </motion.div>
  )
}
