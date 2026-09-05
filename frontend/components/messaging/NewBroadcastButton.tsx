"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { OmButton } from "@/components/om/primitives/OmButton";
import { BroadcastComposer } from "./BroadcastComposer";
import type { BroadcastChannel } from "@/lib/api/messaging";

export function NewBroadcastButton({
  channel,
  accent,
  fg = "#04140c",
}: {
  channel: BroadcastChannel;
  accent: string;
  fg?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = channel === "sms" ? "SMS" : "WhatsApp";

  return (
    <>
      <OmButton variant="solid" size="sm" onClick={() => setOpen(true)} style={{ background: accent, color: fg }}>
        <Megaphone /> New broadcast
      </OmButton>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`New ${label} broadcast`}
        description="Pick recipients, write your message, then send now or save as a draft."
        className="w-[min(94vw,640px)]"
      >
        <BroadcastComposer
          channel={channel}
          accent={accent}
          fg={fg}
          bare
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
