"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postsApi, type MediaItem, type MusicTrack, type Post, type PostInput } from "@/lib/api/posts";
import { toast } from "@/lib/om/toast";
import { feedBus } from "@/components/om/feed-bus";

export interface DraftForm {
  title: string;
  body: string;
  platforms: string[];
  hashtags: string[];
  link: string;
  media: MediaItem[];
  music: MusicTrack | null;
}

const EMPTY: DraftForm = {
  title: "",
  body: "",
  platforms: [],
  hashtags: [],
  link: "",
  media: [],
  music: null,
};

function toInput(f: DraftForm): PostInput {
  return {
    title: f.title || undefined,
    body: f.body,
    platforms: f.platforms,
    hashtags: f.hashtags,
    link: f.link || null,
    media: f.media,
    music: f.music,
  };
}

export function useComposerDraft(initial?: Post) {
  const qc = useQueryClient();
  const [form, setForm] = useState<DraftForm>(
    initial
      ? {
          title: initial.title ?? "",
          body: initial.body,
          platforms: initial.platforms,
          hashtags: initial.hashtags,
          link: initial.link ?? "",
          media: initial.media,
          music: initial.music ?? null,
        }
      : EMPTY,
  );
  const [postId, setPostId] = useState<string | null>(initial?.id ?? null);
  const [post, setPost] = useState<Post | null>(initial ?? null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const create = useMutation({ mutationFn: (b: PostInput) => postsApi.create(b) });
  const update = useMutation({ mutationFn: ({ id, b }: { id: string; b: PostInput }) => postsApi.update(id, b) });

  // pick up a draft handed over from Content Studio ("Use" button)
  useEffect(() => {
    if (initial) return;
    try {
      const raw = sessionStorage.getItem("om:composer:prefill");
      if (!raw) return;
      sessionStorage.removeItem("om:composer:prefill");
      const p = JSON.parse(raw) as Partial<DraftForm>;
      setForm((f) => ({
        ...f,
        body: p.body ?? f.body,
        hashtags: Array.isArray(p.hashtags) ? p.hashtags : f.hashtags,
        platforms: Array.isArray(p.platforms) ? p.platforms : f.platforms,
        title: p.title ?? f.title,
        media: Array.isArray(p.media) && p.media.length ? [...f.media, ...p.media] : f.media,
      }));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flush = useCallback(
    async (f: DraftForm) => {
      if (!f.body.trim() && f.platforms.length === 0 && f.media.length === 0 && !f.music) return;
      setSaving(true);
      try {
        if (!postId) {
          const p = await create.mutateAsync(toInput(f));
          setPostId(p.id);
          setPost(p);
        } else {
          const p = await update.mutateAsync({ id: postId, b: toInput(f) });
          setPost(p);
        }
        qc.invalidateQueries({ queryKey: ["posts"] });
      } catch (e) {
        toast.err((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [postId, create, update, qc],
  );

  const patch = useCallback(
    (p: Partial<DraftForm>) => {
      setForm((prev) => {
        const next = { ...prev, ...p };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(next), 700);
        return next;
      });
    },
    [flush],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

  /** Make sure the draft is persisted, returning its id. */
  const ensureSaved = useCallback(async (): Promise<string> => {
    if (postId) {
      if (saving) await flush(form);
      return postId;
    }
    const p = await create.mutateAsync(toInput(form));
    setPostId(p.id);
    setPost(p);
    return p.id;
  }, [postId, saving, form, flush, create]);

  const [scheduling, setScheduling] = useState(false);
  const scheduleAt = useCallback(
    async (whenISO: string) => {
      setScheduling(true);
      try {
        const id = await ensureSaved();
        const p = await postsApi.schedule(id, whenISO, tz);
        setPost(p);
        qc.invalidateQueries({ queryKey: ["posts"] });
        toast.ok("Scheduled");
        feedBus.emit(`Post scheduled for ${new Date(p.scheduled_at!).toLocaleString()}`, "ok");
        return p;
      } catch (e) {
        toast.err((e as Error).message);
        throw e;
      } finally {
        setScheduling(false);
      }
    },
    [ensureSaved, tz, qc],
  );

  const unschedule = useMutation({
    mutationFn: () => postsApi.unschedule(postId as string),
    onSuccess: (p) => {
      setPost(p);
      qc.invalidateQueries({ queryKey: ["posts"] });
      toast.ok("Schedule cancelled");
    },
    onError: (e: Error) => toast.err(e.message),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const id = await ensureSaved();
      return postsApi.publish(id);
    },
    onSuccess: (p) => {
      setPost(p);
      qc.invalidateQueries({ queryKey: ["posts"] });
      const ok = Object.values(p.per_platform).filter((r) => r.status === "published").length;
      const pending = Object.values(p.per_platform).filter((r) => r.status === "publishing").length;
      if (pending) toast.ok(`Uploading to ${pending} platform${pending === 1 ? "" : "s"}…`);
      else toast.ok(`Published to ${ok} platform${ok === 1 ? "" : "s"}`);
      feedBus.emit(`Post published to ${p.platforms.join(", ")}`, "ok");
    },
    onError: (e: Error) => toast.err(e.message),
  });

  const refresh = useMutation({
    mutationFn: () => postsApi.refresh(postId as string),
    onSuccess: (p) => {
      setPost(p);
      qc.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (e: Error) => toast.err(e.message),
  });

  // auto-poll while an upload is being processed by the network
  useEffect(() => {
    if (post?.status !== "publishing" || !postId) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries += 1;
      try {
        const p = await postsApi.refresh(postId);
        setPost(p);
        if (p.status !== "publishing" || tries >= 20) {
          clearInterval(id);
          qc.invalidateQueries({ queryKey: ["posts"] });
        }
      } catch {
        if (tries >= 20) clearInterval(id);
      }
    }, 4000);
    return () => clearInterval(id);
  }, [post?.status, postId, qc]);

  const reset = useCallback(() => {
    setForm(EMPTY);
    setPostId(null);
    setPost(null);
  }, []);

  const checks = post?.checks ?? null;
  const hasContent = form.body.trim() !== "" || form.media.length > 0;
  const canGo = useMemo(
    () => form.platforms.length > 0 && hasContent && (checks ? checks.ok : true),
    [checks, form.platforms, hasContent],
  );
  // enough to open the scheduler / attempt an action (final validity checked server-side)
  const canAct = form.platforms.length > 0 && hasContent;

  return {
    form, patch, saving, post, postId, checks, canGo, canAct, tz,
    scheduleAt, scheduling, unschedule, publish, refresh, flush, reset,
  };
}
