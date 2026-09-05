"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, RefreshCw, ChevronLeft, ChevronRight, X } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useActivity } from "@/components/admin/hooks";
import { relativeTime } from "@/lib/om/format";
import { cn } from "@/lib/utils";

const LIMIT = 50;

function statusColor(code: number | null) {
  if (!code) return "text-om-muted";
  if (code >= 500) return "text-om-red";
  if (code >= 400) return "text-om-amber";
  return "text-om-green";
}

export default function AdminActivityPage() {
  return (
    <Suspense fallback={<EmptyState title="Loading…" />}>
      <AdminActivityContent />
    </Suspense>
  );
}

function AdminActivityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspace_id") || undefined;
  const label = searchParams.get("label") || undefined;

  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, isLoading, refetch, isFetching } = useActivity({
    action: action || undefined,
    workspace_id: workspaceId,
    limit: LIMIT,
    offset,
  });
  const total = data?.total ?? 0;

  return (
    <div className="space-y-3">
      <SectionHeading
        title="Activity"
        subtitle={
          workspaceId
            ? `Everything done on the "${label ?? workspaceId}" subdomain`
            : "What users actually do on the platform — every authenticated request, live"
        }
        icon={<Activity />}
        actions={
          <OmButton variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
          </OmButton>
        }
      />

      {workspaceId && (
        <div className="flex items-center gap-2 rounded-lg border border-om-violet/25 bg-om-violet/[0.07] px-3 py-1.5 text-[11.5px] text-om-violet">
          Filtered to subdomain <span className="font-semibold">{label ?? workspaceId}</span>
          <button onClick={() => router.push("/admin/activity")} className="ml-auto flex items-center gap-1 text-om-muted hover:text-om-text">
            <X className="size-3" /> Clear
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={action}
          onChange={(e) => { setAction(e.target.value); setOffset(0); }}
          placeholder="Filter by action, e.g. posts.publish"
          className="w-72 rounded-lg border border-om-border bg-white/[0.03] px-3 py-1.5 text-[12px] text-om-text outline-none placeholder:text-om-muted focus:border-om-violet/60"
        />
      </div>

      <Card noEdge className="p-0">
        {isLoading ? (
          <EmptyState title="Loading…" />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={<Activity />} title="No activity recorded yet">
            Requests from tenant users will show up here as they use the app.
          </EmptyState>
        ) : (
          <>
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Route</th>
                    <th>Status</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap text-om-muted">{relativeTime(r.created_at)}</td>
                      <td className="truncate">{r.user_email ?? "—"}</td>
                      <td className="font-mono text-[10.5px] text-om-dim">{r.action ?? "—"}</td>
                      <td className="truncate font-mono text-[10px] text-om-faint">{r.method} {r.path}</td>
                      <td className={cn("font-mono", statusColor(r.status_code))}>{r.status_code ?? "—"}</td>
                      <td className="text-om-muted">{r.duration_ms != null ? `${r.duration_ms}ms` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            <div className="flex items-center justify-between border-t border-om-border px-3 py-2 text-[11px] text-om-muted">
              <span>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
              <div className="flex gap-1">
                <OmButton variant="ghost" size="xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                  <ChevronLeft /> Prev
                </OmButton>
                <OmButton variant="ghost" size="xs" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
                  Next <ChevronRight />
                </OmButton>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
