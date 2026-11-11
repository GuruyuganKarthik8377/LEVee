import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import FollowDollar from "@/components/track/FollowDollar";

export const metadata: Metadata = {
  title: "Follow your dollar | LEVee",
  description: "One donor's gift, from pledge to partner, with PayPal's fee and every decision along the way.",
};

export default function TrackPage() {
  return (
    <AppPage
      badge="Follow your dollar · Hurricane Helene replay"
      title="Where one *$10* gift goes"
      intro="Every step of one donor's gift: what was charged, what PayPal kept, who got the rest, and what they had to prove to get more."
    >
      <FollowDollar />
    </AppPage>
  );
}
