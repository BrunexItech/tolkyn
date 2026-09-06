"use client";

import { Settings } from "lucide-react";
import { SectionHeading } from "@/components/om/primitives/SectionHeading";
import { Grid } from "@/components/om/primitives/Grid";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { SecurityCard } from "@/components/settings/SecurityCard";
import { EmailAccounts } from "@/components/settings/EmailAccounts";

export default function SettingsPage() {
  return (
    <div className="om-anim-rise space-y-3">
      <SectionHeading
        title="Settings"
        subtitle="Your profile, password and sending accounts"
        icon={<Settings />}
      />
      <Grid cols={2}>
        <ProfileCard />
        <SecurityCard />
      </Grid>
      <Grid cols={2}>
        <EmailAccounts />
      </Grid>
    </div>
  );
}
