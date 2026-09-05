/** Content-area placeholder for route transitions. Renders inside the app
 * shell (sidebar + top bar stay put), so navigating between pages shows a
 * stable silhouette that fades straight into the real page — never a
 * full-screen flash. */
export function PageSkeleton() {
  return (
    <div className="space-y-3">
      {/* heading */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="om-skel size-8 shrink-0 rounded-lg" />
        <div className="space-y-1.5">
          <div className="om-skel h-3 w-40" />
          <div className="om-skel h-2 w-56" />
        </div>
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="om-skel h-[66px]" />
        ))}
      </div>

      {/* content */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="om-skel h-72" />
        <div className="om-skel h-72" />
      </div>
      <div className="om-skel h-40" />
    </div>
  );
}
