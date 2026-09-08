"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  Paperclip,
  ArrowUp,
  X,
  Download,
  PenSquare,
  Maximize2,
  AlertTriangle,
  Image as ImageIcon,
} from "lucide-react";
import { Card } from "@/components/om/primitives/Card";
import { uploadFile } from "@/lib/api/uploads";
import { mediaUrl, type ImageChatTurn, type LogoPlacement } from "@/lib/api/studio";
import { StudioBrandBar } from "./StudioBrandBar";
import { useImageChat, useImageJob } from "./hooks";
import { ImageLightbox } from "./ImageLightbox";
import { PromptHelper } from "./PromptHelper";
import { PROMPT_LIMITS, canSubmitPrompt } from "./limits";
import { toast } from "@/lib/om/toast";
import { cn } from "@/lib/utils";

type Msg =
  | { id: string; role: "user"; text: string; attachmentUrl?: string }
  | { id: string; role: "assistant"; text: string; imageUrl: string; op: string; logo?: string | null }
  | { id: string; role: "assistant"; error: string }
  | { id: string; role: "assistant"; pending: true; editing: boolean };

const LOGO_OPTS: { value: LogoPlacement; label: string }[] = [
  { value: "auto", label: "Auto — on a surface in the scene, or a clean corner" },
  { value: "off", label: "No logo" },
  { value: "top-left", label: "Always top-left" },
  { value: "top-right", label: "Always top-right" },
  { value: "bottom-left", label: "Always bottom-left" },
  { value: "bottom-right", label: "Always bottom-right" },
  { value: "center", label: "Always centered" },
];

const EXAMPLES = [
  "A clean wordmark logo for a coffee cart called Brew Bus, warm browns",
  "A launch-day banner: phone on a desk at golden hour, lots of empty space for a headline",
  "A cozy flat-illustration of a reading nook, muted palette",
];

let n = 0;
const uid = () => `m${++n}-${Date.now()}`;

export function ImageStudio() {
  const chat = useImageChat();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [logoMode, setLogoMode] = useState<LogoPlacement>("auto");
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // maps the running job -> the pending message + what to retry on failure
  const pendingRef = useRef<{ msgId: string; instruction: string; att: string | null } | null>(null);

  const { data: job } = useImageJob(activeJobId);
  const busy = chat.isPending || !!activeJobId;

  // react to a job finishing: swap the pending message for the image or an error
  useEffect(() => {
    if (!job || (job.status !== "succeeded" && job.status !== "failed")) return;
    const p = pendingRef.current;
    if (!p || p.msgId !== `job-${job.id}`) return;

    setMessages((cur) => {
      const copy = [...cur];
      const idx = copy.findIndex((m) => m.id === p.msgId);
      if (idx === -1) return cur;
      if (job.status === "succeeded" && job.url) {
        copy[idx] = {
          id: p.msgId,
          role: "assistant",
          text: job.reply ?? "",
          imageUrl: mediaUrl(job.url),
          op: job.operation ?? "generate",
          logo: job.logo_applied,
        };
      } else {
        copy.splice(idx, 1);
        copy.push({
          id: uid(),
          role: "assistant",
          error: job.error || "Something went wrong generating the image.",
        });
        setInput(p.instruction === "Use this image." ? "" : p.instruction);
        if (p.att) setAttachment(p.att);
      }
      return copy;
    });
    if (job.status === "succeeded" && job.logo_note) toast.err(job.logo_note);
    pendingRef.current = null;
    setActiveJobId(null);
  }, [job?.status, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const previousImage =
    [...messages].reverse().find((m): m is Extract<Msg, { role: "assistant"; imageUrl: string }> =>
      m.role === "assistant" && "imageUrl" in m,
    )?.imageUrl ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const pickFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const u = await uploadFile(file);
      setAttachment(mediaUrl(u.url));
    } catch (e) {
      toast.err((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const ok = canSubmitPrompt(input, PROMPT_LIMITS.image) || (!!attachment && input.trim().length === 0);
  const over = input.length > PROMPT_LIMITS.image;

  const send = () => {
    const text = input.trim();
    if ((!text && !attachment) || over || busy) return;

    const att = attachment;
    const instruction = text || "Use this image.";
    const editing = !!att || !!previousImage;

    const history: ImageChatTurn[] = messages
      .filter((m): m is Extract<Msg, { text: string }> => "text" in m && !!m.text)
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }));

    const userMsgId = uid();
    setMessages((cur) => [
      ...cur,
      { id: userMsgId, role: "user", text: text || "(use attached image)", attachmentUrl: att ?? undefined },
    ]);
    setInput("");
    setAttachment(null);

    chat.mutate(
      {
        instruction,
        attachment_url: att ? att.replace(/^https?:\/\/[^/]+/, "") : undefined,
        previous_image_url: !att && previousImage ? previousImage.replace(/^https?:\/\/[^/]+/, "") : undefined,
        history,
        brand_logo: logoMode,
      },
      {
        onSuccess: (r) => {
          // one pending bubble, keyed to the job id — the poll effect swaps it
          const msgId = `job-${r.id}`;
          pendingRef.current = { msgId, instruction, att };
          setMessages((cur) => [
            ...cur,
            { id: msgId, role: "assistant", pending: true, editing },
          ]);
          setActiveJobId(r.id);
        },
        onError: (e: Error) => {
          setMessages((cur) => [
            ...cur,
            { id: uid(), role: "assistant", error: e.message || "Something went wrong." },
          ]);
          setInput(instruction === "Use this image." ? "" : instruction);
          if (att) setAttachment(att);
        },
      },
    );
  };

  const sendImageToComposer = (url: string) => {
    try {
      sessionStorage.setItem(
        "om:composer:prefill",
        JSON.stringify({ media: [{ url, alt: "", type: "image" }] }),
      );
    } catch {
      /* ignore */
    }
    router.push("/dashboard/publishing");
  };

  return (
    <div className="space-y-3">
    <StudioBrandBar />
    <Card noEdge className="flex h-[calc(100vh-275px)] min-h-[420px] flex-col p-0">
      {/* thread */}
      <div ref={scrollRef} className="om-scroll flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
            <span className="grid size-11 place-items-center rounded-xl bg-om-blue/12 text-om-blue">
              <Sparkles className="size-5" />
            </span>
            <div className="mt-3 text-[13px] font-semibold">Describe an image, or attach a photo</div>
            <p className="mt-1 text-[11.5px] text-om-muted">
              Attach a photo and tell it what you want — enhance it, restyle it, remove the
              background, or turn it into a logo. Then keep chatting to refine.
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => setInput(e)}
                  className="rounded-lg border border-om-border bg-white/[0.02] px-2.5 py-1.5 text-left text-[11px] text-om-dim hover:border-om-blue/40"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] space-y-1.5">
                  {m.attachmentUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.attachmentUrl}
                      alt=""
                      className="ml-auto max-h-40 rounded-lg border border-om-border object-cover"
                    />
                  )}
                  <div className="rounded-2xl rounded-br-sm bg-om-blue/15 px-3 py-2 text-[12px] leading-relaxed text-om-text">
                    {m.text}
                  </div>
                </div>
              </div>
            ) : "pending" in m ? (
              <div key={m.id} className="flex items-center gap-2 text-[11.5px] text-om-muted">
                <Loader2 className="size-3.5 animate-spin text-om-blue" />
                {m.editing ? "Editing your image" : "Generating your image"} — this runs in the
                background and can take up to a minute or two. You can keep it open.
              </div>
            ) : "error" in m ? (
              <div
                key={m.id}
                className="flex items-start gap-2 rounded-lg border border-om-red/30 bg-om-red/[0.06] px-3 py-2 text-[11.5px] text-om-dim"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-om-red" />
                <span>{m.error}</span>
              </div>
            ) : (
              <div key={m.id} className="space-y-2">
                {m.text && <div className="text-[12px] leading-relaxed text-om-dim">{m.text}</div>}
                {m.logo && (
                  <div className="inline-flex items-center gap-1 rounded-md border border-om-green/25 bg-om-green/10 px-1.5 py-0.5 text-[10px] font-medium text-om-green">
                    <ImageIcon className="size-2.5" /> Brand logo · {m.logo.replace("-", " ")}
                  </div>
                )}
                <div className="group relative w-fit max-w-full overflow-hidden rounded-xl border border-om-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.imageUrl}
                    alt=""
                    onClick={() => setLightbox({ src: m.imageUrl, caption: m.text })}
                    className="max-h-[440px] w-auto max-w-full cursor-zoom-in"
                  />
                  <div className="pointer-events-none absolute bottom-2 left-2 flex gap-1.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                    <button
                      onClick={() => setLightbox({ src: m.imageUrl, caption: m.text })}
                      className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10.5px] text-white backdrop-blur hover:bg-black/85"
                    >
                      <Maximize2 className="size-3" /> View
                    </button>
                    <a
                      href={m.imageUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10.5px] text-white backdrop-blur hover:bg-black/85"
                    >
                      <Download className="size-3" /> Save
                    </a>
                    <button
                      onClick={() => sendImageToComposer(m.imageUrl)}
                      className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10.5px] text-white backdrop-blur hover:bg-black/85"
                    >
                      <PenSquare className="size-3" /> Use in post
                    </button>
                  </div>
                </div>
                <div className="text-[9.5px] text-om-faint">Click to view full size · keep typing to refine.</div>
              </div>
            ),
          )
        )}
      </div>

      {/* composer */}
      <div className="border-t border-om-border p-3">
        <PromptHelper intent="image" onUse={(p) => setInput(p)} />
        {attachment && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-om-blue/25 bg-om-blue/[0.06] p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachment} alt="" className="size-10 rounded-md object-cover" />
            <span className="flex-1 text-[10.5px] text-om-dim">
              Attached — tell it what to do (enhance, restyle, remove background, make a logo…).
            </span>
            <button onClick={() => setAttachment(null)} className="text-om-muted hover:text-om-red">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div
          className={cn(
            "flex items-end gap-1.5 rounded-xl border bg-white/[0.03] px-2 py-1.5",
            over ? "border-om-red/50" : "border-om-border focus-within:border-om-blue/60",
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Attach an image"
            className="shrink-0 rounded-lg p-1.5 text-om-muted hover:bg-white/[0.06] hover:text-om-text disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
          </button>
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              messages.some((m) => m.role === "assistant" && "imageUrl" in m)
                ? "Refine it — “make it darker”, “now square”, “add our name”…"
                : "Describe the image you want…"
            }
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[12.5px] leading-relaxed text-om-text outline-none placeholder:text-om-muted"
          />
          <button
            onClick={send}
            disabled={(!ok && !attachment) || over || busy}
            className="shrink-0 rounded-lg bg-om-blue p-1.5 text-white transition-colors hover:bg-[#5c85ff] disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[9.5px] text-om-faint">
          <span className="flex items-center gap-1">
            <ImageIcon className="size-3" /> Enter to send · Shift+Enter for a new line
          </span>
          <label className="flex items-center gap-1.5">
            <span>Logo</span>
            <select
              value={logoMode}
              onChange={(e) => setLogoMode(e.target.value as LogoPlacement)}
              className="rounded border border-om-border bg-white/[0.03] px-1 py-0.5 text-[9.5px] text-om-dim outline-none focus:border-om-blue/60"
            >
              {LOGO_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <span className={cn(over && "text-om-red")}>
            {over ? `${input.length}/${PROMPT_LIMITS.image} — too long` : ""}
          </span>
        </div>
      </div>

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          caption={lightbox.caption}
          onClose={() => setLightbox(null)}
          onUse={() => {
            const s = lightbox.src;
            setLightbox(null);
            sendImageToComposer(s);
          }}
        />
      )}
    </Card>
    </div>
  );
}
