import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown the moment an admin link is clicked, while the next page's queries run.
 *
 * Without it the old page simply stayed put until the new one was ready, and an organiser
 * who saw nothing happen clicked again. It sits inside the admin layout, so the sidebar
 * and the header stay where they are and only the content area changes. The shape is the
 * admin page pattern — heading row, wide column, side cards — so the page lands without
 * the layout jumping.
 */
export default function AdminLoading() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-[70vw]" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="gap-0 py-0">
          <div className="border-b p-3">
            <Skeleton className="h-8 w-56" />
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-b p-4 last:border-b-0">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>

        <div className="hidden flex-col gap-6 lg:flex">
          <Card className="gap-3 p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </Card>
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
