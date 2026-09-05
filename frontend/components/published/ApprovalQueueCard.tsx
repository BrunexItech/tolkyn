"use client";

import { useState } from "react";
import { Check, Clock, Loader2, X } from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { platform as findPlatform } from "@/lib/om/platforms";
import { relativeTime } from "@/lib/om/format";
import { useApprovePost, useRejectPost } from "./hooks";
import type { Post } from "@/lib/api/posts";

/** One post waiting on a reviewer — approve publishes/schedules it exactly as
 * the author asked, reject sends it back to draft with a reason attached. */
export function ApprovalQueueCard({ post }: { post: Post }) {
  const approve = useApprovePost();
  const reject = useRejectPost();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const busy = approve.isPending || reject.isPending;

  return (
    <Card accent="amber" className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            {post.platforms.map((pid) => {
              const p = findPlatform(pid);
              return p ? <p.Icon key={pid} className="size-3.5" style={{ color: p.color }} /> : null;
            })}
            <span className="text-[10.5px] text-om-faint">
              {post.pending_scheduled_at
                ? `wants to schedule for ${new Date(post.pending_scheduled_at).toLocaleString()}`
                : "wants to publish now"}
            </span>
          </div>
          <p className="line-clamp-2 text-[12.5px] text-om-dim">{post.body || "(no text)"}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-om-faint">
          <Clock className="size-3" /> {relativeTime(post.created_at)}
        </span>
      </div>

      {rejecting ? (
        <div className="space-y-1.5">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being sent back?"
            className="w-full rounded-lg border border-om-border bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-om-text outline-none focus:border-om-red/60"
          />
          <div className="flex justify-end gap-1.5">
            <OmButton variant="ghost" size="sm" onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </OmButton>
            <OmButton
              variant="danger"
              size="sm"
              disabled={busy || !reason.trim()}
              onClick={() => reject.mutate({ id: post.id, reason: reason.trim() }, { onSuccess: () => setRejecting(false) })}
            >
              {reject.isPending && <Loader2 className="animate-spin" />} Send back
            </OmButton>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-1.5">
          <OmButton variant="ghost" size="sm" onClick={() => setRejecting(true)} disabled={busy}>
            <X className="size-3.5" /> Reject
          </OmButton>
          <OmButton variant="solid" size="sm" onClick={() => approve.mutate(post.id)} disabled={busy}>
            {approve.isPending ? <Loader2 className="animate-spin" /> : <Check className="size-3.5" />} Approve
          </OmButton>
        </div>
      )}
    </Card>
  );
}
