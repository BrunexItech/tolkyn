"use client";

import { Newspaper } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { MediaIntelView } from "@/components/media-intel/MediaIntelView";

export default function MediaIntelligencePage() {
  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Media Intelligence"
        subtitle="Live coverage on any topic, competitor or trend — synthesised into a brief"
        icon={<Newspaper />}
      />
      <MediaIntelView />
    </div>
  );
}
