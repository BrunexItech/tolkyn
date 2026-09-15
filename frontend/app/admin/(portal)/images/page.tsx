"use client";

import { Sparkles } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { useImageUsage } from "@/components/admin/hooks";

export default function AdminImagesPage() {
  const { data, isLoading } = useImageUsage();
  const items = data?.items ?? [];
  const totalSpend = items.reduce((sum, r) => sum + r.spend_usd, 0);
  const totalJobs = items.reduce((sum, r) => sum + r.jobs_count, 0);

  return (
    <div className="space-y-3">
      <SectionHeading
        title="AI image generation"
        subtitle="Spend and usage per user — Content Studio's gpt-image-2.5 pipeline"
        icon={<Sparkles />}
      />

      <Card noEdge className="p-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <span className="text-[10.5px] uppercase tracking-wide text-om-muted">Images generated</span>
            <div className="font-mono text-[15px] text-om-text">{totalJobs}</div>
          </div>
          <div>
            <span className="text-[10.5px] uppercase tracking-wide text-om-muted">Estimated spend</span>
            <div className="font-mono text-[15px] text-om-text">${totalSpend.toFixed(2)}</div>
          </div>
        </div>
        <p className="mt-1.5 text-[10.5px] text-om-muted">
          Estimated, not an exact billed figure — OpenAI's API doesn't return per-image token usage for the chat
          pipeline, so this is a flat calibrated cost per image. See the video page for exact spend.
        </p>
      </Card>

      <Card noEdge className="p-0">
        {isLoading ? (
          <EmptyState loading title="Loading…" />
        ) : items.length === 0 ? (
          <EmptyState icon={<Sparkles />} title="No image generation yet">
            Spend and usage per user will show up here once someone generates an image.
          </EmptyState>
        ) : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Images</th>
                  <th>Est. spend</th>
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
                    <td className="font-mono text-om-text">${r.spend_usd.toFixed(2)}</td>
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
