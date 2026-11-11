import IntroLoader from "@/components/IntroLoader";
import PillNav from "@/components/PillNav";
import Hero from "@/components/landing/Hero";
import BuiltOn from "@/components/landing/BuiltOn";
import Features from "@/components/landing/Features";
import Contrast from "@/components/landing/Contrast";
import AiBand from "@/components/landing/AiBand";
import HowItWorks from "@/components/landing/HowItWorks";
import Agents from "@/components/landing/Agents";
import NoSurprises from "@/components/landing/NoSurprises";
import TrustCards from "@/components/landing/TrustCards";
import Evidence from "@/components/landing/Evidence";
import ReplayTimeline from "@/components/landing/ReplayTimeline";
import Stats from "@/components/landing/Stats";
import Faq from "@/components/landing/Faq";
import Outro from "@/components/landing/Outro";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <>
      <IntroLoader />
      <PillNav />
      <main>
        <Hero />
        <BuiltOn />
        <Features />
        <Contrast />
        <AiBand />
        <HowItWorks />
        <Agents />
        <NoSurprises />
        <TrustCards />
        <Evidence />
        <ReplayTimeline />
        <Stats />
        <Faq />
        <Outro />
      </main>
      <Footer />
    </>
  );
}
