import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Providers } from "@/components/om/Providers";

export const metadata: Metadata = {
  title: { absolute: "Tolkyn — Platform Control" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
