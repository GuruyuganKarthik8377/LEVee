import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import TwoStorms from "@/components/simulate/TwoStorms";

export const metadata: Metadata = {
  title: "Two storms simulator | LEVee",
  description: "Two storms and limited money. Propose a split, then see LEVee's fixed rules check it.",
};

export default function SimulatePage() {
  return (
    <AppPage
      badge="Simulator · sample data"
      title="Two storms at once. Try to *break* the rules"
      intro="Set a split the way the Allocator would, including a bad one. These are the Policy Engine's real rules, so you can see what AI is and isn't allowed to do."
      status={false}
      replay={false}
    >
      <TwoStorms />
    </AppPage>
  );
}
