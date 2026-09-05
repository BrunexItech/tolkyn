import type { ReactNode } from "react";
import { Card } from "@/components/om/primitives/Card";
import { EmptyState } from "@/components/om/primitives/EmptyState";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Hammer } from "lucide-react";

/** Placeholder for panels not yet built out. Keeps every route navigable. */
export function PanelStub({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="om-anim-rise">
      <SectionHeading title={title} subtitle={subtitle} icon={icon} />
      <Card>
        <EmptyState icon={<Hammer />} title={`${title} — in progress`}>
          This screen is wired into navigation and the Tolkyn design system. Its full
          layout is being built in the current phase.
        </EmptyState>
      </Card>
    </div>
  );
}
