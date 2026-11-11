import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import OpsScreen from "@/components/ops/OpsScreen";
import ResponderReview from "@/components/ops/ResponderReview";

export const metadata: Metadata = {
  title: "Ops review | LEVee",
  description: "Approve large allocations and review partial or human Verifier verdicts.",
};

export default function OpsPage() {
  return (
    <AppPage
      badge="Ops · sandbox"
      title="People review what rules *cannot*"
      intro="Large allocations need one click, and proof the Verifier could not clear comes here. Everything you decide goes on the public log."
    >
      <ResponderReview />
      <OpsScreen />
    </AppPage>
  );
}
