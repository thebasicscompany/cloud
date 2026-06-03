import { Robot, Plug } from "@phosphor-icons/react/dist/ssr";

import {
  Cog,
  CogSolid,
  Play,
  PlaySolid,
  type Icon,
} from "@/icons";

const AgentIcon = Robot as unknown as Icon;
const ConnectionsIcon = Plug as unknown as Icon;

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

// One job per item, one row per job. Settings is the hub for everything that
// used to live here as its own sidebar entry (Connections, Apps, Team, Audit,
// Context, the old Agent diagnostic). Routes still exist for deep links.
export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    items: [
      { title: "Agents", url: "/agents", icon: AgentIcon, iconActive: AgentIcon },
      { title: "Activity", url: "/runs", icon: Play, iconActive: PlaySolid },
      { title: "Connections", url: "/connections", icon: ConnectionsIcon, iconActive: ConnectionsIcon },
      { title: "Settings", url: "/settings", icon: Cog, iconActive: CogSolid },
    ],
  },
];
