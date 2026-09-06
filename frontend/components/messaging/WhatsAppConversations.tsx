"use client";

import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Card, CardTitle } from "@/components/om/primitives/Card";
import { InboxSplit } from "@/components/inbox/InboxSplit";
import type { InboxFilters } from "@/lib/api/inbox";

/** The actual WhatsApp conversations — reuses the exact same Inbox
 * components every other channel's messages already go through, just
 * pinned to platform=whatsapp and surfaced right here in Messaging instead
 * of making you go find them on the separate Social Media Inbox page. */
export function WhatsAppConversations() {
  const [filters, setFilters] = useState<InboxFilters>({ platform: "whatsapp" });
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Card className="flex h-[70vh] min-h-[460px] flex-col overflow-hidden p-3 lg:h-[560px]">
      <div className="mb-3 border-b border-om-border pb-2.5">
        <CardTitle icon={<MessagesSquare />} className="mb-0">
          WhatsApp conversations
        </CardTitle>
      </div>
      <InboxSplit
        filters={filters}
        onChange={(p) => setFilters((f) => ({ ...f, ...p, platform: "whatsapp" }))}
        selected={selected}
        onSelect={setSelected}
        gridClassName="lg:grid-cols-[260px_1fr]"
      />
    </Card>
  );
}
