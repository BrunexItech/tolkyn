"use client";

import { useRef, useState } from "react";
import {
  History,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail,
  PhoneForwarded,
  Play,
  Pause,
  PhoneCall,
  MessageSquareText,
  Trash2,
} from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { useConfirm } from "@/components/om/primitives/ConfirmDialog";
import { useCallCenter } from "./store";
import { formatDuration, type CallOutcome } from "@/lib/om/call-center";
import { relativeTime } from "@/lib/om/format";
import { mediaUrl } from "@/lib/api/video";
import { CallTranscriptModal } from "./CallTranscriptModal";

const OUTCOME: Record<CallOutcome, { tone: BadgeTone; label: string; Icon: typeof PhoneMissed }> = {
  completed: { tone: "green", label: "Completed", Icon: PhoneIncoming },
  missed: { tone: "red", label: "Missed", Icon: PhoneMissed },
  voicemail: { tone: "amber", label: "Voicemail", Icon: Voicemail },
  transferred: { tone: "blue", label: "Transferred", Icon: PhoneForwarded },
};

export function RecentCalls() {
  const { recent, dial, active, allowCallLogDeletion, deleteCall } = useCallCenter();
  const { confirm, dialog } = useConfirm();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);

  const onDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: "Delete this call log entry?",
      message: `The record for "${name}" — including any recording or transcript — will be permanently removed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) deleteCall(id);
  };

  const togglePlay = (id: string, url: string) => {
    const el = audioRef.current;
    if (!el) return;
    if (playingId === id) {
      el.pause();
      setPlayingId(null);
      return;
    }
    el.src = mediaUrl(url);
    el.play().catch(() => undefined);
    setPlayingId(id);
  };

  return (
    <Card>
      <CardTitle icon={<History />}>Recent calls</CardTitle>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Direction</th>
              <th>Outcome</th>
              <th>Duration</th>
              <th>When</th>
              <th>Rec.</th>
              <th>Transcript</th>
              <th />
              {allowCallLogDeletion && <th />}
            </tr>
          </thead>
          <tbody>
            {recent.map((c) => {
              const o = OUTCOME[c.outcome];
              const DirIcon = c.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
              return (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium">{c.name}</div>
                    <div className="font-mono text-[10px] text-om-muted">{c.number}</div>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1 text-[11px] text-om-dim">
                      <DirIcon
                        className={
                          c.direction === "inbound" ? "size-3 text-om-cyan" : "size-3 text-om-violet"
                        }
                      />
                      {c.direction === "inbound" ? "Inbound" : "Outbound"}
                    </span>
                  </td>
                  <td>
                    <StatusBadge tone={o.tone} icon={<o.Icon />}>
                      {o.label}
                    </StatusBadge>
                  </td>
                  <td className="font-mono text-om-dim">
                    {c.durationSec ? formatDuration(c.durationSec) : "—"}
                  </td>
                  <td className="text-om-muted">{relativeTime(c.at)}</td>
                  <td>
                    {c.recorded && c.recordingUrl ? (
                      <button
                        type="button"
                        title={c.outcome === "voicemail" ? "Play voicemail" : "Play recording"}
                        onClick={() => togglePlay(c.id, c.recordingUrl!)}
                        className="grid size-6 place-items-center rounded-md border border-om-border text-om-muted hover:text-om-text"
                      >
                        {playingId === c.id ? <Pause className="size-3" /> : <Play className="size-3" />}
                      </button>
                    ) : (
                      <span className="text-om-faint">—</span>
                    )}
                  </td>
                  <td>
                    {c.hasTranscript ? (
                      <button
                        type="button"
                        title="View conversation"
                        onClick={() => setTranscriptId(c.id)}
                        className="grid size-6 place-items-center rounded-md border border-om-border text-om-muted hover:text-om-blue hover:border-om-blue/40"
                      >
                        <MessageSquareText className="size-3" />
                      </button>
                    ) : (
                      <span className="text-om-faint">—</span>
                    )}
                  </td>
                  <td>
                    {c.number && c.number.toLowerCase() !== "unknown" && (
                      <button
                        type="button"
                        title={`Call back ${c.number}`}
                        disabled={!!active}
                        onClick={() => dial(c.name === "Unknown caller" ? "" : c.name, c.number)}
                        className="grid size-6 place-items-center rounded-md border border-om-border text-om-muted hover:text-om-green hover:border-om-green/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <PhoneCall className="size-3" />
                      </button>
                    )}
                  </td>
                  {allowCallLogDeletion && (
                    <td>
                      <button
                        type="button"
                        title="Delete this call log entry"
                        onClick={() => onDelete(c.id, c.name)}
                        className="grid size-6 place-items-center rounded-md border border-om-border text-om-faint hover:text-om-red hover:border-om-red/40"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <CallTranscriptModal
        callId={transcriptId}
        callerName={recent.find((c) => c.id === transcriptId)?.name || "caller"}
        onClose={() => setTranscriptId(null)}
      />
      {dialog}
    </Card>
  );
}
