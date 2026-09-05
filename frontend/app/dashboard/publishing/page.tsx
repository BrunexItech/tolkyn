"use client";

import { PenSquare } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { ChannelSelector } from "@/components/composer/ChannelSelector";
import { ComposerEditor } from "@/components/composer/ComposerEditor";
import { PreflightChecks } from "@/components/composer/PreflightChecks";
import { PreviewPane } from "@/components/composer/PreviewPane";
import { ScheduleBar } from "@/components/composer/ScheduleBar";
import { useComposerDraft } from "@/components/composer/useComposerDraft";

export default function ComposerPage() {
  const draft = useComposerDraft();

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Composer"
        subtitle="Pick your channels, write once, run pre-flight checks, then schedule or publish"
        icon={<PenSquare />}
      />

      <ChannelSelector
        selected={draft.form.platforms}
        onChange={(platforms) => draft.patch({ platforms })}
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_400px]">
        <div className="space-y-3">
          <ComposerEditor
            form={draft.form}
            patch={draft.patch}
            saving={draft.saving}
            saved={!!draft.postId && !draft.saving}
          />
          <PreflightChecks checks={draft.checks} />
        </div>
        <PreviewPane form={draft.form} />
      </div>

      <ScheduleBar draft={draft} />
    </div>
  );
}
