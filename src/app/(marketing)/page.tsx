import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Audiences } from "./_components/audiences";
import { BeforeAfter } from "./_components/before-after";
import { CandidateExperience } from "./_components/candidate-experience";
import { ClosingCta } from "./_components/closing-cta";
import { ContactSection } from "./_components/contact-section";
import { DataProtection } from "./_components/data-protection";
import { Faq } from "./_components/faq";
import { FeatureDetails } from "./_components/feature-details";
import { FloatingCta } from "./_components/floating-cta";
import { GettingStarted } from "./_components/getting-started";
import { Hero } from "./_components/hero";
import { LandingJsonLd } from "./_components/json-ld";
import { MoreFeatures } from "./_components/more-features";
import { PainPoints } from "./_components/pain-points";
import { Steps } from "./_components/steps";
import { Workload } from "./_components/workload";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Home.meta");
  return {
    title: { absolute: t("title") },
    description: t("description"),
    alternates: { canonical: "/" },
  };
}

// Section structure follows docs/01 §3.1 (functionally); copy and visuals are mask0's own.
export default function HomePage() {
  return (
    <>
      <LandingJsonLd />
      <Hero />
      <PainPoints />
      <Workload />
      <Steps />
      <FeatureDetails />
      <BeforeAfter />
      <MoreFeatures />
      <Audiences />
      <CandidateExperience />
      <GettingStarted />
      <DataProtection />
      <Faq />
      <ContactSection />
      <ClosingCta />
      <FloatingCta />
    </>
  );
}
