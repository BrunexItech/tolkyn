"use client";

import {
  History,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail,
  PhoneForwarded,
  Play,
} from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { TableWrap } from "@/components/om/primitives/Table";
import { StatusBadge, type BadgeTone } from "@/components/om/primitives/StatusBadge";
import { useCallCenter } from "./store";
import { formatDuration, type CallOutcome } from "@/lib/om/call-center";
import { relativeTime } from "@/lib/om/format";

const OUTCOME: Record<CallOutcome, { tone: BadgeTone; label: string; Icon: typeof PhoneMissed }> = {
  completed: { tone: "green", label: "Completed", Icon: PhoneIncoming },
  missed: { tone: "red", label: "Missed", Icon: PhoneMissed },
  voicemail: { tone: "amber", label: "Voicemail", Icon: Voicemail },
  transferred: { tone: "blue", label: "Transferred", Icon: PhoneForwarded },
};

export function RecentCalls() {
  const { recent } = useCallCenter();

  return (
    <Card>
      <CardTitle icon={<History />}>Recent calls</CardTitle>
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
                    {c.recorded ? (
                      <button className="grid size-6 place-items-center rounded-md border border-om-border text-om-muted hover:text-om-text">
                        <Play className="size-3" />
                      </button>
                    ) : (
                      <span className="text-om-faint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
