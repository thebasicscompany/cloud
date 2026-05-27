import { X, Minus, CaretDown, Paperclip, PaperPlaneTilt, Smiley, Image as ImageIcon, Lock, DotsThree } from '@phosphor-icons/react'

interface Props {
  subject: string
  to: string
  body: string
  typed: number
}

export function GmailCompose({ subject, to, body, typed }: Props) {
  const visible = body.slice(0, typed)
  const isTyping = typed < body.length
  return (
    <div className="h-full w-full bg-slate-100 relative">
      {/* fake Gmail inbox in the background */}
      <div className="absolute inset-0">
        <div className="h-12 bg-white border-b border-slate-200 flex items-center px-6 gap-4">
          <div className="text-red-500 font-bold text-lg">M</div>
          <div className="text-slate-700 font-medium">Gmail</div>
          <div className="ml-6 px-3 py-1.5 bg-slate-100 rounded-md text-xs text-slate-500 flex-1 max-w-md">Search mail</div>
          <div className="ml-auto w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">A</div>
        </div>
        <div className="grid grid-cols-[200px_1fr] h-full">
          <div className="bg-white border-r border-slate-200 p-4 space-y-2 text-xs text-slate-500">
            <div className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 inline-block font-medium">+ Compose</div>
            <div className="mt-3">Inbox · 41</div>
            <div className="text-slate-400">Starred</div>
            <div className="text-slate-400">Snoozed</div>
            <div className="text-slate-400">Sent</div>
            <div className="text-slate-400">Drafts · 3</div>
          </div>
          <div className="bg-white">
            <FakeInboxRow from="Sarah Chen" subject="re: AC tune-up tomorrow morning" preview="Hi Mike — confirming 10am tomorrow works…" time="3:24 PM" />
            <FakeInboxRow from="QuickBooks" subject="Invoice INV-2038 paid by Marcus Diaz" preview="$3,200.00 received via card ending in 4421…" time="2:21 PM" />
            <FakeInboxRow from="Ferguson Supply" subject="Order #FS-99201 ready for pickup" preview="Your AO Smith ProLine 65gal is ready at the…" time="1:08 PM" />
            <FakeInboxRow from="Patel family" subject="Drain still slow upstairs" preview="Hey Mike — the upstairs sink is draining slow again, when can…" time="11:42 AM" />
            <FakeInboxRow from="Google Reviews" subject="You got a new 5-star review" preview="James left you a 5-star review on Google: 'Mike and the team…'" time="9:15 AM" />
          </div>
        </div>
      </div>

      {/* the compose pane */}
      <div className="absolute bottom-0 right-12 w-[520px] bg-white rounded-t-lg shadow-2xl border border-slate-200 flex flex-col">
        <div className="h-9 bg-slate-700 text-white px-3 flex items-center justify-between rounded-t-lg">
          <div className="text-xs font-medium">{subject}</div>
          <div className="flex items-center gap-3 opacity-80">
            <Minus size={12} /><CaretDown size={12} weight="bold" /><X size={12} />
          </div>
        </div>

        <div className="px-3 py-2 border-b border-slate-100 text-xs">
          <div className="flex items-center gap-2 py-1">
            <span className="text-slate-500 w-6">To</span>
            <span className="text-slate-700">{to}</span>
          </div>
          <div className="flex items-center gap-2 py-1 border-t border-slate-100">
            <span className="text-slate-500 w-12">Subject</span>
            <span className="text-slate-900 font-medium">{subject}</span>
          </div>
        </div>

        <div className="px-4 py-4 text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[180px]">
          <span className={isTyping ? 'caret' : ''}>{visible}</span>
        </div>

        <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between">
          <button className="px-4 py-1.5 rounded bg-blue-600 text-white text-xs flex items-center gap-1.5 opacity-60 cursor-not-allowed">
            <PaperPlaneTilt size={11} weight="fill" /> Send <CaretDown size={11} weight="bold" />
          </button>
          <div className="flex items-center gap-3 text-slate-400">
            <Paperclip size={14} /><Smiley size={14} /><ImageIcon size={14} /><Lock size={14} /><DotsThree size={14} weight="bold" />
          </div>
        </div>
        <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-800 inline-flex items-center gap-1">
          Paused for your approval — won't send until you tap Approve.
        </div>
      </div>
    </div>
  )
}

function FakeInboxRow({ from, subject, preview, time }: { from: string; subject: string; preview: string; time: string }) {
  return (
    <div className="px-6 py-2.5 border-b border-slate-100 grid grid-cols-[160px_1fr_60px] gap-3 text-[12px] hover:bg-slate-50">
      <div className="font-semibold text-slate-700 truncate">{from}</div>
      <div className="truncate"><span className="text-slate-900 font-medium">{subject}</span> <span className="text-slate-500">— {preview}</span></div>
      <div className="text-slate-400 text-right">{time}</div>
    </div>
  )
}
