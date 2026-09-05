import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

export type OmButtonVariant = "solid" | "subtle" | "outline" | "ghost" | "danger";
export type OmButtonSize = "xs" | "sm" | "md";

const VARIANT: Record<OmButtonVariant, string> = {
  solid:
    "bg-om-blue text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)] hover:bg-[#5c85ff]",
  subtle: "bg-om-blue/12 text-om-blue hover:bg-om-blue/18",
  outline:
    "border border-om-border-strong text-om-dim hover:border-om-blue/60 hover:text-om-text",
  ghost: "text-om-muted hover:bg-white/[0.05] hover:text-om-text",
  danger: "border border-om-red/30 text-om-red hover:bg-om-red/10",
};

const SIZE: Record<OmButtonSize, string> = {
  xs: "h-6 gap-1 px-2 text-[11px] [&_svg]:size-3",
  sm: "h-7 gap-1.5 px-2.5 text-[12px] [&_svg]:size-3.5",
  md: "h-8 gap-1.5 px-3 text-[12.5px] [&_svg]:size-4",
};

interface OmButtonProps extends ComponentProps<"button"> {
  variant?: OmButtonVariant;
  size?: OmButtonSize;
  asChild?: boolean;
}

export function OmButton({
  variant = "subtle",
  size = "sm",
  asChild,
  className,
  ...props
}: OmButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-om-blue/40 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}
