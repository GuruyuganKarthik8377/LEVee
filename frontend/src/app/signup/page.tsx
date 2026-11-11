import type { Metadata } from "next";
import SignupScreen from "@/components/auth/SignupScreen";
import { returnTo } from "@/lib/returnTo";

export const metadata: Metadata = {
  title: "Sign up | LEVee",
  description: "Create a LEVee account to pledge before the storm, or to receive funds as a local responder.",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ role?: string; next?: string }> }) {
  const { role, next } = await searchParams;
  return <SignupScreen initialRole={role === "responder" ? "responder" : "donor"} next={returnTo(next)} />;
}
