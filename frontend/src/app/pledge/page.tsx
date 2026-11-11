import type { Metadata } from "next";
import Link from "next/link";
import PillNav from "@/components/PillNav";
import Footer from "@/components/landing/Footer";
import PledgeFlow from "@/components/pledge/PledgeFlow";
import PledgeDetails from "@/components/pledge/PledgeDetails";
import FundsRaised from "@/components/pledge/FundsRaised";
import { HELENE } from "@/fixtures/helene";

export const metadata: Metadata = {
  title: "Pledge | LEVee",
  description: "Describe your pledge in plain words. LEVee turns it into a pledge card and only charges when a published playbook is met.",
};

export default function PledgePage() {
  return (
    <>
      <PillNav base="/" />
      <main className="bg-paper pt-28">
        <p className="mx-auto mb-3 max-w-6xl px-4 text-[15px] text-body md:px-6">
          Rather give once, right now?{" "}
          <Link href="/give" className="font-semibold text-link hover:underline">
            Give any amount with PayPal
          </Link>
        </p>
        <PledgeFlow />
        <FundsRaised event={HELENE} />
        <PledgeDetails />
      </main>
      <Footer />
    </>
  );
}
