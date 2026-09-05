import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { Hero } from "@/components/marketing/Hero";
import { LogoStrip } from "@/components/marketing/LogoStrip";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { FeatureSection } from "@/components/marketing/FeatureSection";
import { StatStrip } from "@/components/marketing/StatStrip";
import { CtaBand } from "@/components/marketing/CtaBand";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { StructuredData } from "@/components/marketing/StructuredData";

export default function LandingPage() {
  return (
    <div className="relative">
      <StructuredData />
      <MarketingHeader />
      <main>
        <Hero />
        <LogoStrip />
        <HowItWorks />
        <FeatureSection />
        <StatStrip />
        <CtaBand />
      </main>
      <MarketingFooter />
    </div>
  );
}
