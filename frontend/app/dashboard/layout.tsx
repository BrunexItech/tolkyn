import type { ReactNode } from "react";
import { SessionProvider } from "@/components/om/session";
import { Providers } from "@/components/om/Providers";
import { AppShell } from "@/components/om/shell/AppShell";
import { TermsGate } from "@/components/legal/TermsGate";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <SessionProvider>
        <TermsGate>
          <AppShell>{children}</AppShell>
        </TermsGate>
      </SessionProvider>
    </Providers>
  );
}
