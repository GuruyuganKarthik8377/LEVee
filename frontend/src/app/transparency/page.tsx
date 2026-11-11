import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import OpenBooks from "@/components/transparency/OpenBooks";

export const metadata: Metadata = {
  title: "Open books | LEVee",
  description: "LEVee's money, published rules and every forecast it read for Hurricane Helene, with donor names hidden.",
};

export default function TransparencyPage() {
  return (
    <AppPage
      badge="Open books · Hurricane Helene replay"
      title="Nothing to take on *trust*"
      intro="What came in, what went out, the rules that decided it, and every forecast those rules saw. Donor names are never shown."
    >
      <OpenBooks />
    </AppPage>
  );
}
