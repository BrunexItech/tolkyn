"use client";

import { useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { useMe } from "@/components/settings/hooks";

/** A plain days-remaining reminder in the final 3 days before
 * User.subscription_ends_at (super-admin-set; unset by default so no
 * existing account sees this). Deliberately shows nothing else -- no
 * usage counts, no cost -- see core/limits.py and schemas/auth.py for
 * why that split exists. Dismissible per day: reappears tomorrow if
 * still within the window, since the deadline hasn't moved. */
export function SubscriptionEndingBanner() {
  const { data: me } = useMe();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  if (!me?.subscription_ends_at) return null;
  const ends = new Date(me.subscription_ends_at);
  const daysLeft = Math.ceil((ends.getTime() - Date.now()) / 86_400_000);
  if (daysLeft > 3 || daysLeft < 0) return null;

  const todayKey = new Date().toDateString();
  if (dismissedFor === todayKey) return null;

  const label =
    daysLeft === 0
      ? "Your subscription ends today"
      : `Your subscription ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;

  return (
    <div className="flex items-center gap-2 border-b border-om-amber/25 bg-om-amber/[0.08] px-4 py-1.5 text-[11.5px] text-om-amber">
      <CalendarClock className="size-3.5 shrink-0" />
      <span className="flex-1">
        {label} — contact your platform administrator to renew.
      </span>
      <button
        type="button"
        onClick={() => setDismissedFor(todayKey)}
        className="shrink-0 text-om-amber/70 hover:text-om-amber"
        aria-label="Dismiss for today"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
