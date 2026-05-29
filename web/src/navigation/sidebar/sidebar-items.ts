import {
  Building2,
  ClipboardCheck,
  ClipboardCheckSolid,
  Cog,
  CogSolid,
  FileCheck2,
  FileSearch,
  FileSearchSolid,
  Folder,
  Globe,
  GlobeSolid,
  Home,
  HomeSolid,
  Play,
  Plug,
  PlaySolid,
  Workflow,
  WorkflowSolid,
  Wrench,
  type Icon,
} from "@/icons";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: Icon;
  iconActive?: Icon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: Icon;
  iconActive?: Icon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    items: [
      { title: "Home", url: "/", icon: Home, iconActive: HomeSolid },
      { title: "Browser", url: "/browser", icon: Globe, iconActive: GlobeSolid },
      { title: "Runs", url: "/runs", icon: Play, iconActive: PlaySolid },
      { title: "Automations", url: "/automations", icon: Workflow, iconActive: WorkflowSolid },
      { title: "Apps", url: "/apps", icon: Folder, iconActive: Folder },
      { title: "Documents", url: "/documents", icon: FileCheck2, iconActive: FileCheck2, isNew: true },
      { title: "Approvals", url: "/approvals", icon: ClipboardCheck, iconActive: ClipboardCheckSolid },
      { title: "Agent", url: "/agent", icon: Wrench, iconActive: Wrench, isNew: true },
      { title: "Team", url: "/team", icon: Building2, iconActive: Building2, isNew: true },
    ],
  },
  {
    id: 2,
    label: "Workspace",
    items: [
      { title: "Context", url: "/context", icon: Globe, iconActive: GlobeSolid },
      { title: "Connections", url: "/connections", icon: Plug, iconActive: Plug },
      { title: "Logs/Audit", url: "/logs", icon: FileSearch, iconActive: FileSearchSolid },
    ],
  },
  {
    id: 3,
    items: [{ title: "Settings", url: "/settings", icon: Cog, iconActive: CogSolid }],
  },
];
