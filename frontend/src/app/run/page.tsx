import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import LiveRun from "@/components/run/LiveRun";

export const metadata: Metadata = {
  title: "Live PayPal demo | LEVee",
  description: "Run a donation from start to finish, with real PayPal sandbox charges and payouts.",
};

export default function RunPage() {
  return (
    <AppPage
      badge="Live demo · PayPal sandbox"
      title="Watch the money *really* move"
      intro="Every charge and payout here is a real PayPal sandbox transaction you can look up. The money is test money, and the storm is a replay of Hurricane Helene with sample partners."
      status={false}
      replay={false}
    >
      <LiveRun />
    </AppPage>
  );
}
