"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquareText, Save } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmTextarea } from "@/components/om/primitives/Field";
import { useMe, useUpdateProfile } from "./hooks";

const MAX_LEN = 300;

export function SmsDisclaimerCard() {
  const { data: me, isLoading } = useMe();
  const save = useUpdateProfile();

  const [text, setText] = useState("");

  useEffect(() => {
    if (!me) return;
    setText(me.sms_disclaimer ?? "");
  }, [me]);

  const dirty = !!me && text !== (me.sms_disclaimer ?? "");

  // Suggested default, built from the phone number already on file -- shown
  // as a placeholder only. It's never saved unless the user actually accepts
  // it (via "Use suggestion") or types their own text and hits Save.
  const suggestion = me?.phone
    ? `Reply STOP to opt out. Contact us: ${me.phone}`
    : "Reply STOP to opt out.";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({ sms_disclaimer: text.trim() });
  };

  return (
    <Card>
      <CardTitle icon={<MessageSquareText />}>Bulk SMS disclaimer</CardTitle>

      {isLoading || !me ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-om-muted">
          <Loader2 className="size-4 animate-spin" /> Loading your details…
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2">
          <Field
            label="Disclaimer text"
            hint="Appended to every Bulk SMS you send from this account. Leave blank to send with no disclaimer."
          >
            <OmTextarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              placeholder={suggestion}
              maxLength={MAX_LEN}
            />
          </Field>

          <div className="mb-2.5 flex items-center justify-between text-[10.5px] text-om-muted">
            {!text && (
              <button
                type="button"
                onClick={() => setText(suggestion)}
                className="font-medium text-om-blue hover:underline"
              >
                Use suggestion
              </button>
            )}
            <span className="ml-auto tabular-nums">{text.length}/{MAX_LEN}</span>
          </div>

          <OmButton
            type="submit"
            variant="solid"
            size="sm"
            className="mt-1"
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save changes
          </OmButton>
        </form>
      )}
    </Card>
  );
}
