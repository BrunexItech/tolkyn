"use client";

import { useRef, useState } from "react";
import { Loader2, Sparkles, Paperclip, X, ShieldAlert, Volume2, Wand2, ChevronDown, Palette } from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { Field, OmInput } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { uploadFile } from "@/lib/api/uploads";
import { mediaUrl, estimateCost } from "@/lib/api/video";
import { useVideoModels, useGenerateVideo, useEnhancePrompt } from "./hooks";
import { toast } from "@/lib/om/toast";
import { cn } from "@/lib/utils";

const DURATIONS = [4, 6, 8];
const ASPECTS = ["16:9", "9:16"];

const EXAMPLES = [
  "A drone shot gliding over Nairobi's skyline at golden hour",
  "A barista steaming milk in a busy coffee shop, close up",
  "A product spinning slowly on a white studio backdrop",
];

function ImageSlot({
  label,
  hint,
  url,
  uploading,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  url: string | null;
  uploading: boolean;
  onPick: (file?: File) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex-1">
      <div className="mb-1 text-[10.5px] font-medium text-om-dim">{label}</div>
      {url ? (
        <div className="flex items-center gap-2 rounded-lg border border-om-violet/25 bg-om-violet/[0.06] p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(url)} alt="" className="size-9 shrink-0 rounded-md object-cover" />
          <span className="min-w-0 flex-1 truncate text-[10px] text-om-dim">{hint}</span>
          <button onClick={onClear} className="shrink-0 text-om-muted hover:text-om-red">
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0])} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-om-border px-2.5 py-2 text-[11px] text-om-muted hover:border-om-violet/40 hover:text-om-dim disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
            Attach
          </button>
        </>
      )}
    </div>
  );
}

export function VideoGeneratorForm() {
  const { data: models, isLoading: modelsLoading } = useVideoModels();
  const generate = useGenerateVideo();
  const enhance = useEnhancePrompt();

  const [modelKey, setModelKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1080p");
  const [duration, setDuration] = useState(8);

  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [refUploading, setRefUploading] = useState(false);
  const [heroLogoWhere, setHeroLogoWhere] = useState("");
  const brandColors = models?.brand_colors ?? [];
  const hasBrandLogo = !!models?.brand_logo_url;

  const activeModel = models?.models.find((m) => m.key === modelKey) ?? models?.models[0] ?? null;
  const effectiveModelKey = modelKey || activeModel?.key || "";
  const supportedResolutions = activeModel ? Object.keys(activeModel.price_per_second) : [];
  const cost = models ? estimateCost(models.models, effectiveModelKey, resolution, duration) : null;

  const overBudget =
    models?.budget_usd != null && cost != null ? models.spent_usd + cost > models.budget_usd : false;

  const pickReferenceImage = async (file?: File) => {
    if (!file) return;
    setRefUploading(true);
    try {
      const u = await uploadFile(file);
      setReferenceImage(u.url);
    } catch (e) {
      toast.err((e as Error).message);
    } finally {
      setRefUploading(false);
    }
  };

  const runEnhance = () => {
    const idea = prompt.trim();
    if (idea.length < 3 || enhance.isPending) return;
    enhance.mutate(
      { idea, brand_colors: brandColors.length ? brandColors : undefined },
      { onSuccess: (r) => setPrompt(r.prompt) },
    );
  };

  const canSubmit =
    !!models?.configured && !!effectiveModelKey && prompt.trim().length >= 3 && !overBudget && !generate.isPending;

  const submit = () => {
    if (!canSubmit) return;
    generate.mutate(
      {
        model_key: effectiveModelKey,
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim() || undefined,
        aspect_ratio: aspectRatio,
        resolution,
        duration_seconds: duration,
        reference_image_url: referenceImage ?? undefined,
        hero_logo_where:
          hasBrandLogo && !referenceImage && heroLogoWhere.trim()
            ? heroLogoWhere.trim()
            : undefined,
      },
      { onSuccess: () => setPrompt("") },
    );
  };

  if (!modelsLoading && models && !models.configured) {
    return (
      <Card>
        <div className="flex items-start gap-2.5 py-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-om-amber" />
          <div>
            <div className="text-[12.5px] font-semibold text-om-text">Video generation isn&apos;t set up yet</div>
            <p className="mt-1 text-[11.5px] text-om-muted">
              Ask the platform admin to add a Gemini API key — once that&apos;s done this page goes live immediately.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-om-violet/12 text-om-violet">
          <Sparkles className="size-4" />
        </span>
        <div>
          <div className="text-[13px] font-semibold text-om-text">Generate a video</div>
          <div className="text-[10.5px] text-om-muted">Veo 3.1 — native sound, up to 8 seconds per clip</div>
        </div>
      </div>

      <div className="space-y-3">
        <Field label="Model">
          <select
            value={effectiveModelKey}
            onChange={(e) => setModelKey(e.target.value)}
            disabled={modelsLoading}
            className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
          >
            {models?.models.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          {activeModel && <p className="mt-1 text-[10.5px] text-om-muted">{activeModel.description}</p>}
          {models && models.models.length === 0 && (
            <p className="mt-1 text-[10.5px] text-om-amber">
              No video models are enabled for your account yet — ask the platform admin to grant access.
            </p>
          )}
        </Field>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10.5px] font-medium text-om-dim">Describe the scene</span>
            <button
              onClick={runEnhance}
              disabled={prompt.trim().length < 3 || enhance.isPending}
              title="Turn a short idea into a full, well-written scene"
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-om-violet hover:bg-om-violet/10 disabled:opacity-40"
            >
              {enhance.isPending ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
              Enhance with AI
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Just describe it simply — e.g. “a barista making latte art” — then hit Enhance with AI to turn it into a full scene"
            className="w-full resize-none rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] leading-relaxed text-om-text outline-none placeholder:text-om-muted focus:border-om-violet/60"
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => setPrompt(e)}
                className="rounded-md border border-om-border bg-white/[0.02] px-2 py-1 text-left text-[10.5px] text-om-dim hover:border-om-violet/40"
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Field label="Aspect ratio">
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
            >
              {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Resolution">
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
            >
              {supportedResolutions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Duration">
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12px] text-om-text outline-none focus:border-om-violet/60"
            >
              {DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}
            </select>
          </Field>
        </div>

        <div className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]", activeModel?.supports_audio === false ? "border-om-border bg-white/[0.02] text-om-faint" : "border-om-violet/25 bg-om-violet/[0.06] text-om-violet")}>
          <Volume2 className="size-3.5 shrink-0" />
          {activeModel?.supports_audio === false ? "This model is silent — no native audio" : "Includes native sound — dialogue, ambience and effects"}
        </div>

        <ImageSlot
          label="Starting frame (optional)"
          hint="Used as the video's first frame"
          url={referenceImage}
          uploading={refUploading}
          onPick={pickReferenceImage}
          onClear={() => setReferenceImage(null)}
        />

        {hasBrandLogo && !referenceImage && (
          <div className="rounded-lg border border-om-border bg-white/[0.02] px-2.5 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-om-dim">
              <Palette className="size-3 text-om-violet" /> Put my logo on a surface in the scene
              <span className="text-om-faint">— optional</span>
            </div>
            <input
              value={heroLogoWhere}
              onChange={(e) => setHeroLogoWhere(e.target.value)}
              placeholder="e.g. on the laptop lid · on the wall sign behind the desk"
              className="w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] text-om-text outline-none placeholder:text-om-muted focus:border-om-violet/60"
            />
            <div className="mt-1 text-[9.5px] text-om-faint">
              We render the opening frame with your real logo on that surface and animate from it.
              Works best on still or slow shots. Your logo also appears as a corner watermark either way.
            </div>
          </div>
        )}

        {brandColors.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-om-border bg-white/[0.02] px-2.5 py-1.5">
            <Palette className="size-3 shrink-0 text-om-muted" />
            <span className="text-[10px] text-om-faint">Brand colors will guide the styling:</span>
            {brandColors.map((c) => (
              <span key={c} className="size-3 rounded-full border border-white/10" style={{ background: c }} title={c} />
            ))}
          </div>
        )}

        <div>
          <button
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-1 text-[10.5px] font-medium text-om-muted hover:text-om-dim"
          >
            <ChevronDown className={cn("size-3 transition-transform", showAdvanced && "rotate-180")} />
            Advanced
          </button>
          {showAdvanced && (
            <div className="mt-2">
              <Field label="Negative prompt" hint="What to avoid — e.g. blurry, text overlays, watermark">
                <OmInput value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="blurry, low quality, text" />
              </Field>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-om-border bg-white/[0.02] px-3 py-2">
          <div className="text-[11px] text-om-muted">
            Estimated cost
            {models?.budget_usd != null && (
              <span className="ml-1.5">
                · ${models.spent_usd.toFixed(2)} used of ${models.budget_usd.toFixed(2)}
              </span>
            )}
          </div>
          <div className={cn("font-mono text-[15px] font-bold", overBudget ? "text-om-red" : "text-om-text")}>
            {cost != null ? `$${cost.toFixed(2)}` : "—"}
          </div>
        </div>
        {overBudget && (
          <p className="text-[10.5px] text-om-red">
            This would go over your video budget. Ask the platform admin to raise it, or pick a cheaper option.
          </p>
        )}

        <OmButton variant="solid" className="w-full justify-center" disabled={!canSubmit} onClick={submit}>
          {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Generate video
        </OmButton>
      </div>
    </Card>
  );
}
