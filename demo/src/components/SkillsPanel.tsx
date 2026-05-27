import { useDemo } from '@/store'
import { BookOpen, Sparkle, Globe } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

export function SkillsPanel() {
  const skills = useDemo((s) => s.skills)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-2">skills · self-learning</div>
          <h1 className="font-display text-[32px] leading-none tracking-tight">
            Every run makes the next one <span className="text-primary">faster</span>.
          </h1>
          <p className="text-[14px] text-muted-foreground mt-2 max-w-xl">
            Basics saves what it learned about your specific tools — click paths, gotchas, naming conventions. Next run those skills load automatically. The longer you use it, the cheaper each run.
          </p>
        </div>

        <div className="space-y-3">
          {skills.map((sk, i) => (
            <motion.div
              key={sk.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card
                className="px-5 py-4 relative overflow-hidden shadow-none"
                style={sk.fresh ? { borderColor: 'var(--color-primary)', boxShadow: '0 0 0 3px color-mix(in oklch, var(--color-primary) 15%, transparent)' } : undefined}
              >
                {sk.fresh && (
                  <Badge className="absolute top-3 right-3 gap-1 bg-primary text-primary-foreground">
                    <Sparkle size={11} weight="fill" /> just learned
                  </Badge>
                )}
                <div className="flex items-start gap-4">
                  <div className="size-10 rounded-lg bg-secondary text-secondary-foreground shrink-0 flex items-center justify-center">
                    <BookOpen size={16} weight="regular" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="font-mono text-[13.5px] text-foreground">{sk.name}</code>
                      <Badge variant="outline" className="gap-1 text-[10px] font-mono font-normal">
                        <Globe size={10} weight="regular" />{sk.host}
                      </Badge>
                    </div>
                    <div className="text-[13px] text-muted-foreground mt-1.5 leading-snug">{sk.description}</div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1 max-w-xs">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">confidence</span>
                        <Progress value={sk.confidence * 100} className="h-1.5" />
                        <span className="font-mono text-[11px] tabular-nums text-foreground">{(sk.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">saved {sk.createdAt}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
