"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, SendHorizontal, Loader2, Settings2 } from "lucide-react";
import { OmButton } from "@/components/om/primitives/OmButton";
import { useEmailAccounts, useSendBulk } from "./hooks";

export function BulkActionBar({
  ids,
  onClear,
}: {
  ids: string[];
  onClear: () => void;
}) {
  const { data } = useEmailAccounts();
  const sendBulk = useSendBulk();
  const accounts = data?.items ?? [];
  const [accountId, setAccountId] = useState("");
  const [includeProposal, setIncludeProposal] = useState(true);

  useEffect(() => {
    if (!accountId && accounts.length) {
      setAccountId((accounts.find((a) => a.is_default) ?? accounts[0]).id);
    }
  }, [accounts, accountId]);

  if (ids.length === 0) return null;

  return (
    <div className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-om-border-strong bg-om-bg2/95 px-3 py-2 shadow-2xl backdrop-blur">
      <span className="text-[12px] font-semibold">{ids.length} selected</span>
      <button
        onClick={onClear}
        className="grid size-6 place-items-center rounded-md text-om-muted hover:bg-white/[0.06] hover:text-om-text"
      >
        <X className="size-3.5" />
      </button>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {accounts.length === 0 ? (
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-1.5 text-[11px] text-om-muted hover:text-om-text"
          >
            <Settings2 className="size-3.5" /> Add a sending account first
          </Link>
        ) : (
          <>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-lg border border-om-border bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-om-dim outline-none focus:border-om-blue/60"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.from_email}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-1 text-[10.5px] text-om-muted">
              <input
                type="checkbox"
                checked={includeProposal}
                onChange={(e) => setIncludeProposal(e.target.checked)}
                className="size-3 accent-om-blue"
              />
              + proposal
            </label>
            <OmButton
              variant="solid"
              size="sm"
              disabled={sendBulk.isPending || !accountId}
              onClick={() =>
                sendBulk.mutate(
                  { lead_ids: ids, email_account_id: accountId, include_proposal: includeProposal },
                  { onSuccess: onClear },
                )
              }
            >
              {sendBulk.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
              Send outreach to {ids.length}
            </OmButton>
          </>
        )}
      </div>
    </div>
  );
}
