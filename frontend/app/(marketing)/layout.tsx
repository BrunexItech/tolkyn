import type { Metadata } from "next";

const TITLE = "Tolkyn — Social media management, engagement & call center in one workspace";
const DESCRIPTION =
  "Schedule content across every network, reply from one inbox, run a built-in call center, generate leads and track your CRM — all in one place. See what it does to your reach and revenue.";

export const metadata: Metadata = {
  // This page's own title IS the full brand line — bypass the root layout's
  // "%s · Tolkyn" template with `absolute`, or it renders doubled up.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://tolkyn.co.ke" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://tolkyn.co.ke",
    siteName: "Tolkyn",
    type: "website",
    locale: "en_US",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Tolkyn" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt font-sans">
      {/* keep the page bright past the footer, and never scroll sideways */}
      <style>{`html,body{background:#0b1120;overflow-x:hidden}`}</style>
      <div className="mkt-bg" aria-hidden />
      <div className="mkt-grid" aria-hidden />
      {children}
    </div>
  );
}
