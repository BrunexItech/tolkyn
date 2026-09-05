"use client";

import Link from "next/link";
import { ArrowLeft, GitBranch, Loader2, PhoneIncoming } from "lucide-react";
import { useState } from "react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { useMyRole } from "@/components/team/hooks";
import { IvrBuilder } from "@/components/call-center/IvrBuilder";
import { IvrTester } from "@/components/call-center/IvrTester";
import { IvrLiveTest } from "@/components/call-center/IvrLiveTest";
import { useIvr, useSaveIvr } from "@/components/call-center/ivr-hooks";

export default function CallFlowPage() {
  const { data: myRole } = useMyRole();
  const { data: flow, isLoading } = useIvr();
  const save = useSaveIvr();
  const [dirty, setDirty] = useState(false);

  const canEdit = myRole?.is_owner ?? false;

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Call flow / IVR"
        subtitle="Design exactly what inbound callers hear and where each key sends them."
        icon={<GitBranch />}
        actions={
          <OmButton asChild variant="outline" size="sm">
            <Link href="/dashboard/calls">
              <ArrowLeft /> Back to Call Center
            </Link>
          </OmButton>
        }
      />

      {isLoading || !flow ? (
        <div className="flex items-center gap-2 p-6 text-[12px] text-om-muted">
          <Loader2 className="size-4 animate-spin" /> Loading call flow…
        </div>
      ) : !canEdit ? (
        <EmptyState icon={<PhoneIncoming />} title="Owner only">
          Only the workspace owner can edit the call flow. Ask them to set it up.
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <IvrBuilder
            flow={flow}
            saving={save.isPending}
            onSave={(f) => save.mutate(f)}
            onDirtyChange={setDirty}
          />
          <div className="space-y-3 lg:sticky lg:top-3 lg:self-start">
            <IvrTester dirty={dirty} />
            <IvrLiveTest />
          </div>
        </div>
      )}
    </div>
  );
}
