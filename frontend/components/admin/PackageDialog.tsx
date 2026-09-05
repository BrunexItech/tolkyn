"use client";

import { useEffect, useState } from "react";
import { Loader2, Package as PackageIcon } from "lucide-react";
import { Modal } from "@/components/om/primitives/Modal";
import { OmButton } from "@/components/om/primitives/OmButton";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/om/toast";
import { useCreatePackage, useUpdatePackage } from "./hooks";
import type { ModuleInfo, Package } from "@/lib/api/admin";

const LIMIT_KEYS: { key: string; label: string }[] = [
  { key: "seats", label: "Team seats" },
  { key: "video_budget_usd", label: "AI video budget ($)" },
  { key: "sms_monthly", label: "SMS / month" },
  { key: "call_minutes_monthly", label: "Call minutes / month" },
];

export function PackageDialog({
  pkg,
  modules,
  open,
  onOpenChange,
}: {
  pkg: Package | null; // null = create
  modules: ModuleInfo[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreatePackage();
  const update = useUpdatePackage();
  const busy = create.isPending || update.isPending;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [currency, setCurrency] = useState("KES");
  const [interval, setInterval] = useState("month");
  const [allModules, setAllModules] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(pkg?.name ?? "");
    setDescription(pkg?.description ?? "");
    setPrice(String(pkg?.price_amount ?? 0));
    setCurrency(pkg?.price_currency ?? "KES");
    setInterval(pkg?.price_interval ?? "month");
    setAllModules(pkg?.modules.includes("*") ?? false);
    setSelected(pkg?.modules.filter((m) => m !== "*") ?? []);
    setLimits(
      Object.fromEntries(
        LIMIT_KEYS.map((l) => [l.key, pkg?.limits?.[l.key] != null ? String(pkg.limits[l.key]) : ""]),
      ),
    );
    setIsDefault(pkg?.is_default ?? false);
    setIsActive(pkg?.is_active ?? true);
  }, [open, pkg]);

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const submit = async () => {
    if (!name.trim()) return toast.err("Give the package a name");
    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      price_amount: Number(price) || 0,
      price_currency: currency,
      price_interval: interval,
      modules: allModules ? ["*"] : selected,
      limits: Object.fromEntries(
        Object.entries(limits)
          .filter(([, v]) => v.trim() !== "" && !Number.isNaN(Number(v)))
          .map(([k, v]) => [k, Number(v)]),
      ),
      is_default: isDefault,
      is_active: isActive,
    };
    if (pkg) await update.mutateAsync({ id: pkg.id, ...body });
    else await create.mutateAsync(body);
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={pkg ? `Edit ${pkg.name}` : "New package"}
      description="Which platform sections this tier unlocks, and its price."
      className="w-[min(94vw,620px)]"
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </OmButton>
          <OmButton variant="solid" size="md" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <PackageIcon />}
            {pkg ? "Save" : "Create package"}
          </OmButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Name" className="col-span-2">
          <OmInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Growth" />
        </Field>
        <Field label="Description" className="col-span-2">
          <OmInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this tier is for"
          />
        </Field>
        <Field label="Price">
          <OmInput type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Currency">
          <OmInput value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Billing" className="col-span-2">
          <div className="flex gap-1.5">
            {["month", "year", "once"].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInterval(i)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-1.5 text-[11.5px] font-medium capitalize transition-colors",
                  interval === i
                    ? "border-om-violet/50 bg-om-violet/10 text-om-violet"
                    : "border-om-border text-om-muted hover:text-om-dim",
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-3">
        <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-om-dim">
          <input
            type="checkbox"
            checked={allModules}
            onChange={(e) => setAllModules(e.target.checked)}
            className="size-3.5 rounded border-om-border bg-white/[0.04] accent-om-violet"
          />
          Unlock everything (Enterprise)
        </label>
        {!allModules && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {modules.map((m) => (
              <label
                key={m.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors",
                  selected.includes(m.key)
                    ? "border-om-violet/50 bg-om-violet/10 text-om-violet"
                    : "border-om-border text-om-muted",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(m.key)}
                  onChange={() => toggle(m.key)}
                  className="size-3.5 rounded border-om-border bg-white/[0.04] accent-om-violet"
                />
                {m.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-om-muted">
          Limits (leave blank for unlimited)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LIMIT_KEYS.map((l) => (
            <Field key={l.key} label={l.label} className="mb-0">
              <OmInput
                type="number"
                value={limits[l.key] ?? ""}
                onChange={(e) => setLimits((s) => ({ ...s, [l.key]: e.target.value }))}
                placeholder="∞"
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-om-dim">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="size-3.5 rounded border-om-border bg-white/[0.04] accent-om-violet"
          />
          Default for new signups
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-om-dim">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-3.5 rounded border-om-border bg-white/[0.04] accent-om-violet"
          />
          Active (assignable)
        </label>
      </div>
    </Modal>
  );
}
