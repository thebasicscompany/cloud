import type { Icon } from "@/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlaceholderRow = { label: string; value: string; detail: string };

const DEFAULT_ROWS: PlaceholderRow[] = [
  { label: "Status", value: "Ready for wiring", detail: "Route shell exists and is ready for data hooks." },
  { label: "State", value: "Mock-first", detail: "Use realistic fixtures before API cutover." },
  { label: "QA", value: "Required", detail: "Add product-flow tests when this route goes live." },
];

type Props = {
  icon: Icon;
  title: string;
  description: string;
  primaryAction?: { label: string; href: string };
  rows?: PlaceholderRow[];
};

export function RoutePlaceholder({ icon: Icon, title, description, primaryAction, rows }: Props) {
  const displayRows = rows && rows.length > 0 ? rows : DEFAULT_ROWS;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-start gap-4 rounded-lg border bg-card p-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">{description}</p>
        </div>
        {primaryAction && (
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <a href={primaryAction.href}>{primaryAction.label}</a>
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {displayRows.map((row) => (
          <Card key={row.label} size="sm">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">{row.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-semibold text-sm">{row.value}</div>
              <p className="mt-1 text-muted-foreground text-xs">{row.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
