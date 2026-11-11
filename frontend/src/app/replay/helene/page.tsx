import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import ReplayScreen from "@/components/replay/ReplayScreen";

export const metadata: Metadata = {
  title: "Helene replay | LEVee",
  description: "A replay of Hurricane Helene, a past storm: the forecast, the playbook, the charges and the payouts, using sandbox money and sample partners.",
};

export default function ReplayPage() {
  return (
    <AppPage
      badge="Replay · Hurricane Helene, September 2024"
      status={false}
      title="A *replay* of Hurricane Helene"
      intro="Press play to step through how forecasts and fixed rules would have moved money."
    >
      <ReplayScreen />
    </AppPage>
  );
}
