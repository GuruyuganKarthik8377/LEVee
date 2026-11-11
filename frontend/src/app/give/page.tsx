import type { Metadata } from "next";
import Link from "next/link";
import { AppPage } from "@/components/app/ui";
import GiveNow from "@/components/give/GiveNow";

export const metadata: Metadata = {
  title: "Give now | LEVee",
  description: "Give any amount through PayPal. Your gift joins LEVee's Reserve and goes out with the next storm that meets the published rules.",
};

export default function GivePage() {
  return (
    <AppPage
      badge="Give now · PayPal sandbox"
      title="Give *now* for the next storm"
      intro="Pay once with PayPal, and your gift waits in a shared Reserve until a storm meets the rules."
      status={false}
      replay={false}
      actions={
        <p className="text-[15px] text-body">
          Prefer to be charged only when a storm comes?{" "}
          <Link href="/pledge" className="font-semibold text-link hover:underline">
            Make a pledge
          </Link>
        </p>
      }
    >
      <GiveNow />
    </AppPage>
  );
}
