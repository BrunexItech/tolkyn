"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Centered dialog. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(94vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-om-border-strong bg-om-bg2 shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-om-border px-5 py-3.5">
            <div>
              <Dialog.Title className="text-[14px] font-semibold tracking-tight">
                {title}
              </Dialog.Title>
              {description != null && (
                <Dialog.Description className="mt-0.5 text-[11.5px] text-om-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="grid size-7 shrink-0 place-items-center rounded-lg text-om-muted transition-colors hover:bg-white/[0.06] hover:text-om-text">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="om-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer != null && (
            <div className="flex items-center justify-end gap-2 border-t border-om-border px-5 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
