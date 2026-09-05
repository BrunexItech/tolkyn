"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/** Right-side sheet for detail views. */
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  width = 440,
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          style={{ width }}
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full max-w-[94vw] flex-col overflow-hidden border-l border-om-border-strong bg-om-bg2 shadow-2xl focus:outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-om-border px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-[14px] font-semibold tracking-tight">
                {title}
              </Dialog.Title>
              {subtitle != null && (
                <Dialog.Description className="truncate text-[11.5px] text-om-muted">
                  {subtitle}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="grid size-7 shrink-0 place-items-center rounded-lg text-om-muted transition-colors hover:bg-white/[0.06] hover:text-om-text">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="om-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">{children}</div>

          {footer != null && (
            <div className="flex items-center gap-2 border-t border-om-border px-4 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
