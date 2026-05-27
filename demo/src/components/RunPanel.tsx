import { useDemo } from '@/store'
import { LiveView } from '@/components/LiveView'
import { CircleNotch, CheckCircle, Circle, Warning, Clock, CurrencyDollar, Tray, Pulse as Activity } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

export function RunPanel() {
  const run = useDemo((s) => s.activeRun)
  const tools = useDemo((s) => s.toolCalls)
  const steps = useDemo((s) => s.runSteps)

  if (!run) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="px-8 py-10 text-center shadow-none">
          <Clock size={26} className="mx-auto mb-3 text-muted-foreground/50" weight="light" />
          <div className="font-display text-[16px]">No active run.</div>
          <div className="text-[13px] text-muted-foreground mt-1">Runs appear here when an automation fires.</div>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-6 py-3 border-b bg-background/80 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot status={run.status} />
          <div className="min-w-0">
            <div className="font-display text-[15px] font-medium truncate leading-tight">{run.automationName}</div>
            <div className="text-[12px] text-muted-foreground leading-tight mt-0.5">
              {run.trigger === 'schedule' && 'fired by schedule'}
              {run.trigger === 'webhook' && 'fired by webhook'}
              {run.trigger === 'manual' && 'fired manually'}
              {' · '}started {run.startedAt}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {run.status === 'completed' && (
            <>
              <Stat icon={<Clock size={12} weight="regular" />} label="duration" value={`${run.durationSec}s`} />
              <Stat icon={<Tray size={12} weight="regular" />} label="outputs" value={`${run.outputsCount}`} />
              <Stat icon={<CurrencyDollar size={12} weight="regular" />} label="cost" value={`$${((run.costCents ?? 0) / 100).toFixed(2)}`} />
            </>
          )}
          <Badge
            variant={run.status === 'completed' ? 'default' : 'secondary'}
            className="uppercase tracking-wider text-[10px] gap-1.5"
          >
            {run.status === 'running' && <Activity size={12} weight="bold" />}
            {run.status === 'completed' && <CheckCircle size={12} weight="fill" />}
            {run.status}
          </Badge>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-[1fr_380px] min-h-0">
        <div className="min-w-0 min-h-0 p-4">
          <LiveView />
        </div>

        <aside className="border-l bg-background/60 backdrop-blur-sm flex flex-col min-h-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tool timeline</div>
            <Badge variant="outline" className="font-mono text-[10px]">{tools.length} calls</Badge>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-3 py-3">
              <AnimatePresence initial={false}>
                {tools.map((t) => <ToolRow key={t.id} tool={t} />)}
              </AnimatePresence>
              {tools.length === 0 && (
                <div className="text-[12px] text-muted-foreground italic px-2 py-3">Waiting for first tool call…</div>
              )}
            </div>
          </ScrollArea>
          <Separator />
          <div className="px-4 py-3 max-h-32 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Notes</div>
            <ul className="space-y-1">
              {steps.slice(-5).map((s) => (
                <li key={s.id} className="text-[11.5px] text-muted-foreground leading-snug">
                  <span className="text-primary mr-1">·</span>{s.text}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ToolRow({ tool }: { tool: ReturnType<typeof useDemo.getState>['toolCalls'][number] }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className="relative pl-5 py-2"
    >
      <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
      <div
        className="absolute left-0 top-3 size-3 rounded-full bg-background flex items-center justify-center"
        style={{ border: '2px solid var(--color-primary)' }}
      >
        {tool.status === 'running' && <div className="size-1.5 rounded-full bg-primary" />}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-primary">{tool.tool}</span>
        {tool.status === 'running' && <CircleNotch size={11} weight="bold" className="animate-spin text-primary" />}
        {tool.status === 'done' && <CheckCircle size={11} weight="fill" className="text-primary" />}
      </div>
      <div className="font-mono text-[11px] text-foreground mt-0.5 truncate">{tool.label}</div>
      {tool.reasoning && (
        <div className="text-[11px] text-muted-foreground mt-1 leading-snug italic">"{tool.reasoning}"</div>
      )}
    </motion.div>
  )
}

function StatusDot({ status }: { status: string }) {
  if (status === 'running')
    return <div className="size-2.5 rounded-full bg-primary pulse-dot" />
  if (status === 'completed')
    return <CheckCircle size={16} weight="fill" className="text-primary" />
  if (status === 'paused')
    return <Warning size={16} weight="fill" style={{ color: 'var(--color-warn)' }} />
  return <Circle size={16} className="text-muted-foreground" />
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  )
}
