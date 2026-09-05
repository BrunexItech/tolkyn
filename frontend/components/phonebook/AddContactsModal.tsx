"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { OmButton } from "@/components/om/primitives/OmButton";
import { RecipientPicker } from "@/components/messaging/RecipientPicker";
import type { BroadcastRecipient } from "@/lib/api/messaging";
import { useAddPhoneBookContacts } from "./hooks";

export function AddContactsModal({
  bookId,
  bookName,
  accent = "#4f7aff",
  open,
  onOpenChange,
}: {
  bookId: string;
  bookName: string;
  accent?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [picked, setPicked] = useState<BroadcastRecipient[]>([]);
  const add = useAddPhoneBookContacts();

  const close = (v: boolean) => {
    if (!v) setPicked([]);
    onOpenChange(v);
  };

  const submit = async () => {
    if (picked.length === 0) return;
    await add.mutateAsync({ id: bookId, contacts: picked });
    close(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={`Add numbers to ${bookName}`}
      description="From leads or customers, a CSV upload, or pasted numbers. Duplicates in this book are skipped automatically."
      className="w-[min(94vw,620px)]"
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => close(false)}>
            Cancel
          </OmButton>
          <OmButton
            variant="solid"
            size="md"
            onClick={submit}
            disabled={add.isPending || picked.length === 0}
          >
            {add.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Add {picked.length || 0}
          </OmButton>
        </>
      }
    >
      <RecipientPicker value={picked} onChange={setPicked} accent={accent} showPhoneBook={false} />
    </Modal>
  );
}
