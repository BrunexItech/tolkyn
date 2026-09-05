"use client";

import { useEffect, useState } from "react";
import {
  Plug,
  PlugZap,
  Unplug,
  CheckCircle2,
  Loader2,
  TriangleAlert,
  RefreshCw,
  ExternalLink,
  Circle,
} from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { StatTile } from "@/components/om/primitives/StatTile";
import { Card } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { PlatformGlyph } from "@/components/om/primitives/PlatformChip";
import { PLATFORMS, platform as findPlatform } from "@/lib/om/platforms";
import { compact, relativeTime } from "@/lib/om/format";
import { toast } from "@/lib/om/toast";
import { cn } from "@/lib/utils";
import { ConnectDialog } from "@/components/accounts/ConnectDialog";
import {
  useConnections,
  useDisconnect,
  useConnectPage,
  useSyncConnections,
} from "@/components/accounts/hooks";
import { SUPPORTED_PLATFORMS } from "@/lib/api/social";
import type { SocialConnection } from "@/lib/api/social";

const CHANNELS = PLATFORMS.filter((p) => (SUPPORTED_PLATFORMS as readonly string[]).includes(p.id));

export default function AccountsPage() {
  const { data } = useConnections();
  const disconnect = useDisconnect();
  const connectPage = useConnectPage();
  const sync = useSyncConnections();
  const [connecting, setConnecting] = useState<string | null>(null);

  // Always pull fresh state from Upload-Post when landing here (covers returning
  // from a connect flow, where the passive list may be within its sync throttle).
  useEffect(() => {
    const returned = new URLSearchParams(window.location.search).has("connected");
    sync.mutate(undefined, {
      onSuccess: (d) => {
        if (returned) {
          toast[d.connected.length ? "ok" : "info"](
            d.connected.length
              ? `${d.connected.length} ${d.connected.length === 1 ? "channel" : "channels"} connected`
              : "No channel connected yet — try again on the connect page",
          );
        }
      },
    });
    if (returned) window.history.replaceState(null, "", "/dashboard/accounts");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byPlatform = new Map((data?.items ?? []).map((c) => [c.platform, c]));
  const configured = data?.configured ?? true;

  const connected = CHANNELS.filter((p) => byPlatform.get(p.id)?.status === "connected");
  const reconnect = CHANNELS.filter((p) => byPlatform.get(p.id)?.needs_reauth);
  const available = CHANNELS.filter(
    (p) => !connected.includes(p) && !reconnect.includes(p),
  );
  const totalFollowers = connected.reduce((s, p) => s + (byPlatform.get(p.id)?.followers ?? 0), 0);

  return (
    <div className="om-anim-rise space-y-4">
      <SectionHeading
        title="Connected Accounts"
        subtitle="Link your social profiles so Tolkyn can publish, listen and report"
        icon={<Plug />}
        actions={
          <div className="flex items-center gap-1.5">
            <OmButton
              variant="ghost"
              size="sm"
              onClick={() => sync.mutate()}
              disabled={sync.isPending || !configured}
            >
              <RefreshCw className={sync.isPending ? "animate-spin" : ""} /> Refresh
            </OmButton>
            {configured && available.length + reconnect.length > 0 && (
              <OmButton
                variant="solid"
                size="sm"
                onClick={() => connectPage.mutate()}
                disabled={connectPage.isPending}
              >
                {connectPage.isPending ? <Loader2 className="animate-spin" /> : <PlugZap />}
                Manage all
              </OmButton>
            )}
          </div>
        }
      />

      {!configured && (
        <Card accent="amber" className="flex items-start gap-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-om-amber" />
          <div className="text-[11.5px] text-om-dim">
            <div className="font-semibold text-om-text">Social publishing isn&apos;t configured</div>
            Add <code className="rounded bg-white/[0.06] px-1">UPLOAD_POST_API_KEY</code> to{" "}
            <code className="rounded bg-white/[0.06] px-1">backend/.env</code> and restart the API.
          </div>
        </Card>
      )}

      <Grid cols={3}>
        <StatTile label="Connected" value={`${connected.length}/${CHANNELS.length}`} icon={<CheckCircle2 />} color="var(--om-green)" />
        <StatTile label="Total audience" value={compact(totalFollowers)} icon={<Plug />} color="var(--om-blue)" />
        <StatTile
          label="Publish-ready"
          value={connected.length > 0 ? "Yes" : "No"}
          icon={<PlugZap />}
          color={connected.length > 0 ? "var(--om-green)" : "var(--om-amber)"}
        />
      </Grid>

      {/* CONNECTED */}
      <Section
        label="Connected"
        count={connected.length}
        empty={connected.length === 0 ? "No channels connected yet — connect one below." : undefined}
      >
        {connected.map((p) => (
          <ConnectedCard
            key={p.id}
            platformId={p.id}
            conn={byPlatform.get(p.id)!}
            onDisconnect={() => disconnect.mutate(p.id)}
            busy={disconnect.isPending}
          />
        ))}
      </Section>

      {/* NEEDS RECONNECT */}
      {reconnect.length > 0 && (
        <Section label="Needs attention" count={reconnect.length} tone="amber">
          {reconnect.map((p) => (
            <ReconnectCard key={p.id} platformId={p.id} conn={byPlatform.get(p.id)!} onReconnect={() => setConnecting(p.id)} />
          ))}
        </Section>
      )}

      {/* AVAILABLE */}
      <Section label="Not connected" count={available.length}>
        {available.map((p) => (
          <AvailableCard
            key={p.id}
            platformId={p.id}
            onConnect={() => setConnecting(p.id)}
            disabled={!configured}
          />
        ))}
      </Section>

      <ConnectDialog platformId={connecting} onOpenChange={(v) => !v && setConnecting(null)} />
    </div>
  );
}

function Section({
  label,
  count,
  tone,
  empty,
  children,
}: {
  label: string;
  count: number;
  tone?: "amber";
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.1em]",
            tone === "amber" ? "text-om-amber" : "text-om-faint",
          )}
        >
          {label}
        </span>
        <span className="rounded-full bg-white/[0.06] px-1.5 py-px font-mono text-[9.5px] text-om-muted">
          {count}
        </span>
      </div>
      {empty ? (
        <div className="rounded-xl border border-dashed border-om-border bg-white/[0.01] px-4 py-6 text-center text-[11.5px] text-om-muted">
          {empty}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      )}
    </div>
  );
}

function ConnectedCard({
  platformId,
  conn,
  onDisconnect,
  busy,
}: {
  platformId: string;
  conn: SocialConnection;
  onDisconnect: () => void;
  busy: boolean;
}) {
  const p = findPlatform(platformId)!;
  return (
    <div className="relative overflow-hidden rounded-xl border border-om-green/40 bg-om-green/[0.05] px-3.5 py-3">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-om-green" />
      <div className="flex items-start gap-2.5">
        {conn.avatar_url ? (
          <img src={conn.avatar_url} alt="" className="size-9 shrink-0 rounded-lg object-cover ring-1 ring-om-green/40" />
        ) : (
          <PlatformGlyph platform={p} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            {p.name}
            <span className="flex items-center gap-0.5 rounded-full bg-om-green/15 px-1.5 py-px text-[9px] font-medium text-om-green">
              <span className="size-1 rounded-full bg-om-green" /> Connected
            </span>
          </div>
          <div className="truncate text-[10.5px] text-om-muted">
            {conn.display_name || conn.handle || p.handle}
          </div>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md border border-om-green/15 bg-om-green/[0.04] py-1.5">
          <div className="font-mono text-[12px] font-bold" style={{ color: p.color }}>
            {compact(conn.followers ?? 0)}
          </div>
          <div className="text-[9px] text-om-muted">followers</div>
        </div>
        <div className="rounded-md border border-om-green/15 bg-om-green/[0.04] py-1.5">
          <div className="font-mono text-[12px] font-bold text-om-dim">
            {conn.last_synced_at ? relativeTime(conn.last_synced_at) : "—"}
          </div>
          <div className="text-[9px] text-om-muted">synced</div>
        </div>
      </div>

      <OmButton variant="outline" size="sm" className="mt-2.5 w-full" onClick={onDisconnect} disabled={busy}>
        <Unplug /> Disconnect
      </OmButton>
    </div>
  );
}

function ReconnectCard({
  platformId,
  conn,
  onReconnect,
}: {
  platformId: string;
  conn: SocialConnection;
  onReconnect: () => void;
}) {
  const p = findPlatform(platformId)!;
  return (
    <div className="relative overflow-hidden rounded-xl border border-om-amber/40 bg-om-amber/[0.05] px-3.5 py-3">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-om-amber" />
      <div className="flex items-start gap-2.5">
        <PlatformGlyph platform={p} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            {p.name}
            <span className="flex items-center gap-0.5 text-[9px] font-medium text-om-amber">
              <TriangleAlert className="size-3" /> Expired
            </span>
          </div>
          <div className="truncate text-[10.5px] text-om-muted">
            {conn.last_error || "Access needs to be renewed"}
          </div>
        </div>
      </div>
      <OmButton variant="solid" size="sm" className="mt-2.5 w-full" onClick={onReconnect}>
        <ExternalLink /> Reconnect
      </OmButton>
    </div>
  );
}

function AvailableCard({
  platformId,
  onConnect,
  disabled,
}: {
  platformId: string;
  onConnect: () => void;
  disabled: boolean;
}) {
  const p = findPlatform(platformId)!;
  return (
    <div className="rounded-xl border border-om-border bg-om-card/40 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <PlatformGlyph platform={p} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            {p.name}
            <span className="flex items-center gap-0.5 text-[9px] text-om-muted">
              <Circle className="size-2 fill-om-faint text-om-faint" /> Not connected
            </span>
          </div>
          <div className="truncate text-[10.5px] text-om-faint">{p.limit}</div>
        </div>
      </div>
      <OmButton variant="solid" size="sm" className="mt-2.5 w-full" onClick={onConnect} disabled={disabled}>
        <Plug /> Connect
      </OmButton>
    </div>
  );
}
