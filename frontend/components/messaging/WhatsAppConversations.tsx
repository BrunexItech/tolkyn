"use client";

import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { ThreadList } from "@/components/inbox/ThreadList";
import { ThreadView } from "@/components/inbox/ThreadView";
import type { InboxFilters } from "@/lib/api/inbox";

/** The actual WhatsApp conversations — reuses the exact same Inbox
 * components every other channel's messages already go through, just
 * pinned to platform=whatsapp and surfaced right here in Messaging instead
 * of making you go find them on the separate Social Media Inbox page. */
export function WhatsAppConversations() {
  const [filters, setFilters] = useState<InboxFilters>({ platform: "whatsapp" });
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Card className="flex h-[560px] flex-col overflow-hidden p-0">
      <div className="border-b border-om-border px-3.5 py-2.5">
        <CardTitle icon={<MessagesSquare />} className="mb-0">
          WhatsApp conversations
        </CardTitle>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr]">
        <div className="min-h-0 overflow-y-auto border-r border-om-border">
          <ThreadList
            filters={filters}
            onChange={(p) => setFilters((f) => ({ ...f, ...p, platform: "whatsapp" }))}
            selectedId={selected}
            onSelect={(t) => setSelected(t.id)}
          />
        </div>
        <ThreadView threadId={selected} />
      </div>
    </Card>
  );
}
