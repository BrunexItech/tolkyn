"use client";

import { Clapperboard } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { BrandBar } from "@/components/video/BrandBar";
import { VideoGeneratorForm } from "@/components/video/VideoGeneratorForm";
import { VideoGallery } from "@/components/video/VideoGallery";

export default function VideoPage() {
  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="AI Video"
        subtitle="Generate realistic video with native sound, powered by Google Veo 3.1"
        icon={<Clapperboard />}
      />

      <BrandBar />

      <div className="grid gap-3 lg:grid-cols-[380px_1fr] lg:items-start">
        <VideoGeneratorForm />
        <VideoGallery />
      </div>
    </div>
  );
}
