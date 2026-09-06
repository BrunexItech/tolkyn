"use client";

import { useState } from "react";
import { Sparkles, Type, Image as ImageIcon } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { CopyPanel } from "@/components/studio/CopyPanel";
import { ImageStudio } from "@/components/studio/ImageStudio";
import { AssetLibrary } from "@/components/studio/AssetLibrary";
import { DailyLimitPill } from "@/components/common/DailyLimitPill";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "copy", label: "Copy", icon: Type },
  { id: "image", label: "Image", icon: ImageIcon },
] as const;

export default function ContentStudioPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("copy");

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Content Studio"
        subtitle="Generate on-brand copy and images with AI"
        icon={<Sparkles />}
        actions={tab === "image" ? <DailyLimitPill kind="image" /> : undefined}
      />

      <div className="flex items-center gap-1 rounded-lg border border-om-border bg-white/[0.02] p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              tab === t.id ? "bg-white/[0.06] text-om-text" : "text-om-muted hover:text-om-dim",
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "copy" && <CopyPanel />}
      {tab === "image" && <ImageStudio />}

      <AssetLibrary kind={tab} />
    </div>
  );
}
