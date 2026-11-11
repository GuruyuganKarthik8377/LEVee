import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import ProofUpload from "@/components/responder/ProofUpload";

export const metadata: Metadata = {
  title: "Upload proof | LEVee",
  description: "Partners upload distribution lists, photos and receipts for the Verifier to check.",
};

export default function ProofPage() {
  return (
    <AppPage
      status={false}
      replay={false}
      badge="Responder console · proof"
      title="Show what the money *did*"
      intro="Upload your distribution list, photos and receipts. The Verifier passes the set, flags part of it, or sends it to a person."
    >
      <ProofUpload />
    </AppPage>
  );
}
