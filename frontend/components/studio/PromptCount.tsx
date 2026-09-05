"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { promptIssue } from "./limits";

/** Character counter + inline "too long" warning for a prompt field. */
export function PromptCount({
  value,
  limit,
  hint,
}: {
  value: string;
  limit: number;
  hint?: string;
}) {
  const issue = promptIssue(value, limit);
  const over = value.length > limit;
  const near = !over && value.length > limit * 0.9;

  return (
    <div className="mt-1 space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-om-faint">{hint}</span>
        <span className={cn(over ? "text-om-red" : near ? "text-om-amber" : "text-om-faint")}>
          {value.length.toLocaleString()}/{limit.toLocaleString()}
        </span>
      </div>
      {issue && value.length > limit && (
        <div className="flex items-center gap-1 text-[10px] text-om-red">
          <AlertTriangle className="size-3 shrink-0" />
          {issue}
        </div>
      )}
    </div>
  );
}
