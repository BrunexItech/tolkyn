"use client";

import { useState } from "react";
import { Loader2, AlertTriangle, Trash2, Download, Clapperboard } from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { relativeTime } from "@/lib/om/format";
import { downloadFile } from "@/lib/om/download";
import { toast } from "@/lib/om/toast";
import { mediaUrl, type VideoJob } from "@/lib/api/video";
import { useVideoJobs, useDeleteVideo } from "./hooks";

const STATUS_TONE: Record<string, BadgeTone> = {
  queued: "blue",
  running: "amber",
  succeeded: "green",
  failed: "red",
};

function JobCard({ job }: { job: VideoJob }) {
  const del = useDeleteVideo();
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!job.video_url || downloading) return;
    setDownloading(true);
    try {
      await downloadFile(mediaUrl(job.video_url), `tolkyn-video-${job.id}.mp4`);
    } catch (e) {
      toast.err((e as Error).message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card noEdge className="overflow-hidden p-0">
      <div className="relative flex aspect-video items-center justify-center bg-black/40">
        {job.status === "succeeded" && job.video_url ? (
          <video src={mediaUrl(job.video_url)} controls className="h-full w-full object-contain" />
        ) : job.status === "failed" ? (
          <div className="flex flex-col items-center gap-1.5 px-4 text-center">
            <AlertTriangle className="size-5 text-om-red" />
            <p className="text-[10.5px] text-om-muted">{job.error_message ?? "Generation failed"}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Loader2 className="size-5 animate-spin text-om-violet" />
            <p className="text-[10.5px] text-om-muted">{job.status === "queued" ? "Queued…" : "Generating… ~1-2 min"}</p>
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge tone={STATUS_TONE[job.status] ?? "muted"}>{job.status}</StatusBadge>
          <div className="flex items-center gap-1">
            {job.status === "succeeded" && job.video_url && (
              <button
                onClick={download}
                disabled={downloading}
                className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-white/[0.06] hover:text-om-text disabled:opacity-50"
                title="Download"
              >
                {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              </button>
            )}
            <button
              onClick={() => del.mutate(job.id)}
              className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
        <p className="line-clamp-2 text-[11px] leading-snug text-om-dim">{job.prompt}</p>
        <div className="flex items-center justify-between text-[9.5px] text-om-faint">
          <span>{job.resolution} · {job.duration_seconds}s · {job.aspect_ratio}</span>
          <span>${job.cost_usd.toFixed(2)} · {relativeTime(job.created_at)}</span>
        </div>
      </div>
    </Card>
  );
}

export function VideoGallery() {
  const { data, isLoading } = useVideoJobs();
  const items = data?.items ?? [];

  if (isLoading) return <Card><EmptyState loading title="Loading…" /></Card>;
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Clapperboard />} title="No videos yet">
          Generate your first one with the form above.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((job) => <JobCard key={job.id} job={job} />)}
    </div>
  );
}
