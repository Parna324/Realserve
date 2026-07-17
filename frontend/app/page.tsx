"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Braces, Gauge, GitMerge, Layers, Menu, Radio, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Live merge demo — two collaborators typing into the same block concurrently
// ---------------------------------------------------------------------------
const LINE_A = "const total = cart.reduce(";
const LINE_B = "  (sum, item) => sum + item.price, 0);";

function LiveMergeDemo() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const raf = setInterval(() => {
      setA((prev) => Math.min(prev + 1, LINE_A.length));
      setB((prev) => Math.min(prev + 1, LINE_B.length));
    }, 55);
    return () => clearInterval(raf);
  }, []);

  useEffect(() => {
    if (a === LINE_A.length && b === LINE_B.length && !synced) {
      const t = setTimeout(() => setSynced(true), 300);
      return () => clearTimeout(t);
    }
  }, [a, b, synced]);

  useEffect(() => {
    if (synced) {
      const t = setTimeout(() => {
        setA(0);
        setB(0);
        setSynced(false);
      }, 1600);
      return () => clearTimeout(t);
    }
  }, [synced]);

  return (
    <div className="overflow-hidden rounded-lg border border-[#232838] bg-[#12151D] shadow-[0_0_0_1px_rgba(242,153,74,0.06),0_30px_60px_-30px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between border-b border-[#232838] bg-[#171B24]/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
          <span className="flex h-1.5 w-1.5 rounded-full bg-[#F2994A]" />
          ada.ts
        </div>
        <motion.span
          animate={{ opacity: synced ? 1 : 0 }}
          className="rounded-full border border-[#2DD4BF]/30 bg-[#2DD4BF]/10 px-2 py-0.5 text-[10px] tracking-wide text-[#2DD4BF]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          merged · 0 conflicts
        </motion.span>
      </div>
      <div className="space-y-3 p-5 text-[13px] leading-6" style={{ fontFamily: "var(--font-mono)" }}>
        <div className="flex">
          <span className="mr-3 select-none text-[#3A4152]">1</span>
          <span className="text-[#ECEEF3]">
            {LINE_A.slice(0, a)}
            <span className="animate-pulse text-[#F2994A]">▏</span>
          </span>
        </div>
        <div className="flex">
          <span className="mr-3 select-none text-[#3A4152]">2</span>
          <span className="text-[#ECEEF3]">
            {LINE_B.slice(0, b)}
            <span className="animate-pulse text-[#2DD4BF]">▏</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-[#232838] px-5 py-3 text-[11px] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#F2994A]" /> Ada — line 1</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#2DD4BF]" /> Kai — line 2</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Merge diagram — the page's signature: before / concurrent edits / after
// ---------------------------------------------------------------------------
function MergeDiagram() {
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
      <div className="rounded-lg border border-[#232838] bg-[#12151D] p-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
          Before
        </p>
        <code className="text-[13px] text-[#ECEEF3]" style={{ fontFamily: "var(--font-mono)" }}>
          let price = base;
        </code>
      </div>

      <ArrowRight className="mx-auto hidden h-4 w-4 text-[#3A4152] md:block" />

      <div className="space-y-2">
        <div className="rounded-lg border border-[#F2994A]/25 bg-[#F2994A]/[0.06] p-3">
          <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[#F2994A]" style={{ fontFamily: "var(--font-mono)" }}>
            Ada inserts at col 15
          </p>
          <code className="text-[12px] text-[#ECEEF3]" style={{ fontFamily: "var(--font-mono)" }}>
            {"* multiplier"}
          </code>
        </div>
        <div className="rounded-lg border border-[#2DD4BF]/25 bg-[#2DD4BF]/[0.06] p-3">
          <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[#2DD4BF]" style={{ fontFamily: "var(--font-mono)" }}>
            Kai inserts at col 15
          </p>
          <code className="text-[12px] text-[#ECEEF3]" style={{ fontFamily: "var(--font-mono)" }}>
            {"+ tax"}
          </code>
        </div>
      </div>

      <ArrowRight className="mx-auto hidden h-4 w-4 text-[#3A4152] md:block" />

      <div className="rounded-lg border border-[#232838] bg-[#12151D] p-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
          After — no conflict
        </p>
        <code className="text-[13px] leading-6 text-[#ECEEF3]" style={{ fontFamily: "var(--font-mono)" }}>
          let price = base{" "}
          <span className="border-b-2 border-[#F2994A] text-[#F2994A]">* multiplier</span>{" "}
          <span className="border-b-2 border-[#2DD4BF] text-[#2DD4BF]">+ tax</span>;
        </code>
      </div>
    </div>
  );
}

const features = [
  { icon: Radio, title: "Live rooms", text: "Every keystroke streams over a persistent WebSocket connection — no polling, no refresh." },
  { icon: GitMerge, title: "Conflict-free by design", text: "Room state is a CRDT document, so simultaneous edits always converge — never overwrite." },
  { icon: ShieldCheck, title: "Owner-controlled access", text: "Room owners set who can edit and who can only watch, enforced on every message." },
  { icon: Layers, title: "Scales past one server", text: "Redis Pub/Sub fans out edits across server instances, so rooms stay in sync under load." },
  { icon: Gauge, title: "Debounced persistence", text: "Documents live in Redis while active and commit to Postgres on an interval — not on every keystroke." },
  { icon: Users, title: "Presence built in", text: "See who's in the room, where their cursor is, and what they're editing, in real time." },
];

const steps = [
  {
    label: "01",
    title: "Create a room",
    text: "Spin up a workspace and get a shareable link. No setup, no installs — anyone with the link can join from a browser.",
  },
  {
    label: "02",
    title: "Edit together",
    text: "Everyone types into the same Monaco-powered editor. Cursors, selections, and changes are visible the moment they happen.",
  },
  {
    label: "03",
    title: "Merge, always",
    text: "Concurrent edits resolve automatically through CRDT sync — there's no 'last write wins,' and nothing is ever silently dropped.",
  },
];

const stack = ["Next.js", "Yjs (CRDT)", "Socket.io", "Redis Pub/Sub", "PostgreSQL", "Docker · ECS"];

const navLinks = [
  { href: "#merge", label: "Merge" },
  { href: "#features", label: "Features" },
  { href: "#stack", label: "Stack" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#232838] bg-[#12151D]">
        <Braces className="h-4 w-4 text-[#F2994A]" />
      </span>
      <span>
        <span className="text-[#F2994A]">collab</span>
        <span className="text-[#868C9C]">/</span>
        <span className="text-[#2DD4BF]">code</span>
      </span>
    </Link>
  );
}

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#080A0F] text-[#ECEEF3]" style={{ fontFamily: "var(--font-body)" }}>
      <div className="sticky top-0 z-40 border-b border-[#181C26]/90 bg-[#080A0F]/88 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
          <Logo />

          <div className="hidden items-center gap-6 text-sm text-[#868C9C] md:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="transition hover:text-[#ECEEF3]">
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 text-sm md:flex">
            <Link href="/login" className="text-[#868C9C] transition hover:text-[#ECEEF3]">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-[#F2994A] px-4 py-2 text-[13px] font-semibold text-[#0B0D12] transition hover:bg-[#f5a862]"
            >
              Start
            </Link>
          </div>

          <button
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[#232838] text-[#AEB4C2] md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </nav>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-[#181C26] md:hidden"
            >
              <div className="flex flex-col gap-1 px-6 py-4 sm:px-8">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md px-2 py-2.5 text-sm text-[#AEB4C2] transition hover:bg-[#12151D] hover:text-[#ECEEF3]"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="mt-2 flex items-center gap-3 border-t border-[#181C26] pt-4">
                  <Link href="/login" className="flex-1 rounded-md border border-[#232838] px-4 py-2.5 text-center text-sm text-[#AEB4C2]">
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    className="flex-1 rounded-md bg-[#F2994A] px-4 py-2.5 text-center text-sm font-semibold text-[#0B0D12]"
                  >
                    Start
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-auto max-w-6xl px-6 sm:px-8">
        {/* Hero */}
        <section className="dot-grid relative -mx-6 overflow-hidden px-6 py-16 sm:-mx-8 sm:px-8 lg:py-24">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_78%_20%,rgba(242,153,74,0.10),transparent_70%),radial-gradient(45%_45%_at_100%_60%,rgba(45,212,191,0.08),transparent_70%),linear-gradient(to_bottom,transparent,#080A0F_92%)]" />

          <div className="relative grid gap-12 lg:grid-cols-[1fr_460px] lg:items-center">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p
                className="mb-5 inline-flex items-center gap-2 rounded-md border border-[#232838] bg-[#12151D] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[#AEB4C2]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <Sparkles className="h-3.5 w-3.5 text-[#F2994A]" />
                Real-time collaborative editor
              </p>
              <h1
                className="text-[2.75rem] font-semibold leading-[1.08] tracking-tight sm:text-6xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Type at the same time.
                <br />
                Nothing gets lost.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#AEB4C2]">
                Two people can edit the same line at once. The document merges every
                keystroke automatically, so neither edit ever overwrites the other —
                no locking, no &ldquo;you&apos;re viewing an outdated version&rdquo; banners.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link
                  href="/signup"
                  className="flex items-center gap-2 rounded-md bg-[#F2994A] px-5 py-3 text-sm font-semibold text-[#0B0D12] shadow-[0_18px_45px_-24px_rgba(242,153,74,0.9)] transition hover:bg-[#f5a862]"
                >
                  Create a room <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#merge" className="text-sm text-[#868C9C] underline decoration-[#232838] underline-offset-4 transition hover:text-[#ECEEF3]">
                  See how merging works
                </a>
              </div>

              <div id="stack" className="mt-10 border-t border-[#181C26] pt-6">
                <span className="mb-3 block text-[10px] uppercase tracking-[0.14em] text-[#3A4152]" style={{ fontFamily: "var(--font-mono)" }}>
                  Built on
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {stack.map((item) => (
                    <span
                      key={item}
                      className="rounded-md border border-[#232838] bg-[#12151D] px-2.5 py-1 text-[11px] text-[#AEB4C2]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative rounded-lg border border-[#232838] bg-[#0E1117] p-3 shadow-[0_40px_90px_-55px_rgba(45,212,191,0.55)]"
            >
              <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[28px] bg-[radial-gradient(closest-side,rgba(242,153,74,0.12),transparent)] blur-2xl" />
              <LiveMergeDemo />
            </motion.div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-[#181C26] py-16">
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
            How it works
          </p>
          <h2 className="mb-10 max-w-xl text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            From an empty link to a shared, synced document in under a second.
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="border-t border-[#232838] pt-5"
              >
                <span className="text-xs text-[#3A4152]" style={{ fontFamily: "var(--font-mono)" }}>
                  {step.label}
                </span>
                <h3 className="mt-3 text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#868C9C]">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Signature: merge diagram */}
        <section id="merge" className="border-t border-[#181C26] py-16">
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
            How concurrent edits merge
          </p>
          <h2 className="mb-8 max-w-xl text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            Each edit remembers its position relative to the others — not just its row and column.
          </h2>
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <MergeDiagram />
          </motion.div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-[#181C26] py-16">
          <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
            What&apos;s handled for you
          </p>
          <h2 className="mb-10 max-w-xl text-2xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            The parts of real-time collaboration that are easy to get wrong.
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature, i) => (
              <motion.article
                key={feature.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="group rounded-lg border border-[#232838] bg-[#12151D] p-5 transition hover:border-[#F2994A]/45 hover:bg-[#171B24]"
              >
                <feature.icon className="mb-4 h-5 w-5 text-[#F2994A] transition group-hover:scale-110" />
                <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#868C9C]">{feature.text}</p>
              </motion.article>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-[#181C26] py-16">
          <div className="relative overflow-hidden rounded-lg border border-[#232838] bg-[#12151D] px-8 py-12 text-center shadow-[0_35px_90px_-70px_rgba(242,153,74,0.8)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(45,212,191,0.08),transparent_70%)]" />
            <div className="relative">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
                Open a room. Send the link. Start typing.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#868C9C]">
                No installs, no account required for guests — just a link and a shared editor.
              </p>
              <Link
                href="/signup"
                className="mt-7 inline-flex items-center gap-2 rounded-md bg-[#F2994A] px-5 py-3 text-sm font-medium text-[#0B0D12] transition hover:bg-[#f5a862]"
              >
                Create a room <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-[#181C26] py-8 text-xs text-[#868C9C]">
          <span style={{ fontFamily: "var(--font-mono)" }}>collab/code</span>
          <span>Built with Yjs, Redis, and Next.js</span>
        </footer>
      </div>
    </main>
  );
}
