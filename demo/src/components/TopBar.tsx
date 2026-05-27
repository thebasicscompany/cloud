import { useDemo } from '@/store'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { AnimatePresence, motion } from 'framer-motion'

export function TopBar() {
  const view = useDemo((s) => s.view)
  const storyTitle = useDemo((s) => s.storyTitle)
  const storySubtitle = useDemo((s) => s.storySubtitle)
  const clockTime = useDemo((s) => s.clockTime)

  return (
    <header className="h-14 shrink-0 border-b bg-background/80 backdrop-blur-sm flex items-center gap-3 px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="!h-5" />

      <Breadcrumb view={view} />

      <div className="flex-1 flex items-center justify-center px-4 min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={storyTitle}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.3 }}
            className="text-center max-w-3xl"
          >
            <div className="font-display text-[15px] font-medium tracking-tight leading-tight text-foreground">
              {storyTitle}
            </div>
            <div className="text-[12px] text-muted-foreground mt-0.5 truncate">{storySubtitle}</div>
          </motion.div>
        </AnimatePresence>
      </div>

      <Badge variant="outline" className="font-mono text-[11px] gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot inline-block" />
        live · {clockTime}
      </Badge>
    </header>
  )
}

function Breadcrumb({ view }: { view: string }) {
  const label =
    view === 'automations' ? 'Automations' :
    view === 'authoring'   ? 'Build new' :
    view === 'run'         ? 'Live run' :
    view === 'approvals'   ? 'Approvals' :
    view === 'outputs'     ? 'Outputs' :
    view === 'skills'      ? 'Skills' :
    view
  return (
    <nav className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
      <span>Workspace</span>
      <span className="text-border">/</span>
      <span className="text-foreground font-medium">{label}</span>
    </nav>
  )
}
