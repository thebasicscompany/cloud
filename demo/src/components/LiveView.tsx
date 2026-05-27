import { useDemo } from '@/store'
import { Lock, Globe, ArrowsClockwise, CaretLeft, CaretRight, DotsThreeVertical } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { JobBoardDashboard, JobBoardJobDetail } from './mocks/JobBoardPro'
import { QuickBooksInvoice } from './mocks/QuickBooks'
import { GmailCompose } from './mocks/Gmail'
import { LeadFormInbound } from './mocks/LeadForm'
import { GoogleMapsMock } from './mocks/GoogleMaps'
import { SmsCompose } from './mocks/Sms'

export function LiveView() {
  const scene = useDemo((s) => s.liveScene)
  const cursor = useDemo((s) => s.cursor)

  const urlBar = urlForScene(scene)

  return (
    <div className="h-full w-full rounded-xl overflow-hidden flex flex-col border border-border shadow-2xl">
      {/* fake Chromium chrome */}
      <div className="shrink-0 bg-neutral-200">
        <div className="px-3 pt-2 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-red-400/80" />
            <div className="size-2.5 rounded-full bg-yellow-400/80" />
            <div className="size-2.5 rounded-full bg-green-400/80" />
          </div>
          <div className="ml-3 flex items-center gap-1">
            <div className="px-3 py-1 rounded-t-md bg-white/80 text-[11px] text-neutral-700 max-w-xs truncate">
              {tabTitleForScene(scene)}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="px-2 py-0.5 text-[9px] uppercase tracking-wider rounded font-mono inline-flex items-center gap-1"
              style={{
                background: 'color-mix(in oklch, var(--color-primary) 18%, transparent)',
                color: 'var(--color-primary)',
              }}>
              <span className="size-1.5 rounded-full bg-primary pulse-dot" /> LIVE
            </span>
            <span className="text-[10px] text-neutral-500 font-mono">browserbase · sess-7k2a</span>
          </div>
        </div>
        <div className="px-3 pb-2 pt-1 bg-white flex items-center gap-2">
          <CaretLeft size={14} weight="bold" className="text-neutral-500" />
          <CaretRight size={14} weight="bold" className="text-neutral-400" />
          <ArrowsClockwise size={13} weight="bold" className="text-neutral-500" />
          <div className="flex-1 mx-2 px-3 py-1 rounded-md bg-neutral-100 border border-neutral-200 flex items-center gap-2 text-[11px] text-neutral-600">
            <Lock size={11} weight="fill" className="text-neutral-500" />
            <span className="truncate">{urlBar}</span>
          </div>
          <DotsThreeVertical size={14} weight="bold" className="text-neutral-500" />
        </div>
      </div>

      {/* viewport */}
      <div className="relative flex-1 bg-white overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={scene.kind + ('jobId' in scene ? scene.jobId : '')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 overflow-auto no-scrollbar"
          >
            <SceneRouter />
          </motion.div>
        </AnimatePresence>

        {scene.kind !== 'blank' && (
          <div
            className={`ghost-cursor ${cursor.clicking ? 'clicking' : ''}`}
            style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
          />
        )}
      </div>
    </div>
  )
}

function SceneRouter() {
  const scene = useDemo((s) => s.liveScene)
  switch (scene.kind) {
    case 'blank':                return <Blank />
    case 'jobboard_dashboard':   return <JobBoardDashboard />
    case 'jobboard_job_detail':  return <JobBoardJobDetail jobId={scene.jobId} />
    case 'quickbooks_invoice':   return <QuickBooksInvoice jobId={scene.jobId} />
    case 'gmail_compose':        return <GmailCompose subject={scene.subject} to={scene.to} body={scene.body} typed={scene.typed} />
    case 'lead_form_inbound':    return <LeadFormInbound name={scene.name} phone={scene.phone} address={scene.address} problem={scene.problem} />
    case 'google_maps':          return <GoogleMapsMock address={scene.address} />
    case 'sms_compose':          return <SmsCompose to={scene.to} body={scene.body} typed={scene.typed} />
  }
}

function Blank() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100">
      <div className="text-neutral-400 flex items-center gap-2">
        <Globe size={16} weight="regular" />
        <span className="text-sm">Browser ready · waiting for navigate()</span>
      </div>
    </div>
  )
}

function urlForScene(s: ReturnType<typeof useDemo.getState>['liveScene']): string {
  switch (s.kind) {
    case 'blank':                return 'about:blank'
    case 'jobboard_dashboard':   return 'app.jobboardpro.com/today'
    case 'jobboard_job_detail':  return `app.jobboardpro.com/jobs/${s.jobId}`
    case 'quickbooks_invoice':   return 'qbo.intuit.com/app/invoice'
    case 'gmail_compose':        return 'mail.google.com/mail/u/0/#inbox?compose=new'
    case 'lead_form_inbound':    return 'app.basics.ai/webhooks/lead-form/incoming'
    case 'google_maps':          return `maps.google.com/?q=${encodeURIComponent(s.address)}`
    case 'sms_compose':          return 'app.basics.ai/outputs/sms-draft'
  }
}

function tabTitleForScene(s: ReturnType<typeof useDemo.getState>['liveScene']): string {
  switch (s.kind) {
    case 'blank':                return 'New tab'
    case 'jobboard_dashboard':   return "Today — JobBoard Pro"
    case 'jobboard_job_detail':  return `Job ${s.jobId} — JobBoard Pro`
    case 'quickbooks_invoice':   return 'New invoice — QuickBooks'
    case 'gmail_compose':        return 'Compose — Gmail'
    case 'lead_form_inbound':    return 'Incoming webhook payload'
    case 'google_maps':          return 'Google Maps'
    case 'sms_compose':          return 'Outbound SMS draft'
  }
}
