"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { OmButton } from "./OmButton";

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon — for destructive actions. */
  danger?: boolean;
}

/** Promise-based confirmation dialog — a real modal, never window.confirm().
 *
 *   const { confirm, dialog } = useConfirm();
 *   // render {dialog} once in the component
 *   if (await confirm({ title: "Delete this?", danger: true })) doIt();
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    setBusy(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  };

  const dialog = opts ? (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v && !busy) settle(false);
      }}
      title={
        <span className="flex items-center gap-2">
          {opts.danger && <AlertTriangle className="size-4 text-om-red" />}
          {opts.title}
        </span>
      }
      footer={
        <>
          <OmButton variant="ghost" size="sm" onClick={() => settle(false)} disabled={busy}>
            {opts.cancelLabel ?? "Cancel"}
          </OmButton>
          <OmButton
            variant={opts.danger ? "danger" : "solid"}
            size="md"
            onClick={() => {
              setBusy(true);
              settle(true);
            }}
            disabled={busy}
          >
            {opts.confirmLabel ?? "Confirm"}
          </OmButton>
        </>
      }
    >
      <div className="text-[12.5px] leading-relaxed text-om-dim">
        {opts.message ?? "This can't be undone."}
      </div>
    </Modal>
  ) : null;

  return { confirm, dialog };
}
