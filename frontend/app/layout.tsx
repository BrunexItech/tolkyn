import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tolkyn.co.ke"),
  title: {
    default: "Tolkyn — Social media management, engagement & call center in one workspace",
    template: "%s · Tolkyn",
  },
  description:
    "Tolkyn is the all-in-one social media management platform: schedule and publish across every network, reply from a unified inbox, run a built-in call center, generate and score leads, and see what it all does to your reach and revenue.",
  applicationName: "Tolkyn",
  keywords: [
    "social media management",
    "social media scheduling tool",
    "unified social inbox",
    "social media management platform",
    "content calendar software",
    "lead generation software",
    "call center software",
    "Tolkyn",
  ],
  authors: [{ name: "Tolkyn" }],
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${outfit.variable} ${jetbrainsMono.variable}`}>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4200,
            style: {
              background: "#0a1020",
              color: "#e6ecfb",
              border: "1px solid rgba(86,118,214,0.28)",
              borderRadius: "10px",
              fontSize: "12.5px",
              padding: "10px 14px",
              maxWidth: "320px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
            },
            success: {
              style: { borderLeft: "2px solid #22c55e" },
              iconTheme: { primary: "#22c55e", secondary: "#0a1020" },
            },
            error: {
              style: { borderLeft: "2px solid #f0524b" },
              iconTheme: { primary: "#f0524b", secondary: "#0a1020" },
            },
          }}
        />
      </body>
    </html>
  );
}
