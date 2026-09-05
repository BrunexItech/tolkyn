"use client";

import { useState } from "react";
import { Loader2, Users2 } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { RecipientPicker } from "./RecipientPicker";
import { useCreateCampaignGroup } from "./hooks";
import type { BroadcastRecipient } from "@/lib/api/messaging";
import { toast } from "@/lib/om/toast";

const WA_GREEN = "#25D366";

/** Create a "community" campaign group — a shared conversation relayed
 * entirely in our own code (see backend CampaignGroupService) so that no
 * participant's real number is ever exposed to another. */
export function CampaignGroupCreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const create = useCreateCampaignGroup();

  const reset = () => {
    setName("");
    setMessage("");
    setRecipients([]);
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const onCreate = async () => {
    if (!name.trim()) return toast.err("Give the community a name");
    if (recipients.length < 1) return toast.err("Add at least one participant");
    await create.mutateAsync({
      name: name.trim(),
      recipients: recipients.map((r) => ({ phone: r.phone, name: r.name })),
      initial_message: message.trim() || undefined,
    });
    close(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="New community"
      description="Everyone can reply — they'll only ever see each other under a pseudo-name."
      className="w-[min(94vw,620px)]"
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => close(false)}>
            Cancel
          </OmButton>
          <OmButton
            variant="solid"
            size="md"
            onClick={onCreate}
            disabled={create.isPending}
            style={{ background: WA_GREEN, color: "#04140c" }}
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : <Users2 />}
            Create community
          </OmButton>
        </>
      }
    >
      <Field label="Name">
        <OmInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VIP customers, Nairobi launch group…"
        />
      </Field>

      <Field label="Opening message (optional)" hint="Sent to every participant individually the moment the community is created.">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Welcome! Reply here anytime — everyone in this group can see your messages under a nickname, never your number."
          className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] leading-relaxed text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
        />
      </Field>

      <RecipientPicker value={recipients} onChange={setRecipients} accent={WA_GREEN} />
    </Modal>
  );
}
