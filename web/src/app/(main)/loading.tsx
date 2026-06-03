// Instant-navigation skeleton for every (main) page. Next renders this the moment
// a tab is clicked - while the page's server data streams in over the network - so
// navigation feels immediate instead of pausing on the fetch. Keep it lightweight.

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2.5">
        <Bar className="h-7 w-56" />
        <Bar className="h-4 w-80 max-w-full bg-muted/60" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Bar key={i} className="h-14 w-full bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
