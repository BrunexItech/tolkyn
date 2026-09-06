"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone, Copy, Check, Loader2, RefreshCw } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { OmButton } from "@/components/om/primitives/OmButton";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { Field, OmInput, OmSelect } from "@/components/om/primitives/Field";
import { toast } from "@/lib/om/toast";
import { useApprovedUsers, useTelephony, useUpdateTelephony } from "@/components/admin/hooks";
import type { TelephonyConfig, TelephonyConfigInput } from "@/lib/api/admin";

export default function AdminTelephonyPage() {
  const { data: users, isLoading: usersLoading } = useApprovedUsers();
  const [workspaceId, setWorkspaceId] = useState<string>("");

  // Telephony config is keyed by workspace_id, which is the owner's own user id.
  // Owners have workspace_id === id; older accounts may have it null.
  const options = useMemo(
    () =>
      (users?.items ?? [])
        .filter((u) => !u.workspace_id || u.workspace_id === u.id)
        .map((u) => ({ id: u.id, label: `${u.name} · ${u.email}` })),
    [users],
  );

  useEffect(() => {
    if (!workspaceId && options.length) setWorkspaceId(options[0].id);
  }, [options, workspaceId]);

  return (
    <div className="space-y-3">
      <SectionHeading
        title="Telephony / SIP trunk"
        subtitle="Wire a workspace's Call Center to a real PBX (CloudOne / Yeastar P-Series). Everything is per-workspace — no code changes to onboard a new client."
        icon={<Phone />}
      />

      <Card className="flex flex-col gap-2">
        <Field label="Workspace" hint="Approved account whose Call Center these settings apply to.">
          {usersLoading ? (
            <div className="flex items-center gap-2 text-[12px] text-om-muted">
              <Loader2 className="size-3.5 animate-spin" /> Loading accounts…
            </div>
          ) : (
            <OmSelect value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
              <option value="">Select a workspace…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </OmSelect>
          )}
        </Field>
      </Card>

      {workspaceId ? (
        <TelephonyForm key={workspaceId} workspaceId={workspaceId} />
      ) : (
        <EmptyState icon={<Phone />} title="Pick a workspace to configure its trunk" />
      )}
    </div>
  );
}

function TelephonyForm({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useTelephony(workspaceId);
  const save = useUpdateTelephony(workspaceId);
  const [form, setForm] = useState<TelephonyConfigInput>({});
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      provider: data.provider,
      is_active: data.is_active,
      pbx_base_url: data.pbx_base_url ?? "",
      api_client_id: data.api_client_id ?? "",
      sip_domain: data.sip_domain ?? "",
      sip_ws_url: data.sip_ws_url ?? "",
      outbound_caller_id: data.outbound_caller_id ?? "",
      record_calls: data.record_calls,
    });
    setSecret("");
  }, [data]);

  const set = <K extends keyof TelephonyConfigInput>(k: K, v: TelephonyConfigInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSave = () => {
    const body: TelephonyConfigInput = { ...form };
    if (secret.trim()) body.api_client_secret = secret.trim();
    save.mutate(body, { onSuccess: () => setSecret("") });
  };

  const copyWebhook = async () => {
    if (!data?.webhook_url) return;
    try {
      await navigator.clipboard.writeText(data.webhook_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.err("Could not copy — select the URL manually");
    }
  };

  if (isLoading || !data) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-[12px] text-om-muted">
          <Loader2 className="size-3.5 animate-spin" /> Loading configuration…
        </div>
      </Card>
    );
  }

  const isCloudOne = form.provider === "cloudone";

  return (
    <div className="space-y-3">
      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[13px] font-semibold">Provider</div>
          <StatusBadge tone={data.is_active && data.provider !== "simulated" ? "green" : "muted"}>
            {data.is_active && data.provider !== "simulated" ? "Live" : "Simulated"}
          </StatusBadge>
        </div>

        <Field label="Voice provider">
          <OmSelect
            value={form.provider ?? "simulated"}
            onChange={(e) => set("provider", e.target.value)}
          >
            <option value="simulated">Simulated — demo calls, no real audio</option>
            <option value="cloudone">CloudOne / Yeastar P-Series (SIP trunk)</option>
          </OmSelect>
        </Field>

        <label className="flex items-center gap-2 text-[12px] text-om-text">
          <input
            type="checkbox"
            checked={!!form.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
          />
          Active — route this workspace&apos;s calls through the provider above
        </label>

        <label className="flex items-center gap-2 text-[12px] text-om-text">
          <input
            type="checkbox"
            checked={form.record_calls ?? true}
            onChange={(e) => set("record_calls", e.target.checked)}
          />
          Record calls
        </label>

        <Field label="Outbound caller ID" hint="E.164 number shown to the person being called (optional).">
          <OmInput
            value={form.outbound_caller_id ?? ""}
            onChange={(e) => set("outbound_caller_id", e.target.value)}
            placeholder="+254207901234"
          />
        </Field>
      </Card>

      {isCloudOne && (
        <>
          <Card className="flex flex-col gap-2">
            <div className="text-[13px] font-semibold">CloudOne OpenAPI (server-to-server dialing)</div>
            <p className="text-[11px] text-om-muted">
              From the Yeastar P-Series console → Integrations → API. Used to place / hang up / transfer
              calls on behalf of agents.
            </p>
            <Field label="PBX base URL">
              <OmInput
                value={form.pbx_base_url ?? ""}
                onChange={(e) => set("pbx_base_url", e.target.value)}
                placeholder="https://your-pbx.ras.yeastar.com"
              />
            </Field>
            <Field label="API client ID">
              <OmInput
                value={form.api_client_id ?? ""}
                onChange={(e) => set("api_client_id", e.target.value)}
                placeholder="client id / username"
              />
            </Field>
            <Field
              label="API client secret"
              hint={
                data.api_client_secret_set
                  ? "A secret is stored. Leave blank to keep it, type a new one to replace, or type a single space then save to clear."
                  : "Not set yet."
              }
            >
              <OmInput
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={data.api_client_secret_set ? "••••••••  (stored)" : "client secret"}
                autoComplete="new-password"
              />
            </Field>
          </Card>

          <Card className="flex flex-col gap-2">
            <div className="text-[13px] font-semibold">Browser softphone (WebRTC / SIP over WSS)</div>
            <p className="text-[11px] text-om-muted">
              The Linkus WebRTC gateway. Agents also each need a SIP extension + password, assigned from
              their workspace Call Center settings.
            </p>
            <Field label="SIP WebSocket URL">
              <OmInput
                value={form.sip_ws_url ?? ""}
                onChange={(e) => set("sip_ws_url", e.target.value)}
                placeholder="wss://your-pbx.ras.yeastar.com:8089/ws"
              />
            </Field>
            <Field label="SIP domain">
              <OmInput
                value={form.sip_domain ?? ""}
                onChange={(e) => set("sip_domain", e.target.value)}
                placeholder="your-pbx.ras.yeastar.com"
              />
            </Field>
          </Card>
        </>
      )}

      <Card className="flex flex-col gap-2">
        <div className="text-[13px] font-semibold">Inbound event webhook</div>
        <p className="text-[11px] text-om-muted">
          Point the PBX&apos;s event / CDR webhook here so ringing, answered and hung-up calls show up in
          the Call Center in real time. The secret is sent as an <code>X-Webhook-Secret</code> header or{" "}
          <code>?secret=</code> query param.
        </p>
        <Field label="Webhook URL">
          <div className="flex gap-2">
            <OmInput
              readOnly
              value={data.webhook_url ?? ""}
              className="cursor-default select-all font-mono text-[11px] caret-transparent"
            />
            <OmButton variant="ghost" size="sm" onClick={copyWebhook}>
              {copied ? <Check /> : <Copy />}
            </OmButton>
          </div>
        </Field>
        <Field label="Webhook secret">
          <OmInput
            readOnly
            value={data.webhook_secret ?? "—"}
            className="cursor-default select-all font-mono text-[11px] caret-transparent"
          />
        </Field>
      </Card>

      <div className="flex justify-end">
        <OmButton variant="solid" onClick={onSave} disabled={save.isPending}>
          {save.isPending ? <RefreshCw className="animate-spin" /> : <Check />} Save settings
        </OmButton>
      </div>
    </div>
  );
}
