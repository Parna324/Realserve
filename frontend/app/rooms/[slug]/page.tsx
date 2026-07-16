"use client";

import dynamic from "next/dynamic";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Room } from "@/lib/api";
import { getRoom, joinRoom } from "@/lib/api";
import { getToken } from "@/lib/auth";

const CollaborativeEditor = dynamic(
  () => import("@/components/collaborative-editor").then((mod) => mod.CollaborativeEditor),
  { ssr: false }
);

export default function RoomPage({ params }: { params: { slug: string } }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }

    getRoom(params.slug)
      .catch(() => joinRoom(params.slug))
      .then((data) => setRoom(data.room))
      .catch((requestError) => setError(requestError.message));
  }, [params.slug]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0D12] px-6 text-[#ECEEF3]" style={{ fontFamily: "var(--font-body)" }}>
        <div className="max-w-md rounded-xl border border-[#232838] bg-[#12151D] p-6 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-[#F2994A]" />
          <h1 className="mt-4 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Room unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#868C9C]">{error}</p>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B0D12] px-6 text-[#ECEEF3]" style={{ fontFamily: "var(--font-body)" }}>
        <div className="w-full max-w-4xl rounded-xl border border-[#232838] bg-[#12151D] p-6">
          <div className="flex items-center gap-2 text-sm text-[#868C9C]">
            <Loader2 className="h-4 w-4 animate-spin text-[#F2994A]" />
            Loading collaborative room
          </div>
          <div className="mt-6 h-72 animate-pulse rounded-lg border border-[#232838] bg-[#0B0D12]" />
        </div>
      </main>
    );
  }

  return <CollaborativeEditor room={room} />;
}
