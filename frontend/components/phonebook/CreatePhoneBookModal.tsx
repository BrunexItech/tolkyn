"use client";

import { useState } from "react";
import { Loader2, BookUser } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { useCreatePhoneBook } from "./hooks";
import { toast } from "@/lib/om/toast";
import { cn } from "@/lib/utils";

const SWATCHES = ["#f5b642", "#4f7aff", "#22c55e", "#8b7bf0", "#f0524b", "#22d3ee", "#e1306c"];

export function CreatePhoneBookModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(SWATCHES[0]);
  const create = useCreatePhoneBook();

  const close = (v: boolean) => {
    if (!v) {
      setName("");
      setDescription("");
      setColor(SWATCHES[0]);
    }
    onOpenChange(v);
  };

  const submit = async () => {
    if (!name.trim()) return toast.err("Give the phone book a name");
    await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined, color });
    close(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="New phone book"
      description="A category of numbers — e.g. VIP, Traders, Wholesale."
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => close(false)}>
            Cancel
          </OmButton>
          <OmButton variant="solid" size="md" onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <BookUser />}
            Create
          </OmButton>
        </>
      }
    >
      <Field label="Category name">
        <OmInput value={name} onChange={(e) => setName(e.target.value)} placeholder="VIP" autoFocus />
      </Field>
      <Field label="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Top customers who get first access to offers"
          className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] leading-relaxed text-om-text outline-none placeholder:text-om-muted focus:border-om-blue/60"
        />
      </Field>
      <Field label="Colour">
        <div className="flex gap-2">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                "size-6 rounded-full border-2 transition-transform",
                color === c ? "scale-110 border-white/80" : "border-transparent",
              )}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      </Field>
    </Modal>
  );
}
