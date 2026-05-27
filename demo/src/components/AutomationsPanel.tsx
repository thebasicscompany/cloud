import { useDemo } from '@/store'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export function AutomationsPanel() {
  const automations = useDemo((s) => s.automations)
  const setView = useDemo((s) => s.patch)
  const runs = useDemo((s) => s.runs)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-2">automations</div>
            <h1 className="font-display text-[36px] leading-none tracking-tight text-foreground">
              Everything <span className="text-primary">Basics</span> does for you.
            </h1>
            <p className="text-[14px] text-muted-foreground mt-2 max-w-xl">
              Each automation is a workflow you described once. Basics runs it on schedule or on trigger, in cloud Chrome, with your approval on anything that ships.
            </p>
          </div>
          <Button size="lg" onClick={() => setView({ view: 'authoring' })} className="shrink-0 rounded-full px-5">
            Build new
          </Button>
        </div>

        {automations.length === 0 && <EmptyState />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {automations.map((a) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Card
                className="group p-0 overflow-hidden cursor-pointer hover:border-foreground/30 transition-colors shadow-none"
                onClick={() => setView({ view: 'run' })}
              >
                <CardContent className="p-6">
                  <Badge variant="secondary" className="mb-3 font-mono text-[10px] tracking-wide uppercase">
                    {a.status}
                  </Badge>
                  <h3 className="font-display text-[18px] tracking-tight leading-snug text-foreground">{a.name}</h3>
                  <p className="text-[13.5px] text-muted-foreground mt-1.5 leading-relaxed">{a.description}</p>

                  <div className="flex items-center gap-3 mt-5">
                    <span className="font-mono text-[11px] text-foreground">{a.trigger}</span>
                    {a.nextRunAt && (
                      <span className="text-[11.5px] text-muted-foreground">
                        next · <span className="text-foreground">{a.nextRunAt}</span>
                      </span>
                    )}
                  </div>
                </CardContent>
                <Separator />
                <div className="px-6 py-3 flex items-center justify-between text-[12px] text-muted-foreground bg-muted/30">
                  <span>{a.runCount} {a.runCount === 1 ? 'run' : 'runs'}</span>
                  {a.lastRunAt && <span>last · {a.lastRunAt}</span>}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {runs.length > 0 && (
          <section className="mt-14">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold mb-3">recent runs</div>
            <Card className="p-0 overflow-hidden gap-0 shadow-none">
              {runs.map((r, i) => (
                <div key={r.id}>
                  {i > 0 && <Separator />}
                  <div className="px-5 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="size-2 rounded-full bg-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium truncate">{r.automationName}</div>
                        <div className="text-[11.5px] text-muted-foreground">started {r.startedAt} · {r.trigger}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-5 text-[11.5px] text-muted-foreground shrink-0 font-mono">
                      <span><span className="text-foreground">{r.durationSec}</span>s</span>
                      <span><span className="text-foreground">{r.outputsCount}</span> outputs</span>
                      <span><span className="text-foreground">${((r.costCents ?? 0) / 100).toFixed(2)}</span></span>
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  const setView = useDemo((s) => s.patch)
  return (
    <Card className="py-16 border-dashed shadow-none">
      <div className="text-center">
        <h3 className="font-display text-[18px] tracking-tight">No automations yet.</h3>
        <p className="text-[13.5px] text-muted-foreground mt-1.5 max-w-md mx-auto">
          Tell Basics what you want — it'll build the workflow for you and ask before sending anything.
        </p>
        <Button size="lg" className="mt-5 rounded-full px-5" onClick={() => setView({ view: 'authoring' })}>
          Build your first automation
        </Button>
      </div>
    </Card>
  )
}
