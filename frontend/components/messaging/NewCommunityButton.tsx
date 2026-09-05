"use client";

import { useState } from "react";
import { Users2 } from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import { CampaignGroupCreateModal } from "./CampaignGroupCreateModal";

const WA_GREEN = "#25D366";

export function NewCommunityButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <OmButton
        variant="solid"
        size="sm"
        onClick={() => setOpen(true)}
        style={{ background: WA_GREEN, color: "#04140c" }}
      >
        <Users2 /> New community
      </OmButton>
      <CampaignGroupCreateModal open={open} onOpenChange={setOpen} />
    </>
  );
}
