import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import DonorHome from "@/components/donor/DonorHome";

export const metadata: Metadata = {
  title: "Your notices | LEVee",
  description: "Pre-charge notices with a one tap skip, receipts, and where your money went.",
};

export default function DonorPage() {
  return (
    <AppPage
      badge="Donor app · sandbox"
      // A logged-in donor's page shows their own records, so the replay's clock would mislead here.
      status={false}
      title="A notice before every *charge*"
      intro="You always hear what is about to happen, with a one tap skip. Afterwards, you can trace every cent."
    >
      <DonorHome />
    </AppPage>
  );
}
