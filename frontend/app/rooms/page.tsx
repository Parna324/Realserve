"use client";

import { motion } from "framer-motion";
import { Braces, Code2, GitMerge, LogOut, Plus, RadioTower, Search, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createRoom, joinRoom, listRooms, type Room } from "@/lib/api";
import { getStoredUser, getToken, logout, type SessionUser } from "@/lib/auth";
import { getLanguageLabel, languageOptions } from "@/lib/languages";

const dashboardStats = [
  { label: "Merge engine", value: "Yjs CRDT" },
  { label: "Transport", value: "Socket.IO" },
  { label: "Access model", value: "Owner / Editor / Viewer" }
];

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }

    setUser(getStoredUser());

    listRooms()
      .then((data) => setRooms(data.rooms))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const language = String(formData.get("language") ?? "typescript");

    try {
      const { room } = await createRoom({ name, language });
      window.location.href = `/rooms/${room.slug}`;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create room");
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const slugOrUrl = String(formData.get("slug") ?? "");
    const slug = slugOrUrl.split("/").filter(Boolean).pop() ?? slugOrUrl;

    try {
      const { room } = await joinRoom(slug);
      window.location.href = `/rooms/${room.slug}`;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not join room");
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0D12] text-[#ECEEF3]" style={{ fontFamily: "var(--font-body)" }}>
      <header className="sticky top-0 z-30 border-b border-[#181C26] bg-[#0B0D12]/90 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: "var(--font-mono)" }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[#232838] bg-[#171B24]">
              <Braces className="h-4 w-4 text-[#F2994A]" />
            </span>
            <span><span className="text-[#F2994A]">collab</span><span className="text-[#868C9C]">/</span><span className="text-[#2DD4BF]">code</span></span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-[#868C9C]">
            <span className="hidden items-center gap-2 rounded-md border border-[#232838] bg-[#12151D] px-3 py-2 sm:flex">
              <UserRound className="h-4 w-4 text-[#2DD4BF]" />
              <span>{user?.name ?? "Workspace"}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={logout} title="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[360px_1fr]"
      >
        <div className="space-y-4">
          <form onSubmit={handleCreate} className="rounded-lg border border-[#232838] bg-[#12151D] p-5 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.85)]">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Plus className="h-4 w-4 text-[#F2994A]" />
              Create room
            </div>
            <div className="mt-4 space-y-4">
              <Input label="Room name" name="name" placeholder="Interview prep" required minLength={2} />
              <Select label="Language" name="language" defaultValue="typescript" required>
                {languageOptions.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.label}
                  </option>
                ))}
              </Select>
              <Button className="w-full" type="submit">
                <Plus className="h-4 w-4" />
                Create and open
              </Button>
            </div>
          </form>

          <form onSubmit={handleJoin} className="rounded-lg border border-[#232838] bg-[#12151D] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Search className="h-4 w-4 text-[#F2994A]" />
              Join room
            </div>
            <div className="mt-4 space-y-4">
              <Input label="Room ID or link" name="slug" placeholder="abc123" required />
              <Button className="w-full" variant="secondary" type="submit">
                Join as editor
              </Button>
            </div>
          </form>

          {error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}

          <section className="rounded-lg border border-[#232838] bg-[#12151D] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Code2 className="h-4 w-4 text-[#2DD4BF]" />
              Language coverage
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {languageOptions.slice(0, 12).map((language) => (
                <span key={language.id} className="rounded-md border border-[#232838] bg-[#0B0D12] px-2 py-1 text-xs text-[#868C9C]">
                  {language.label}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-[#868C9C]">
              Monaco syntax modes are available for the common frontend, backend, systems, scripting, and data formats used in technical interviews and pair programming.
            </p>
          </section>
        </div>

        <section>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
              Collaborative rooms
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Your live workspaces
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#868C9C]">
              Create a shared coding session, invite collaborators, and keep simultaneous edits converging through the same CRDT engine shown on the homepage.
            </p>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {dashboardStats.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-[#232838] bg-[#12151D] p-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
                  {stat.label}
                </p>
                <p className="mt-2 text-sm font-semibold">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-lg border border-[#232838] bg-[#12151D]" />
              ))
            ) : rooms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#232838] bg-[#12151D] p-8 text-center">
                <RadioTower className="mx-auto h-6 w-6 text-[#F2994A]" />
                <h2 className="mt-4 text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  No rooms yet
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#868C9C]">
                  Create your first room to open Monaco, persist the document in Postgres, and start broadcasting presence to teammates.
                </p>
              </div>
            ) : (
              rooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/rooms/${room.slug}`}
                  className="rounded-lg border border-[#232838] bg-[#12151D] p-5 shadow-[0_28px_70px_-55px_rgba(0,0,0,0.9)] transition duration-200 hover:-translate-y-0.5 hover:border-[#F2994A]/50 hover:bg-[#171B24]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold">{room.name}</h2>
                      <p className="mt-2 text-sm text-[#868C9C]">{getLanguageLabel(room.language)} / {room.role}</p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#868C9C]">
                        <span className="inline-flex items-center gap-1 rounded-md border border-[#232838] px-2 py-1">
                          <GitMerge className="h-3 w-3 text-[#2DD4BF]" />
                          CRDT sync
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md border border-[#232838] px-2 py-1">
                          <ShieldCheck className="h-3 w-3 text-[#F2994A]" />
                          {room.role}
                        </span>
                      </div>
                    </div>
                    <span className="rounded-md border border-[#232838] px-2 py-1 text-xs text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
                      {room.slug}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </motion.section>
    </main>
  );
}
