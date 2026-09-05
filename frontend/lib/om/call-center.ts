/** Call Center shared types + helpers. Data now comes from the API — see
 *  `lib/api/callcenter.ts` and `components/call-center/store.tsx`. */

export type {
  CallDirection,
  CallOutcome,
  AgentStatus,
  QueuedCall,
  RecentCall,
  ActiveCall,
  AgentRow,
  AgentRow as Agent,
  CallStats,
  VolumePoint,
} from "@/lib/api/callcenter";

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
