"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Card } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { Field, OmSelect } from "@/components/om/primitives/Field";
import { toast } from "@/lib/om/toast";
import { useApprovedUsers } from "@/components/admin/hooks";
import {
  useAdminIvr,
  useAdminIvrAgents,
  useAdminIvrCalls,
  useAdminSaveIvr,
} from "@/components/admin/ivr-hooks";
import { adminApi } from "@/lib/api/admin";
import { IvrBuilder } from "@/components/call-center/IvrBuilder";
import { IvrTester } from "@/components/call-center/IvrTester";
import { IvrLiveTest } from "@/components/call-center/IvrLiveTest";
import type { IvrFlow } from "@/lib/api/callcenter";

export default function AdminIvrPage() {
  const { data: users, isLoading: usersLoading } = useApprovedUsers();
  const [workspaceId, setWorkspaceId] = useState<string>("");

  // Same pairing as the Telephony page — a workspace's owner id is its
  // workspace_id.
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
        title="Call flow / IVR"
        subtitle="Built here, not by the client — capture what they want their callers to hear and where each key sends them, then test it end to end before it goes live."
        icon={<GitBranch />}
      />

      <Card className="flex flex-col gap-2">
        <Field label="Workspace" hint="Approved account whose inbound call menu this configures.">
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
        <IvrWorkspacePanel key={workspaceId} workspaceId={workspaceId} />
      ) : (
        <EmptyState icon={<GitBranch />} title="Pick a workspace to build its call flow" />
      )}
    </div>
  );
}

function IvrWorkspacePanel({ workspaceId }: { workspaceId: string }) {
  const { data: flow, isLoading } = useAdminIvr(workspaceId);
  const { data: agents } = useAdminIvrAgents(workspaceId);
  const save = useAdminSaveIvr(workspaceId);
  const { data: ivrCalls, refetch: refetchCalls } = useAdminIvrCalls(workspaceId);
  const [dirty, setDirty] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);

  const onTest = (digits: string[]) => adminApi.testIvr(workspaceId, digits);

  const onStart = async () => {
    setLiveBusy(true);
    try {
      await adminApi.simulateIvrCall(workspaceId);
      await refetchCalls();
      toast.ok("Test call placed — it's in the menu now");
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "Failed");
    } finally {
      setLiveBusy(false);
    }
  };

  const onPress = async (callId: string, digit: string) => {
    setLiveBusy(true);
    try {
      await adminApi.ivrPress(workspaceId, callId, digit);
      await refetchCalls();
    } catch (e) {
      toast.err(e instanceof Error ? e.message : "Failed");
    } finally {
      setLiveBusy(false);
    }
  };

  if (isLoading || !flow) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-[12px] text-om-muted">
          <Loader2 className="size-3.5 animate-spin" /> Loading call flow…
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
      <IvrBuilder
        flow={flow}
        agents={(agents ?? []).map((a) => ({ id: a.id, name: a.name }))}
        saving={save.isPending}
        onSave={(f: IvrFlow) => save.mutate(f)}
        onDirtyChange={setDirty}
      />
      <div className="space-y-3 lg:sticky lg:top-3 lg:self-start">
        <IvrTester dirty={dirty} onTest={onTest} />
        <IvrLiveTest ivrCalls={ivrCalls ?? []} busy={liveBusy} onStart={onStart} onPress={onPress} />
      </div>
    </div>
  );
}
