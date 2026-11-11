import type { Metadata } from "next";
import LoginScreen from "@/components/auth/LoginScreen";
import { returnTo } from "@/lib/returnTo";

export const metadata: Metadata = {
  title: "Log in | LEVee",
  description: "Log in to your LEVee donor account or responder console.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ role?: string; link?: string; next?: string }> }) {
  const { role, link, next } = await searchParams;
  return <LoginScreen initialRole={role === "responder" ? "responder" : "donor"} linkExpired={link === "expired"} next={returnTo(next)} />;
}
