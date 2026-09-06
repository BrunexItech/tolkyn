"use client";

import { Clapperboard } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { useVideoUsage, useVideoModelCatalog } from "@/components/admin/hooks";

export default function AdminVideoPage() {
  const { data, isLoading } = useVideoUsage();
  const { data: models } = useVideoModelCatalog();
  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <SectionHeading
        title="AI video generation"
        subtitle="Spend and model access per user — full control lives on each user in Users & Rights"
        icon={<Clapperboard />}
      />

      {models && (
        <div className="grid gap-2 sm:grid-cols-3">
          {models.map((m) => (
            <Card key={m.key} noEdge className="p-3">
              <div className="text-[12px] font-semibold text-om-text">{m.label}</div>
              <p className="mt-0.5 text-[10.5px] text-om-muted">{m.description}</p>
              <div className="mt-1.5 font-mono text-[10.5px] text-om-dim">
                {Object.entries(m.price_per_second)
                  .map(([res, p]) => `${res}: $${p}/s`)
                  .join(" · ")}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card noEdge className="p-0">
        {isLoading ? (
          <EmptyState loading title="Loading…" />
        ) : items.length === 0 ? (
          <EmptyState icon={<Clapperboard />} title="No video generation yet">
            Spend and usage per user will show up here once someone generates a video.
          </EmptyState>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Videos</th>
                  <th>Seconds generated</th>
                  <th>Spend</th>
                  <th>Budget</th>
                  <th>Models allowed</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.user_id}>
                    <td>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[10.5px] text-om-muted">{r.email}</div>
                    </td>
                    <td className="text-om-dim">{r.jobs_count}</td>
                    <td className="text-om-dim">{r.seconds_generated}s</td>
                    <td className="font-mono text-om-text">${r.spend_usd.toFixed(2)}</td>
                    <td className="text-om-muted">{r.budget_usd != null ? `$${r.budget_usd.toFixed(2)}` : "Unlimited"}</td>
                    <td className="text-[10.5px] text-om-muted">
                      {r.allowed_video_models.length === 0 ? "All models" : r.allowed_video_models.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
