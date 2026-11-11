"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/app/ui";
import PillButton from "@/components/ui/PillButton";
import DonorScreen from "./DonorScreen";
import MyMoney from "./MyMoney";

/** A logged-in donor sees their own pledge and money. Anyone else sees the sample donor from the Helene replay, labelled as such. */
export default function DonorHome() {
  const [view, setView] = useState<"loading" | "mine" | "sample">("loading");

  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { account?: { role?: string } | null } | null) => {
        const role = data?.account?.role;
        if (live) setView(role === "donor" || role === "ops" ? "mine" : "sample");
      })
      .catch(() => live && setView("sample"));
    return () => {
      live = false;
    };
  }, []);

  if (view === "loading") return <Card>Loading…</Card>;
  if (view === "mine") return <MyMoney />;
  return (
    <div className="space-y-6">
      <Card pad="p-5" className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-[60ch] text-[15px] leading-relaxed text-body">
          This is a sample donor in the Hurricane Helene replay. Log in as a donor to see your own pledge, notices and PayPal receipts.
        </p>
        <PillButton href="/login?next=%2Fdonor">Log in</PillButton>
      </Card>
      <DonorScreen />
    </div>
  );
}
