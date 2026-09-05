import { http, qs } from "./http";

export type ThreadKind = "comment" | "mention" | "dm" | "review";
export type ThreadStatus = "open" | "snoozed" | "done";

export interface InboxMessage {
  id: string;
  direction: "in" | "out";
  author_name: string;
  body: string;
  via: string | null;
  at: string | null;
  like_count: number | null;
  created_at: string;
}

export interface ThreadSummary {
  id: string;
  platform: string;
  kind: ThreadKind;
  status: ThreadStatus;
  author_name: string;
  author_handle: string | null;
  author_avatar: string | null;
  context: string | null;
  permalink: string | null;
  sentiment: string | null;
  priority: number;
  unread: number;
  assignee: string | null;
  last_message_at: string | null;
  preview: string;
  like_count: number | null;
}

export interface ThreadDetail extends ThreadSummary {
  messages: InboxMessage[];
}

export interface SyncNote {
  platform: string;
  message: string;
}

export interface InboxSummary {
  total: number;
  unread: number;
  open: number;
  done: number;
  negative: number;
  by_platform: Record<string, number>;
  by_kind: Record<string, number>;
  live: boolean;
  notes: SyncNote[];
}

export interface InboxFilters {
  platform?: string;
  kind?: ThreadKind;
  status?: ThreadStatus;
  search?: string;
}

export const inboxApi = {
  list: (f: InboxFilters = {}) => http.get<{ items: ThreadSummary[] }>(`/inbox${qs({ ...f })}`),
  summary: () => http.get<InboxSummary>("/inbox/summary"),
  refresh: () => http.post<{ items: ThreadSummary[] }>("/inbox/refresh"),
  get: (id: string) => http.get<ThreadDetail>(`/inbox/${id}`),
  reply: (id: string, body: string, via = "manual") =>
    http.post<ThreadDetail>(`/inbox/${id}/reply`, { body, via }),
  setStatus: (id: string, status: ThreadStatus) =>
    http.post<ThreadSummary>(`/inbox/${id}/status`, { status }),
};
