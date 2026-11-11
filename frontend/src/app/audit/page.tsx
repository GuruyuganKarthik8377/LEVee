import type { Metadata } from "next";
import { AppPage } from "@/components/app/ui";
import AuditLog from "@/components/audit/AuditLog";

export const metadata: Metadata = {
  title: "Public audit log | LEVee",
  description: "Every LEVee decision with its inputs, its reasoning and the transaction it produced.",
};

export default function AuditPage() {
  return (
    <AppPage
      badge="Public audit log · Hurricane Helene replay"
      title="Every decision, in the *open*"
      intro="How every decision was made: what each agent saw and advised, the rule that acted on it, and the payment it produced. Open any entry for the details."
    >
      <AuditLog />
    </AppPage>
  );
}
