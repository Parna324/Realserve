import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth-panel";

export const metadata: Metadata = {
  title: "Sign Up"
};

export default function SignupPage() {
  return <AuthPanel mode="signup" />;
}
