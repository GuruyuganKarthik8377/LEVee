import type { Metadata } from "next";
import ResetPasswordScreen from "@/components/auth/ResetPasswordScreen";

export const metadata: Metadata = {
  title: "Choose a new password | LEVee",
  description: "Set a new password for your LEVee account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordScreen />;
}
