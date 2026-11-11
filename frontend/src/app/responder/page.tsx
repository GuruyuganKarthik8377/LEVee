import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import ResponderConsole from "@/components/responder/ResponderConsole";

export const metadata: Metadata = {
  title: "Responder console | LEVee",
  description: "Allocations, proof status and payouts for every partner on the storm.",
};

export default function ResponderPage() {
  return (
    <AppPage
      status={false}
      replay={false}
      badge="Responder console"
      title="Allocations, proof and *payouts*"
      intro="See what the Allocator assigned, why it did, and what stands between each partner and their next tranche."
    >
      <ResponderConsole />
    </AppPage>
  );
}
