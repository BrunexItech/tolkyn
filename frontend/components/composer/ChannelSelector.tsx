"use client";

import Link from "next/link";
import { Share2, Check, Plug, TriangleAlert, CheckCheck, X } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { PlatformGlyph } from "@/components/om/primitives/PlatformChip";
import { platform as findPlatform } from "@/lib/om/platforms";
import { useConnections } from "@/components/accounts/hooks";
import { compact } from "@/lib/om/format";
import { cn } from "@/lib/utils";

export function ChannelSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { data } = useConnections();
  const rows = (data?.items ?? []).filter((c) => c.status === "connected" || c.needs_reauth);
  const connected = rows.filter((c) => c.status === "connected");

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);

  const allIds = connected.map((c) => c.platform);
  const allOn = allIds.length > 0 && allIds.every((id) => selected.includes(id));

  return (
    <Card>
      <CardTitle
        icon={<Share2 />}
        action={
          connected.length > 0 ? (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-om-muted">
                {selected.length}/{connected.length}
              </span>
              <button
                onClick={() => onChange(allOn ? [] : allIds)}
                className="flex items-center gap-1 text-om-blue hover:underline"
              >
                {allOn ? <X className="size-3" /> : <CheckCheck className="size-3" />}
                {allOn ? "Clear" : "All"}
              </button>
            </div>
          ) : null
        }
      >
        Channels
      </CardTitle>

      {rows.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-om-border bg-white/[0.01] px-3 py-4 text-[11.5px] text-om-muted">
          <Plug className="size-4 text-om-amber" />
          <span>
            No connected accounts.{" "}
            <Link href="/dashboard/accounts" className="text-om-blue underline">
              Connect a channel
            </Link>{" "}
            to publish.
          </span>
        </div>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {rows.map((c) => {
            const p = findPlatform(c.platform);
            if (!p) return null;
            const on = selected.includes(c.platform);
            const reauth = c.needs_reauth;
            return (
              <button
                key={c.platform}
                disabled={reauth}
                onClick={() => toggle(c.platform)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  reauth
                    ? "border-om-amber/30 bg-om-amber/[0.05] opacity-70"
                    : on
                      ? "border-om-blue/50 bg-om-blue/[0.08]"
                      : "border-om-border bg-white/[0.02] hover:border-om-border-strong",
                )}
              >
                <span className="relative shrink-0">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" className="size-7 rounded-md object-cover" />
                  ) : (
                    <PlatformGlyph platform={p} size={28} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{p.name}</span>
                  <span className="block truncate text-[9.5px] text-om-muted">
                    {reauth ? (
                      <Link href="/dashboard/accounts" className="text-om-amber underline">
                        Reconnect needed
                      </Link>
                    ) : (
                      <>
                        {c.handle || c.display_name}
                        {c.followers ? ` · ${compact(c.followers)}` : ""}
                      </>
                    )}
                  </span>
                </span>
                {!reauth && (
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border",
                      on ? "border-om-blue bg-om-blue text-white" : "border-om-border-strong",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                )}
                {reauth && <TriangleAlert className="size-3.5 shrink-0 text-om-amber" />}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
