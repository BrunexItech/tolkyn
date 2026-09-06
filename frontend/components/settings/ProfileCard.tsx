"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, UserRound } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput, OmSelect } from "@/components/om/primitives/Field";
import { useMe, useUpdateProfile } from "./hooks";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "sw", label: "Kiswahili" },
  { value: "fr", label: "Français" },
];

function timezones(): string[] {
  try {
    // Supported in every modern browser; fall back to a small list otherwise.
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (fn) return fn("timeZone");
  } catch {
    /* ignore */
  }
  return ["UTC", "Africa/Nairobi", "Africa/Lagos", "Europe/London", "America/New_York"];
}

export function ProfileCard() {
  const { data: me, isLoading } = useMe();
  const save = useUpdateProfile();
  const tzList = useMemo(timezones, []);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    position: "",
    location: "",
    website: "",
    timezone: "UTC",
    language: "en",
  });

  useEffect(() => {
    if (!me) return;
    setForm({
      name: me.name ?? "",
      phone: me.phone ?? "",
      position: me.position ?? "",
      location: me.location ?? "",
      website: me.website ?? "",
      timezone: me.timezone ?? "UTC",
      language: me.language ?? "en",
    });
  }, [me]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const dirty =
    !!me &&
    (form.name !== (me.name ?? "") ||
      form.phone !== (me.phone ?? "") ||
      form.position !== (me.position ?? "") ||
      form.location !== (me.location ?? "") ||
      form.website !== (me.website ?? "") ||
      form.timezone !== (me.timezone ?? "UTC") ||
      form.language !== (me.language ?? "en"));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    save.mutate({
      name: form.name.trim(),
      phone: form.phone.trim(),
      position: form.position.trim(),
      location: form.location.trim(),
      website: form.website.trim(),
      timezone: form.timezone,
      language: form.language,
    });
  };

  return (
    <Card>
      <CardTitle icon={<UserRound />}>Your profile</CardTitle>

      {isLoading || !me ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-om-muted">
          <Loader2 className="size-4 animate-spin" /> Loading your details…
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2">
          <Field label="Full name">
            <OmInput value={form.name} onChange={set("name")} required autoComplete="name" />
          </Field>

          <Field label="Email" hint="Contact support to change the email on your account.">
            <OmInput value={me.email} disabled />
          </Field>

          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Phone">
              <OmInput value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="+254…" />
            </Field>
            <Field label="Job title">
              <OmInput value={form.position} onChange={set("position")} placeholder="Marketing lead" />
            </Field>
            <Field label="Location">
              <OmInput value={form.location} onChange={set("location")} placeholder="Nairobi, KE" />
            </Field>
            <Field label="Website">
              <OmInput
                value={form.website}
                onChange={set("website")}
                type="url"
                placeholder="https://…"
              />
            </Field>
            <Field label="Timezone">
              <OmSelect value={form.timezone} onChange={set("timezone")}>
                {tzList.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </OmSelect>
            </Field>
            <Field label="Language">
              <OmSelect value={form.language} onChange={set("language")}>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </OmSelect>
            </Field>
          </div>

          <OmButton
            type="submit"
            variant="solid"
            size="sm"
            className="mt-1"
            disabled={!dirty || save.isPending || !form.name.trim()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save changes
          </OmButton>
        </form>
      )}
    </Card>
  );
}
