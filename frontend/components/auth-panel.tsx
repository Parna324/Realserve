"use client";

import { motion } from "framer-motion";
import { ArrowRight, Braces, CheckCircle2, GitMerge, Loader2, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthPanelProps = {
  mode: "login" | "signup";
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

function getAuthApiUrls() {
  const urls = [apiUrl, ""];

  if (typeof window !== "undefined") {
    urls.push(`${window.location.protocol}//${window.location.hostname}:4000`);
  }

  return Array.from(new Set(urls));
}

const authHighlights = [
  { icon: Radio, label: "Live rooms", text: "Create a workspace and stream every keystroke over WebSockets." },
  { icon: GitMerge, label: "CRDT merge", text: "Concurrent changes converge automatically without overwriting teammates." },
  { icon: ShieldCheck, label: "Role-aware access", text: "Owners, editors, and viewers are enforced from the API to the socket." }
];

export function AuthPanel({ mode }: AuthPanelProps) {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isSignup = mode === "signup";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    try {
      let response: Response | null = null;
      let connectionError: unknown = null;

      for (const baseUrl of getAuthApiUrls()) {
        try {
          response = await fetch(`${baseUrl}/api/auth/${mode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          break;
        } catch (error) {
          connectionError = error;
        }
      }

      if (!response) {
        throw connectionError ?? new TypeError("Could not reach API");
      }

      const data = await response.json().catch(() => {
        throw new Error("The API server returned an unexpected response. Make sure the backend and database are running.");
      });

      if (!response.ok) {
        throw new Error(data.error ?? "Authentication failed");
      }

      localStorage.setItem("collabcode.token", data.token);
      localStorage.setItem("collabcode.user", JSON.stringify(data.user));
      window.location.href = "/rooms";
    } catch (authError) {
      if (authError instanceof TypeError) {
        setError("Could not reach the API server. Make sure the backend is running on port 4000.");
      } else {
        setError(authError instanceof Error ? authError.message : "Authentication failed");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0D12] text-[#ECEEF3]" style={{ fontFamily: "var(--font-body)" }}>
      <div className="mx-auto grid min-h-screen max-w-6xl gap-10 px-6 py-8 lg:grid-cols-[1fr_440px] lg:items-center">
        <section className="hidden lg:block">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#232838] bg-[#171B24]">
              <Braces className="h-4 w-4 text-[#F2994A]" />
            </span>
            <span><span className="text-[#F2994A]">collab</span><span className="text-[#868C9C]">/</span><span className="text-[#2DD4BF]">code</span></span>
          </Link>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mt-20">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
              Secure collaboration entry
            </p>
            <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              Start a shared coding room with identity, roles, and live state.
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-7 text-[#868C9C]">
              CollabCode keeps the first interaction focused: sign in, create a room, invite teammates, and begin editing with conflict-free document sync.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-3">
            {authHighlights.map((item) => (
              <article key={item.label} className="rounded-lg border border-[#232838] bg-[#12151D] p-4 transition hover:border-[#F2994A]/40 hover:bg-[#171B24]">
                <div className="flex items-start gap-3">
                  <item.icon className="mt-0.5 h-4 w-4 text-[#F2994A]" />
                  <div>
                    <h2 className="text-sm font-semibold">{item.label}</h2>
                    <p className="mt-1 text-sm leading-6 text-[#868C9C]">{item.text}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full rounded-lg border border-[#232838] bg-[#12151D] p-6 shadow-[0_30px_70px_-35px_rgba(0,0,0,0.8)]"
        >
          <Link href="/" className="mb-8 flex items-center gap-2 text-sm font-semibold lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#232838] bg-[#171B24]">
              <Braces className="h-4 w-4 text-[#F2994A]" />
            </span>
            CollabCode
          </Link>

          <p className="text-[11px] uppercase tracking-[0.18em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
            {isSignup ? "Create account" : "Authenticate"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#868C9C]">
            {isSignup ? "Join the room system with a secure identity and create your first collaborative workspace." : "Continue to your protected room dashboard and active sessions."}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            {isSignup ? <Input label="Name" name="name" autoComplete="name" required minLength={2} /> : null}
            <Input label="Email" name="email" type="email" autoComplete="email" required />
            <Input label="Password" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} required minLength={isSignup ? 8 : 1} />
            {error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
            <Button className="w-full bg-[#F2994A] text-[#0B0D12] hover:bg-[#f5a862]" type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSignup ? "Create account" : "Log in"}
              {!isLoading ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-[#232838] bg-[#0B0D12] p-4 text-sm text-[#868C9C]">
            <div className="flex items-center gap-2 text-[#ECEEF3]">
              <CheckCircle2 className="h-4 w-4 text-[#2DD4BF]" />
              Production-minded defaults
            </div>
            <p className="mt-2 leading-6">JWT sessions, hashed passwords, role checks, and API-backed room membership are ready behind this screen.</p>
          </div>

          <p className="mt-6 text-center text-sm text-[#868C9C]">
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <Link className="font-medium text-[#F2994A] hover:text-[#f5a862]" href={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Log in" : "Create account"}
            </Link>
          </p>
        </motion.section>
      </div>
    </main>
  );
}
