import { useDemo } from '@/store'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, X, DeviceMobile, Monitor, ShieldCheck, Sparkle } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export function ApprovalOverlay() {
  const ap = useDemo((s) => s.pendingApproval)

  return (
    <AnimatePresence>
      {ap && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-8"
        >
          <motion.div
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 16 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl"
          >
            <Card className="overflow-hidden p-0 shadow-2xl gap-0">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in oklch, var(--color-warn) 22%, transparent)' }}>
                    <ShieldCheck size={18} weight="fill" style={{ color: 'oklch(0.55 0.18 65)' }} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Approval required</div>
                    <div className="font-display text-[16px] font-medium leading-tight">{ap.title}</div>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] font-normal">{ap.toolName}</Badge>
              </div>

              <div className="px-6 py-3 bg-muted/50 border-b flex items-center gap-4 text-[12px] flex-wrap">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <DeviceMobile size={13} weight="regular" className="text-primary" />
                  <span>Pinged your phone</span>
                  <span className="text-border">·</span>
                  <span className="font-mono">+1 (412) 555-0186</span>
                </div>
                <Separator orientation="vertical" className="!h-3" />
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Monitor size={13} weight="regular" className="text-primary" />
                  <span>Showing on this dashboard</span>
                </div>
                <div className="ml-auto text-[10px] text-muted-foreground/80 font-mono">first responder wins</div>
              </div>

              <div className="px-6 py-5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Preview</div>
                <pre className="text-[12.5px] text-foreground leading-relaxed whitespace-pre-wrap bg-muted/40 border rounded-md p-4 max-h-64 overflow-y-auto font-sans">
                  {ap.preview}
                </pre>

                <div className="mt-4 text-[11.5px] text-muted-foreground italic flex items-start gap-1.5">
                  <span className="text-warn">⚠</span> {ap.riskLine}
                </div>

                <label className="mt-4 flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={ap.remember}
                    className="size-4 accent-primary cursor-pointer"
                    readOnly
                  />
                  <span className="text-[13px] text-foreground inline-flex items-center gap-1.5">
                    <Sparkle size={13} weight="fill" className="text-primary" />
                    Remember this — auto-approve similar calls in this automation
                  </span>
                </label>
              </div>

              <div className="px-6 py-4 border-t flex items-center justify-end gap-2 bg-muted/30">
                <Button variant="ghost">
                  <X size={14} weight="bold" /> Deny
                </Button>
                <Button>
                  {ap.status === 'approved' ? (
                    <><CheckCircle size={14} weight="fill" /> Approved</>
                  ) : (
                    'Approve and send'
                  )}
                </Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
