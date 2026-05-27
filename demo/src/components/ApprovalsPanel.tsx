import { useDemo } from '@/store'
import { ClipboardText, DeviceMobile, ShieldCheck } from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function ApprovalsPanel() {
  const pending = useDemo((s) => s.pendingApproval)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-semibold mb-2">approvals</div>
          <h1 className="font-display text-[32px] leading-none tracking-tight">
            One tap. Two surfaces. <span className="text-primary">First wins.</span>
          </h1>
          <p className="text-[14px] text-muted-foreground mt-2 max-w-xl">
            Every mutating action — email send, SMS send, invoice create, refund — pauses for your nod. Basics pings your phone and this dashboard at the same time. Whichever you tap first wins.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <DeviceMobile size={14} weight="regular" /> Phone (Sendblue)
              </CardTitle>
              <CardDescription className="font-mono text-foreground text-[14px]">+1 (412) 555-0186</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-[12px] text-muted-foreground leading-snug">iMessage if you're on Apple · SMS otherwise. Replies "YES" to approve, "NO" to deny.</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <ShieldCheck size={14} weight="regular" /> Trust grants
              </CardTitle>
              <CardDescription className="text-foreground text-[14px]">2 narrow rules · from past taps</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-[12px] text-muted-foreground leading-snug">Approving with "remember this" creates a precisely-scoped auto-approval rule. Revokable anytime.</p>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
          <ClipboardText size={14} weight="regular" /> Pending
        </h2>
        {!pending && (
          <Card className="border-dashed py-10 text-center shadow-none">
            <CardContent>
              <div className="text-[14px] text-muted-foreground">Inbox zero. Nothing waiting on you.</div>
            </CardContent>
          </Card>
        )}
        {pending && (
          <Card className="border-warn/40 shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-[16px]">{pending.title}</CardTitle>
              <CardDescription className="font-mono text-[11px]">tool: {pending.toolName}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-[12px] text-foreground whitespace-pre-wrap bg-muted border rounded-md p-3 max-h-40 overflow-y-auto font-sans leading-relaxed">{pending.preview}</pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
