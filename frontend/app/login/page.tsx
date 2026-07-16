import type { Metadata } from "next";
import { AuthPanel } from "@/components/auth-panel";

export const metadata: Metadata = {
  title: "Log In"
};

export default function LoginPage() {
  return <AuthPanel mode="login" />;
}
