"use client";

import type { FeedTone } from "./primitives/Feed";

type Listener = (msg: string, tone: FeedTone) => void;

const listeners = new Set<Listener>();

/**
 * App-wide activity bus. Panels call `feedBus.emit(...)` when something happens;
 * the dashboard activity feed subscribes and renders it.
 */
export const feedBus = {
  emit(msg: string, tone: FeedTone = "info") {
    listeners.forEach((l) => l(msg, tone));
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
