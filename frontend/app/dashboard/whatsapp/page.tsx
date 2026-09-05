"use client";

import { useState } from "react";
import { MessagesSquare, Megaphone, Users2 } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Pill } from "@/components/om/primitives/Pill";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { Card } from "@/components/om/primitives/Card";
import { BroadcastHistory } from "@/components/messaging/BroadcastHistory";
import { NewBroadcastButton } from "@/components/messaging/NewBroadcastButton";
import { WhatsAppSessionCard } from "@/components/messaging/WhatsAppSessionCard";
import { WhatsAppConversations } from "@/components/messaging/WhatsAppConversations";
import { CampaignGroups } from "@/components/messaging/CampaignGroups";
import { useWhatsAppWebStatus } from "@/components/messaging/hooks";
import { cn } from "@/lib/utils";

const WA_ACCENT = "#25D366";

type Tab = "conversations" | "campaigns" | "communities";

const TABS: { id: Tab; label: string; icon: typeof MessagesSquare }[] = [
  { id: "conversations", label: "Conversations", icon: MessagesSquare },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "communities", label: "Communities", icon: Users2 },
];

export default function WhatsAppPage() {
  const { data: session } = useWhatsAppWebStatus();
  const connected = session?.status === "connected";
  const [tab, setTab] = useState<Tab>("conversations");

  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="WhatsApp"
        subtitle="Your connected number, conversations, campaigns and communities"
        icon={<FaWhatsapp />}
        actions={
          <Pill tone={connected ? "green" : "amber"} dot>
            {connected ? "Connected" : "Not connected"}
          </Pill>
        }
      />

      <WhatsAppSessionCard />

      {connected && (
        <>
          <div className="flex gap-1 rounded-xl border border-om-border bg-om-card p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                  tab === t.id
                    ? "bg-white/[0.07] text-om-text"
                    : "text-om-muted hover:text-om-dim",
                )}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {tab === "conversations" && <WhatsAppConversations />}

          {tab === "campaigns" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-om-muted">
                  One‑way broadcasts to a list of numbers — each recipient gets a private 1:1 message.
                </p>
                <NewBroadcastButton channel="whatsapp" accent={WA_ACCENT} />
              </div>
              <BroadcastHistory channel="whatsapp" accent={WA_ACCENT} />
            </div>
          )}

          {tab === "communities" && <CampaignGroups />}
        </>
      )}

      {!connected && (
        <Card>
          <EmptyState icon={<FaWhatsapp />} title="Connect a number to get started">
            Once a WhatsApp number is connected, your conversations, campaigns and communities appear here.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
