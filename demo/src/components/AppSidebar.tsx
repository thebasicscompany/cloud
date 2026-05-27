import {
  SquaresFour,
  MagicWand,
  PlayCircle,
  ClipboardText,
  Tray,
  BookOpen,
  type Icon,
} from '@phosphor-icons/react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useDemo, type View } from '@/store'

interface NavItem { key: View; label: string; icon: Icon; group: 'main' | 'work' }
const ITEMS: NavItem[] = [
  { key: 'automations', label: 'Automations', icon: SquaresFour,    group: 'main' },
  { key: 'authoring',   label: 'Build new',   icon: MagicWand,      group: 'main' },
  { key: 'run',         label: 'Live run',    icon: PlayCircle,     group: 'work' },
  { key: 'approvals',   label: 'Approvals',   icon: ClipboardText,  group: 'work' },
  { key: 'outputs',     label: 'Outputs',     icon: Tray,           group: 'work' },
  { key: 'skills',      label: 'Skills',      icon: BookOpen,       group: 'work' },
]

export function AppSidebar() {
  const view = useDemo((s) => s.view)
  const setView = useDemo((s) => s.patch)
  const automations = useDemo((s) => s.automations)
  const outputs = useDemo((s) => s.outputs)
  const skills = useDemo((s) => s.skills)
  const pendingApproval = useDemo((s) => s.pendingApproval)
  const browserSites = useDemo((s) => s.browserSites)
  const workspace = useDemo((s) => s.workspace)

  const badgeFor = (k: View): { value: string; tone?: 'urgent' } | null => {
    if (k === 'automations' && automations.length) return { value: String(automations.length) }
    if (k === 'outputs'     && outputs.length)     return { value: String(outputs.length) }
    if (k === 'skills'      && skills.length)      return { value: String(skills.length) }
    if (k === 'approvals'   && pendingApproval)    return { value: '1', tone: 'urgent' }
    return null
  }

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <img src="/logo.png" alt="Basics" className="h-7 w-7 rounded-[7px] shrink-0" />
          <div className="grid leading-tight">
            <div className="font-display text-[14.5px] font-medium tracking-tight">Basics</div>
            <div className="text-[10.5px] text-muted-foreground">{workspace.name}</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.filter((i) => i.group === 'main').map((item) => {
                const badge = badgeFor(item.key)
                const Icon = item.icon
                const active = view === item.key
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => setView({ view: item.key })}
                    >
                      <Icon size={16} weight={active ? 'fill' : 'regular'} className="shrink-0" />
                      <span className="text-[13.5px]">{item.label}</span>
                      {badge && (
                        <Badge
                          variant={badge.tone === 'urgent' ? 'destructive' : 'secondary'}
                          className="ml-auto h-5 px-1.5 text-[10px] font-mono"
                        >
                          {badge.value}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Activity</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.filter((i) => i.group === 'work').map((item) => {
                const badge = badgeFor(item.key)
                const Icon = item.icon
                const active = view === item.key
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => setView({ view: item.key })}
                    >
                      <Icon size={16} weight={active ? 'fill' : 'regular'} className="shrink-0" />
                      <span className="text-[13.5px]">{item.label}</span>
                      {badge && (
                        <Badge
                          variant={badge.tone === 'urgent' ? 'destructive' : 'secondary'}
                          className="ml-auto h-5 px-1.5 text-[10px] font-mono"
                        >
                          {badge.value}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Connected sites</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {browserSites.map((s) => (
                <SidebarMenuItem key={s.host}>
                  <SidebarMenuButton size="sm" className="text-muted-foreground hover:text-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="truncate text-[12px]">{s.host.replace(/^(app|mail|qbo)\./, '')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Separator />
        <div className="px-2 py-1.5 flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-secondary text-secondary-foreground inline-flex items-center justify-center text-[11px] font-medium">MK</div>
          <div className="grid leading-tight">
            <span className="text-[12.5px] font-medium">Mike Kowalski</span>
            <span className="text-[10px] text-muted-foreground">owner · acme home services</span>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
