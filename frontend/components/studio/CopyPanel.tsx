"use client";

import { useState } from "react";
import { Type, Loader2, Copy, Check, Hash, PenSquare, Bookmark, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { Field, OmInput, OmTextarea } from "@/components/om/primitives/Field";
import { OmButton } from "@/components/om/primitives/OmButton";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { PlatformChip } from "@/components/om/primitives/PlatformChip";
import { PLATFORMS, platform as findPlatform } from "@/lib/om/platforms";
import { useGenerateCopy, useSaveCaption } from "./hooks";
import { PromptCount } from "./PromptCount";
import { PROMPT_LIMITS, canSubmitPrompt } from "./limits";
import type { CopyResponse } from "@/lib/api/studio";
import { toast } from "@/lib/om/toast";
import { cn } from "@/lib/utils";

const CHANNELS = PLATFORMS.filter((p) =>
  ["instagram", "tiktok", "x", "linkedin", "facebook", "youtube"].includes(p.id),
);
const TONES = ["confident, friendly", "playful", "authoritative", "warm", "bold", "witty", "plain / no-nonsense"];

const SELECT =
  "w-full rounded-lg border border-om-border bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-om-text outline-none focus:border-om-blue/60";

export function CopyPanel() {
  const gen = useGenerateCopy();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["instagram"]);
  const [tone, setTone] = useState(TONES[0]);
  const [count, setCount] = useState(2);
  const [result, setResult] = useState<CopyResponse | null>(null);

  const toggle = (id: string) =>
    setPlatforms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const promptOk = canSubmitPrompt(prompt, PROMPT_LIMITS.copy);

  const run = () => {
    if (!promptOk || platforms.length === 0) return;
    gen.mutate(
      { prompt: prompt.trim(), platforms, count, tone },
      { onSuccess: (r) => setResult(r) },
    );
  };

  const groups = result?.results ?? [];

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardTitle icon={<Type />}>Write copy</CardTitle>
        <Field label="Brief">
          <OmTextarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What is this post about? Product, angle, audience, offer…"
          />
          <PromptCount value={prompt} limit={PROMPT_LIMITS.copy} />
        </Field>

        <Field label={`Platforms · ${platforms.length}`}>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((p) => (
              <PlatformChip
                key={p.id}
                platform={p}
                active={platforms.includes(p.id)}
                onClick={() => toggle(p.id)}
                className={platforms.includes(p.id) ? "" : "opacity-55"}
              />
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Variants / channel">
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={SELECT}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tone">
            <select value={tone} onChange={(e) => setTone(e.target.value)} className={SELECT}>
              {TONES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>

        <OmButton
          variant="solid"
          size="sm"
          className="w-full"
          onClick={run}
          disabled={gen.isPending || platforms.length === 0 || !promptOk}
        >
          {gen.isPending ? <Loader2 className="animate-spin" /> : <Type />}
          {gen.isPending ? "Writing…" : `Generate for ${platforms.length || 0}`}
        </OmButton>
        <p className="mt-1.5 text-[10px] text-om-faint">
          Written to sound human — no emojis, no marketing clichés.
        </p>
      </Card>

      <div className="space-y-3">
        {gen.isPending ? (
          <Card>
            <EmptyState icon={<Type />} title="Drafting copy for each channel…" />
          </Card>
        ) : groups.length === 0 ? (
          <Card>
            <EmptyState title="Your generated captions appear here">
              Pick one or more channels — each gets copy tailored to its format.
            </EmptyState>
          </Card>
        ) : (
          groups.map((g) => {
            const p = findPlatform(g.platform);
            return (
              <Card key={g.platform}>
                <CardTitle icon={p ? <p.Icon style={{ color: p.color }} /> : <Type />}>
                  {p?.name ?? g.platform}
                </CardTitle>
                {g.variants.length === 0 ? (
                  <p className="text-[11px] text-om-muted">Nothing came back for this channel — try again.</p>
                ) : (
                  <div className="space-y-2">
                    {g.variants.map((v, i) => (
                      <VariantCard
                        key={i}
                        text={v.text}
                        angle={v.angle}
                        chars={v.chars}
                        hashtags={v.hashtags}
                        platform={g.platform}
                        brief={prompt}
                        onUse={() => {
                          try {
                            sessionStorage.setItem(
                              "om:composer:prefill",
                              JSON.stringify({
                                body: v.text,
                                hashtags: v.hashtags,
                                platforms: [g.platform],
                              }),
                            );
                          } catch {
                            /* ignore */
                          }
                          router.push("/dashboard/publishing");
                        }}
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function VariantCard({
  text,
  angle,
  chars,
  hashtags,
  platform,
  brief,
  onUse,
}: {
  text: string;
  angle: string;
  chars: number;
  hashtags: string[];
  platform: string;
  brief: string;
  onUse: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState("");
  const saveCaption = useSaveCaption();
  const full = hashtags.length ? `${text}\n\n${hashtags.join(" ")}` : text;

  const confirmSave = () => {
    const t = title.trim();
    if (!t) return;
    saveCaption.mutate(
      { title: t, platform, text, hashtags, angle, brief },
      { onSuccess: () => { setNaming(false); setTitle(""); } },
    );
  };

  return (
    <div className="rounded-lg border border-om-border bg-white/[0.02] p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        {angle && (
          <span className="rounded bg-om-blue/12 px-1.5 py-px text-[9.5px] font-semibold text-om-blue">
            {angle}
          </span>
        )}
        <span className="text-[9.5px] text-om-muted">{chars} chars</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onUse}
            className="inline-flex items-center gap-1 rounded-md border border-om-border px-1.5 py-0.5 text-[10px] text-om-muted hover:text-om-text"
          >
            <PenSquare className="size-3" /> Use
          </button>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(full);
              setCopied(true);
              toast.ok("Copied");
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-om-border px-1.5 py-0.5 text-[10px] text-om-muted hover:text-om-text"
          >
            {copied ? <Check className="size-3 text-om-green" /> : <Copy className="size-3" />}
            Copy
          </button>
          <button
            onClick={() => setNaming((n) => !n)}
            disabled={saveCaption.isSuccess}
            className="inline-flex items-center gap-1 rounded-md border border-om-border px-1.5 py-0.5 text-[10px] text-om-muted hover:text-om-text disabled:opacity-60"
          >
            {saveCaption.isSuccess ? (
              <>
                <Check className="size-3 text-om-green" /> Saved
              </>
            ) : (
              <>
                <Bookmark className="size-3" /> Save
              </>
            )}
          </button>
        </div>
      </div>
      <p className={cn("whitespace-pre-wrap text-[12px] leading-relaxed text-om-dim")}>{text}</p>
      {hashtags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10.5px] text-om-blue">
          <Hash className="size-3" />
          {hashtags.map((h) => (
            <span key={h}>{h.replace(/^#/, "")}</span>
          ))}
        </div>
      )}

      {naming && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-om-violet/25 bg-om-violet/[0.06] p-1.5">
          <OmInput
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmSave()}
            placeholder="Name this caption — e.g. “Weekend cold brew promo”"
            className="flex-1 text-[11.5px]"
          />
          <OmButton variant="solid" size="xs" onClick={confirmSave} disabled={!title.trim() || saveCaption.isPending}>
            {saveCaption.isPending ? <Loader2 className="animate-spin" /> : <Bookmark />}
            Save
          </OmButton>
          <button onClick={() => setNaming(false)} className="text-om-muted hover:text-om-red">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {naming && (
        <p className="mt-1 text-[9.5px] text-om-faint">
          The title is just for finding it later — only the caption text and hashtags go into a post.
        </p>
      )}
    </div>
  );
}
