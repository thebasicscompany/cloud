"use client";

import {
  Buildings,
  CalendarBlank,
  ChartLineUp,
  ChatsCircle,
  Coins,
  EnvelopeSimple,
  FileText,
  Kanban,
  Lightning,
  ListChecks,
  Megaphone,
  Notebook,
  Package,
  Storefront,
  Table as TableGlyph,
  Target,
  Tray,
  Users,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

/** Curated phosphor set for app surfaces - clean, consistent, themeable. */
export const APP_ICONS: Record<string, PhosphorIcon> = {
  users: Users,
  buildings: Buildings,
  kanban: Kanban,
  tray: Tray,
  notebook: Notebook,
  calendar: CalendarBlank,
  chart: ChartLineUp,
  checklist: ListChecks,
  coins: Coins,
  megaphone: Megaphone,
  envelope: EnvelopeSimple,
  document: FileText,
  chats: ChatsCircle,
  target: Target,
  storefront: Storefront,
  table: TableGlyph,
  bolt: Lightning,
  package: Package,
};

export const APP_ICON_CHOICES: { name: string; Icon: PhosphorIcon }[] = Object.entries(APP_ICONS).map(
  ([name, Icon]) => ({ name, Icon }),
);

const KEYWORD_ICONS: [RegExp, string][] = [
  [/crm|lead|contact|prospect|people|customer/i, "users"],
  [/compan|account|org/i, "buildings"],
  [/pipeline|deal|stage|board|kanban/i, "kanban"],
  [/inbox|digest|tray|triage/i, "tray"],
  [/email|mail|outreach/i, "envelope"],
  [/calendar|schedule|event|meeting/i, "calendar"],
  [/content|note|idea|draft|doc/i, "notebook"],
  [/metric|report|analytic|revenue|growth/i, "chart"],
  [/task|todo|checklist/i, "checklist"],
  [/invoice|payment|finance|billing|cost/i, "coins"],
  [/campaign|marketing|gtm|announce/i, "megaphone"],
  [/store|shop|product|order/i, "storefront"],
];

/** Resolve a phosphor icon for an app: explicit name → keyword → kind default. */
export function resolveAppIcon(app: { icon?: string | null; kind?: string; slug?: string; name?: string }): PhosphorIcon {
  if (app.icon && APP_ICONS[app.icon]) return APP_ICONS[app.icon]!;
  const hay = `${app.slug ?? ""} ${app.name ?? ""}`;
  for (const [re, key] of KEYWORD_ICONS) if (re.test(hay)) return APP_ICONS[key]!;
  if (app.kind === "board") return Kanban;
  if (app.kind === "list") return ListChecks;
  if (app.kind === "table") return TableGlyph;
  return Package;
}
