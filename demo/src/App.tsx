import { useEffect, useRef, useState } from 'react'
import { useDemo } from '@/store'
import { BEATS, TOTAL_DURATION_MS } from '@/script'
import { AppSidebar } from '@/components/AppSidebar'
import { TopBar } from '@/components/TopBar'
import { PlaybackBar } from '@/components/PlaybackBar'
import { AuthoringPanel } from '@/components/AuthoringPanel'
import { AutomationsPanel } from '@/components/AutomationsPanel'
import { RunPanel } from '@/components/RunPanel'
import { SkillsPanel } from '@/components/SkillsPanel'
import { OutputsPanel } from '@/components/OutputsPanel'
import { ApprovalsPanel } from '@/components/ApprovalsPanel'
import { ApprovalOverlay } from '@/components/ApprovalOverlay'
import { Toast } from '@/components/Toast'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AnimatePresence, motion } from 'framer-motion'

export default function App() {
  const view = useDemo((s) => s.view)
  const playing = useDemo((s) => s.playing)
  const speed = useDemo((s) => s.speed)
  const setSceneIdx = useDemo((s) => s.patch)

  const [elapsed, setElapsed] = useState(0)
  const fired = useRef<Set<number>>(new Set())
  const last = useRef<number>(performance.now())

  useEffect(() => {
    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(64, now - last.current)
      last.current = now
      if (playing) {
        setElapsed((prev) => Math.min(TOTAL_DURATION_MS, prev + dt * speed))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed])

  useEffect(() => {
    const store = useDemo.getState()
    const api = {
      patch: store.patch,
      appendChat: store.appendChat,
      growChat: store.growChat,
      upsertToolCall: store.upsertToolCall,
      addOutput: store.addOutput,
      addRunStep: store.addRunStep,
      setToast: store.setToast,
      get: useDemo.getState,
    }
    BEATS.forEach((b, idx) => {
      if (b.t <= elapsed && !fired.current.has(idx)) {
        fired.current.add(idx)
        if (b.patch) store.patch(b.patch)
        if (b.do) b.do(api)
        setSceneIdx({ sceneIdx: idx })
      }
    })
  }, [elapsed, setSceneIdx])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        useDemo.getState().patch({ playing: !useDemo.getState().playing })
      }
      if (e.code === 'KeyR' && e.target === document.body) {
        fired.current = new Set()
        useDemo.getState().reset()
        setElapsed(0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reset = () => {
    fired.current = new Set()
    useDemo.getState().reset()
    setElapsed(0)
  }
  const seekTo = (ms: number) => {
    fired.current = new Set()
    useDemo.getState().reset()
    setElapsed(0)
    requestAnimationFrame(() => setElapsed(ms))
  }

  return (
    <TooltipProvider delayDuration={150}>
      <SidebarProvider defaultOpen style={{ '--sidebar-width': '15rem' } as React.CSSProperties}>
        <AppSidebar />
        <SidebarInset className="flex flex-col min-w-0 overflow-hidden !h-[calc(100svh-1rem)]">
          <TopBar />
          <main className="flex-1 min-w-0 min-h-0 relative overflow-hidden noise-bg">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
              >
                {view === 'authoring'   && <AuthoringPanel />}
                {view === 'automations' && <AutomationsPanel />}
                {view === 'run'         && <RunPanel />}
                {view === 'skills'      && <SkillsPanel />}
                {view === 'outputs'     && <OutputsPanel />}
                {view === 'approvals'   && <ApprovalsPanel />}
              </motion.div>
            </AnimatePresence>
          </main>
          <ApprovalOverlay />
          <Toast />
          <PlaybackBar elapsed={elapsed} totalMs={TOTAL_DURATION_MS} onReset={reset} onSeek={seekTo} />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
