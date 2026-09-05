"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Phone, ChevronRight, Save, RotateCcw } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput, OmSelect, OmTextarea } from "@/components/om/primitives/Field";
import { StatusBadge } from "@/components/om/primitives/StatusBadge";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import type { IvrAction, IvrFlow, IvrMenu, IvrOption } from "@/lib/api/callcenter";
import { useCallAgents } from "./ivr-hooks";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "*", "#"];
const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];
const ACTION_LABEL: Record<IvrAction, string> = {
  ring_all: "Ring all agents",
  ring_agent: "Ring one agent",
  submenu: "Go to a sub-menu",
  voicemail: "Send to voicemail",
  message: "Play a message, then hang up",
  transfer: "Transfer to a phone number",
  hangup: "Hang up",
  repeat: "Repeat this menu",
};
const TZ = [
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Europe/London",
  "America/New_York",
  "Asia/Dubai",
];

export function IvrBuilder({
  flow,
  saving,
  onSave,
  onDirtyChange,
}: {
  flow: IvrFlow;
  saving: boolean;
  onSave: (f: IvrFlow) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { data: agents } = useCallAgents();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState<IvrFlow>(flow);

  useEffect(() => setDraft(flow), [flow]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(flow), [draft, flow]);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const set = <K extends keyof IvrFlow>(k: K, v: IvrFlow[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const menuKeys = Object.keys(draft.menus);
  const setMenu = (key: string, menu: IvrMenu) =>
    setDraft((d) => ({ ...d, menus: { ...d.menus, [key]: menu } }));

  const addSubmenu = () => {
    let n = 1;
    while (draft.menus[`menu${n}`]) n += 1;
    const key = `menu${n}`;
    setDraft((d) => ({
      ...d,
      menus: { ...d.menus, [key]: { prompt: "", options: [{ digit: "1", label: "", action: "ring_all", target: "" }] } },
    }));
  };

  const removeSubmenu = async (key: string) => {
    const usedBy = menuKeys.filter((mk) =>
      draft.menus[mk].options.some((o) => o.action === "submenu" && o.target === key),
    );
    const ok = await confirm({
      title: `Delete "${key}"?`,
      message: usedBy.length
        ? `Options in ${usedBy.join(", ")} point to this menu and will need fixing.`
        : "This sub-menu will be removed.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setDraft((d) => {
      const menus = { ...d.menus };
      delete menus[key];
      return { ...d, menus };
    });
  };

  return (
    <div className="space-y-3">
      {/* master switch */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            Auto-attendant / IVR
            <StatusBadge tone={draft.is_active ? "green" : "muted"}>
              {draft.is_active ? "On" : "Off"}
            </StatusBadge>
          </div>
          <p className="mt-0.5 text-[11px] text-om-muted">
            When on, inbound callers hear your menu first. When off, every call rings all agents directly.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
            className="size-4"
          />
          Enable the phone menu
        </label>
      </Card>

      <Card className="flex flex-col gap-2">
        <CardTitle icon={<Phone />}>Greeting</CardTitle>
        <Field hint="Played once when the call connects, before the main menu.">
          <OmTextarea
            value={draft.greeting}
            onChange={(e) => set("greeting", e.target.value)}
            placeholder="Thanks for calling Acme Traders."
          />
        </Field>
      </Card>

      {menuKeys.map((key) => (
        <MenuEditor
          key={key}
          menuKey={key}
          menu={draft.menus[key]}
          isMain={key === "main"}
          allMenuKeys={menuKeys}
          agents={(agents ?? []).map((a) => ({ id: a.id, name: a.name }))}
          onChange={(m) => setMenu(key, m)}
          onDelete={() => removeSubmenu(key)}
        />
      ))}

      <OmButton variant="outline" size="sm" onClick={addSubmenu}>
        <Plus /> Add a sub-menu
      </OmButton>

      {/* fallbacks */}
      <Card className="flex flex-col gap-2">
        <CardTitle>If the caller gets stuck</CardTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="“Not a valid option” message">
            <OmInput value={draft.invalid_message} onChange={(e) => set("invalid_message", e.target.value)} />
          </Field>
          <Field label="“We didn't catch that” message">
            <OmInput value={draft.timeout_message} onChange={(e) => set("timeout_message", e.target.value)} />
          </Field>
          <Field label="Seconds to wait for a key">
            <OmInput
              type="number"
              min={3}
              max={30}
              value={draft.timeout_seconds}
              onChange={(e) => set("timeout_seconds", Number(e.target.value))}
            />
          </Field>
          <Field label="Retries before giving up">
            <OmInput
              type="number"
              min={0}
              max={5}
              value={draft.max_retries}
              onChange={(e) => set("max_retries", Number(e.target.value))}
            />
          </Field>
          <Field label="Then…" className="sm:col-span-2">
            <OmSelect
              value={draft.on_exhausted}
              onChange={(e) => set("on_exhausted", e.target.value as IvrFlow["on_exhausted"])}
            >
              <option value="ring_all">Ring all agents</option>
              <option value="voicemail">Send to voicemail</option>
              <option value="hangup">Hang up</option>
            </OmSelect>
          </Field>
        </div>
      </Card>

      {/* business hours */}
      <Card className="flex flex-col gap-2">
        <CardTitle
          action={
            <label className="flex items-center gap-1.5 text-[11px] font-medium">
              <input
                type="checkbox"
                checked={draft.hours_enabled}
                onChange={(e) => set("hours_enabled", e.target.checked)}
              />
              Enforce
            </label>
          }
        >
          Business hours
        </CardTitle>
        {draft.hours_enabled && (
          <div className="flex flex-col gap-2">
            <Field label="Timezone">
              <OmSelect value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {TZ.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </OmSelect>
            </Field>
            <div className="flex flex-col gap-1.5">
              {DAYS.map((d) => (
                <HoursRow
                  key={d.key}
                  label={d.label}
                  windows={draft.hours[d.key] ?? []}
                  onChange={(w) =>
                    setDraft((prev) => ({ ...prev, hours: { ...prev.hours, [d.key]: w } }))
                  }
                />
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Outside hours, callers get">
                <OmSelect
                  value={draft.after_hours_action}
                  onChange={(e) =>
                    set("after_hours_action", e.target.value as IvrFlow["after_hours_action"])
                  }
                >
                  <option value="voicemail">Voicemail</option>
                  <option value="message">A message, then hang up</option>
                  <option value="ring_all">Ring all agents anyway</option>
                  <option value="hangup">Hang up</option>
                </OmSelect>
              </Field>
              <Field label="After-hours message">
                <OmInput
                  value={draft.after_hours_message}
                  onChange={(e) => set("after_hours_message", e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
      </Card>

      <div className="sticky bottom-2 z-10 flex items-center justify-end gap-2 rounded-xl border border-om-border bg-om-card/90 p-2 backdrop-blur">
        {dirty && <span className="mr-auto text-[11px] text-om-amber">Unsaved changes</span>}
        <OmButton variant="ghost" size="sm" onClick={() => setDraft(flow)} disabled={!dirty || saving}>
          <RotateCcw /> Revert
        </OmButton>
        <OmButton variant="solid" size="sm" onClick={() => onSave(draft)} disabled={saving}>
          <Save /> {saving ? "Saving…" : "Save call flow"}
        </OmButton>
      </div>
      {dialog}
    </div>
  );
}

function MenuEditor({
  menuKey,
  menu,
  isMain,
  allMenuKeys,
  agents,
  onChange,
  onDelete,
}: {
  menuKey: string;
  menu: IvrMenu;
  isMain: boolean;
  allMenuKeys: string[];
  agents: { id: string; name: string }[];
  onChange: (m: IvrMenu) => void;
  onDelete: () => void;
}) {
  const usedDigits = menu.options.map((o) => o.digit);
  const setOption = (i: number, opt: IvrOption) =>
    onChange({ ...menu, options: menu.options.map((o, idx) => (idx === i ? opt : o)) });
  const addOption = () => {
    const next = DIGITS.find((d) => !usedDigits.includes(d)) ?? "1";
    onChange({ ...menu, options: [...menu.options, { digit: next, label: "", action: "ring_all", target: "" }] });
  };
  const removeOption = (i: number) =>
    onChange({ ...menu, options: menu.options.filter((_, idx) => idx !== i) });

  return (
    <Card className="flex flex-col gap-2">
      <CardTitle
        icon={<ChevronRight />}
        action={
          !isMain && (
            <button
              onClick={onDelete}
              className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
            >
              <Trash2 className="size-3" />
            </button>
          )
        }
      >
        {isMain ? "Main menu" : `Sub-menu · ${menuKey}`}
      </CardTitle>

      <Field label="What the caller hears" hint="e.g. “Press 1 for sales, 2 for support, 9 to leave a message.”">
        <OmTextarea value={menu.prompt} onChange={(e) => onChange({ ...menu, prompt: e.target.value })} />
      </Field>

      <div className="flex flex-col gap-2">
        {menu.options.map((opt, i) => (
          <div key={i} className="rounded-lg border border-om-border bg-om-bg/40 p-2">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Key" className="mb-0 w-16 shrink-0">
                <OmSelect
                  value={opt.digit}
                  onChange={(e) => setOption(i, { ...opt, digit: e.target.value })}
                >
                  {DIGITS.map((d) => (
                    <option key={d} value={d} disabled={d !== opt.digit && usedDigits.includes(d)}>
                      {d}
                    </option>
                  ))}
                </OmSelect>
              </Field>
              <Field label="Label" className="mb-0 min-w-[120px] flex-1">
                <OmInput
                  value={opt.label}
                  onChange={(e) => setOption(i, { ...opt, label: e.target.value })}
                  placeholder="Sales"
                />
              </Field>
              <Field label="Does" className="mb-0 min-w-[160px] flex-1">
                <OmSelect
                  value={opt.action}
                  onChange={(e) =>
                    setOption(i, { ...opt, action: e.target.value as IvrAction, target: "" })
                  }
                >
                  {(Object.keys(ACTION_LABEL) as IvrAction[])
                    .filter((a) => a !== "submenu" || allMenuKeys.length > 1 || true)
                    .map((a) => (
                      <option key={a} value={a}>
                        {ACTION_LABEL[a]}
                      </option>
                    ))}
                </OmSelect>
              </Field>
              <button
                onClick={() => removeOption(i)}
                className="mb-1 grid size-7 shrink-0 place-items-center rounded-md text-om-muted hover:bg-om-red/10 hover:text-om-red"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {opt.action === "ring_agent" && (
              <Field label="Which agent" className="mb-0 mt-2">
                <OmSelect
                  value={opt.target}
                  onChange={(e) => setOption(i, { ...opt, target: e.target.value })}
                >
                  <option value="">Select an agent…</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </OmSelect>
              </Field>
            )}
            {opt.action === "submenu" && (
              <Field label="Which sub-menu" className="mb-0 mt-2">
                <OmSelect
                  value={opt.target}
                  onChange={(e) => setOption(i, { ...opt, target: e.target.value })}
                >
                  <option value="">Select a sub-menu…</option>
                  {allMenuKeys
                    .filter((k) => k !== menuKey && k !== "main")
                    .map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                </OmSelect>
              </Field>
            )}
            {opt.action === "transfer" && (
              <Field label="Phone number (E.164)" className="mb-0 mt-2">
                <OmInput
                  value={opt.target}
                  onChange={(e) => setOption(i, { ...opt, target: e.target.value })}
                  placeholder="+254712345678"
                />
              </Field>
            )}
            {opt.action === "message" && (
              <Field label="Message to read out" className="mb-0 mt-2">
                <OmTextarea
                  value={opt.target}
                  onChange={(e) => setOption(i, { ...opt, target: e.target.value })}
                  placeholder="Our office is closed for the public holiday."
                />
              </Field>
            )}
          </div>
        ))}
      </div>

      <OmButton variant="ghost" size="sm" onClick={addOption} disabled={menu.options.length >= DIGITS.length}>
        <Plus /> Add an option
      </OmButton>
    </Card>
  );
}

function HoursRow({
  label,
  windows,
  onChange,
}: {
  label: string;
  windows: string[][];
  onChange: (w: string[][]) => void;
}) {
  const open = windows.length > 0;
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <label className="flex w-20 items-center gap-1.5">
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => onChange(e.target.checked ? [["09:00", "17:00"]] : [])}
        />
        {label}
      </label>
      {open ? (
        <div className="flex items-center gap-1.5">
          <OmInput
            type="time"
            value={windows[0]?.[0] ?? "09:00"}
            onChange={(e) => onChange([[e.target.value, windows[0]?.[1] ?? "17:00"]])}
            className="h-8 w-28"
          />
          <span className="text-om-muted">to</span>
          <OmInput
            type="time"
            value={windows[0]?.[1] ?? "17:00"}
            onChange={(e) => onChange([[windows[0]?.[0] ?? "09:00", e.target.value]])}
            className="h-8 w-28"
          />
        </div>
      ) : (
        <span className="text-om-muted">Closed</span>
      )}
    </div>
  );
}
