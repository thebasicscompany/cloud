import { useDemo } from '@/store'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function OutputsPanel() {
  const outputs = useDemo((s) => s.outputs)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-2">outputs</div>
          <h1 className="font-display text-[32px] leading-none tracking-tight">
            Everything Basics drafted on your behalf.
          </h1>
          <p className="text-[14px] text-muted-foreground mt-2 max-w-xl">
            Nothing in this list left your workspace without your approval — or a trust grant you explicitly created.
          </p>
        </div>

        {outputs.length === 0 && (
          <Card className="py-16 border-dashed shadow-none">
            <div className="text-center">
              <div className="text-[14px] text-muted-foreground">No outputs yet.</div>
            </div>
          </Card>
        )}

        <div className="space-y-2.5">
          {outputs.map((o, idx) => (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <Card className="px-5 py-4 hover:border-foreground/20 transition-colors shadow-none">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 mt-0.5">
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] uppercase tracking-wider"
                    >
                      {o.kind === 'email_draft' ? 'email' : o.kind === 'sms_draft' ? 'sms' : 'invoice'}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-[14.5px] truncate">{o.title}</div>
                      <span className="text-[11px] text-muted-foreground font-mono shrink-0">{o.createdAt}</span>
                    </div>
                    <div className="text-[11.5px] text-muted-foreground mt-0.5 font-mono">{o.to}</div>
                    <div className="text-[13px] text-foreground/85 mt-2 leading-snug line-clamp-2">{o.preview}</div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {o.status === 'sent' ? 'sent' : o.status === 'approved' ? 'approved' : 'pending'}
                  </Badge>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
