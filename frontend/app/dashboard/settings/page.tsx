"use client";

import { Settings } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { EmailAccounts } from "@/components/settings/EmailAccounts";

export default function SettingsPage() {
  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Settings"
        subtitle="Workspace, billing and sending"
        icon={<Settings />}
      />
      <Grid cols={2}>
        <EmailAccounts />
      </Grid>
    </div>
  );
}
