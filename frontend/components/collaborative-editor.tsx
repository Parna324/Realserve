"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Braces,
  CheckCircle2,
  Code2,
  Copy,
  Eye,
  FileCode2,
  GitMerge,
  Loader2,
  Minus,
  PanelLeft,
  Plus,
  RadioTower,
  Settings2,
  ShieldCheck,
  Terminal,
  Type,
  UsersRound,
  Wifi,
  WifiOff,
  WrapText
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonacoBinding } from "y-monaco";
import type { editor, IDisposable } from "monaco-editor";
import type { Room, RoomFile } from "@/lib/api";
import { listFiles } from "@/lib/api";
import { getStoredUser, getToken } from "@/lib/auth";
import { SocketYjsProvider } from "@/lib/collab-provider";
import { getLanguageLabel } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { FileTree } from "@/components/file-tree";
import { OutputPanel } from "@/components/output-panel";

type CollaborativeEditorProps = { room: Room };
type PresenceUser = { name: string; color: string };
type ActivePanel = "files" | "session" | "run" | "settings";
type ConnectionStatus = "connecting" | "connected" | "disconnected";

const palette = ["#38BDF8", "#34D399", "#FBBF24", "#F472B6", "#A78BFA", "#FB923C", "#E879F9"];
function colorFromName(name: string) {
  return palette[name.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % palette.length];
}

export function CollaborativeEditor({ room }: CollaborativeEditorProps) {
  // ── Stable refs (not reactive) ───────────────────────────────────────────
  const editorRef   = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef   = useRef<typeof import("monaco-editor") | null>(null);
  const providerRef = useRef<SocketYjsProvider | null>(null);
  const bindingRef  = useRef<MonacoBinding | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activePanel,       setActivePanel]       = useState<ActivePanel>("files");
  const [connectionStatus,  setConnectionStatus]  = useState<ConnectionStatus>("connecting");
  const [isReady,           setIsReady]           = useState(false);
  const [isSwitching,       setIsSwitching]       = useState(false);
  const [initError,         setInitError]         = useState("");
  const [charCount,         setCharCount]         = useState(room.snapshot.length);
  const [cursorPosition,    setCursorPosition]    = useState({ line: 1, column: 1 });
  const [role,              setRole]              = useState(room.role);
  const [presence,          setPresence]          = useState<PresenceUser[]>([]);
  const [isSidebarOpen,     setIsSidebarOpen]     = useState(true);
  const [fontSize,          setFontSize]          = useState(14);
  const [minimapEnabled,    setMinimapEnabled]    = useState(false);
  const [wordWrapEnabled,   setWordWrapEnabled]   = useState(false);
  const [copied,            setCopied]            = useState(false);

  // ── File system state ────────────────────────────────────────────────────
  const [files,          setFiles]          = useState<RoomFile[]>([]);
  const [activeFileId,   setActiveFileId]   = useState<string>(room.document_id);
  const [activeLanguage, setActiveLanguage] = useState(room.language);

  const currentUser = useMemo(() => getStoredUser(), []);
  const userColor   = colorFromName(currentUser?.name ?? "Guest");
  const statusColor =
    connectionStatus === "connected"   ? "text-[#2DD4BF]"  :
    connectionStatus === "connecting"  ? "text-[#F2994A]"  : "text-red-300";

  // ── Load file list ────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    try {
      const res = await listFiles(room.slug);
      setFiles(res?.files ?? []);
    } catch { /* silent */ }
  }, [room.slug]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ── Core bind function — called directly, never via useEffect ────────────
  // This avoids the race where the effect fires before Monaco mounts.
  async function bindFile(
    fileId: string,
    language: string,
    provider: SocketYjsProvider,
    ed: editor.IStandaloneCodeEditor,
    monaco: typeof import("monaco-editor")
  ) {
    setIsSwitching(true);
    setIsReady(false);
    setInitError("");

    // Tear down old binding first
    bindingRef.current?.destroy();
    bindingRef.current = null;

    const response = await provider.connect(fileId);

    if (!response.ok) {
      setInitError(response.error ?? "Failed to join file");
      setIsSwitching(false);
      return;
    }

    setRole(response.role);
    ed.updateOptions({ readOnly: response.role === "viewer" });

    const model = ed.getModel();
    if (!model) { setIsSwitching(false); return; }

    // Update language for the new file
    monaco.editor.setModelLanguage(model, language);
    setActiveLanguage(language);
    setActiveFileId(fileId);

    // Bind Yjs doc to Monaco model — this is what renders remote cursors too
    const yText = provider.doc.getText("monaco");
    bindingRef.current = new MonacoBinding(
      yText,
      model,
      new Set([ed as editor.IStandaloneCodeEditor]),
      provider.awareness
    );

    // Keep presence list in sync with awareness
    const syncPresence = () => {
      const users = Array.from(provider.awareness.getStates().values())
        .map((s) => s.user as PresenceUser | undefined)
        .filter((u): u is PresenceUser => Boolean(u));
      setPresence(users);
    };
    provider.awareness.on("change", syncPresence);
    syncPresence();

    setCharCount(ed.getValue().length);
    setIsSwitching(false);
    setIsReady(true);
  }

  // ── Monaco mount — creates provider then immediately binds first file ────
  const handleMount: OnMount = async (mountedEditor, monaco) => {
    const token = getToken();
    if (!token || !currentUser) { window.location.href = "/login"; return; }

    editorRef.current  = mountedEditor as editor.IStandaloneCodeEditor;
    monacoRef.current  = monaco;

    // Cursor + char-count listeners
    disposablesRef.current.push(
      mountedEditor.onDidChangeCursorPosition((e) =>
        setCursorPosition({ line: e.position.lineNumber, column: e.position.column })
      ),
      mountedEditor.onDidChangeModelContent(() =>
        setCharCount(mountedEditor.getValue().length)
      )
    );

    // Editor appearance
    mountedEditor.updateOptions({
      minimap:                  { enabled: minimapEnabled },
      fontSize,
      lineHeight:               22,
      padding:                  { top: 16, bottom: 16 },
      smoothScrolling:          true,
      wordWrap:                 wordWrapEnabled ? "on" : "off",
      cursorSmoothCaretAnimation: "on",
      fontLigatures:            true,
      renderLineHighlight:      "all",
      roundedSelection:         false,
      scrollBeyondLastLine:     false,
      tabSize:                  2,
      automaticLayout:          true
    });

    // Create one SocketYjsProvider per room (socket stays alive across file switches)
    const provider = new SocketYjsProvider({
      slug:  room.slug,
      token,
      user:  { name: currentUser.name, color: userColor }
    });
    providerRef.current = provider;

    provider.socket.on("connect",       () => setConnectionStatus("connected"));
    provider.socket.on("disconnect",    () => setConnectionStatus("disconnected"));
    provider.socket.on("connect_error", () => setConnectionStatus("disconnected"));

    // Live file-tree updates pushed by other users
    provider.socket.on("files:changed", ({ slug }: { slug: string }) => {
      if (slug === room.slug) loadFiles();
    });

    provider.socket.on("presence:user-joined", (user: PresenceUser) => {
      setPresence((prev) =>
        prev.some((u) => u.name === user.name) ? prev : [...prev, user]
      );
    });

    setPresence([{ name: currentUser.name, color: userColor }]);

    // ↓ Bind immediately — no useEffect, no race condition
    await bindFile(room.document_id, room.language, provider, mountedEditor as editor.IStandaloneCodeEditor, monaco);
  };

  // ── Switch file when user clicks tree ────────────────────────────────────
  async function switchFile(file: RoomFile) {
    if (file.id === activeFileId) return;
    const provider = providerRef.current;
    const ed       = editorRef.current;
    const monaco   = monacoRef.current;
    if (!provider || !ed || !monaco) return;
    await bindFile(file.id, file.language, provider, ed, monaco);
  }

  // ── Sync settings ─────────────────────────────────────────────────────────
  useEffect(() => {
    editorRef.current?.updateOptions({
      fontSize,
      minimap:  { enabled: minimapEnabled },
      wordWrap: wordWrapEnabled ? "on" : "off"
    });
  }, [fontSize, minimapEnabled, wordWrapEnabled]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
      bindingRef.current?.destroy();
      providerRef.current?.destroy();
    };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/rooms/${room.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }
  async function formatDocument() {
    await editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }
  function clampFontSize(n: number) { setFontSize(Math.min(22, Math.max(12, n))); }
  function getCode() { return editorRef.current?.getValue() ?? ""; }

  const activeFile = files.find((f) => f.id === activeFileId);
  const activeFileName = activeFile?.path ?? room.name;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main
      className="flex h-screen min-h-[720px] flex-col overflow-hidden bg-[#0B0D12] text-[#ECEEF3]"
      style={{ fontFamily: "var(--font-body)" }}
    >
      {/* Header */}
      <header className="flex min-h-16 items-center justify-between border-b border-[#181C26] bg-[#0B0D12]/95 px-4 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/rooms" aria-label="Back to rooms"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#232838] bg-[#171B24] sm:flex">
            <Braces className="h-4 w-4 text-[#F2994A]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{room.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#868C9C]">
              <span>{getLanguageLabel(activeLanguage)}</span>
              <span className="text-[#3A4152]">/</span>
              <span className="capitalize">{role}</span>
              <span className="text-[#3A4152]">/</span>
              <span className={`inline-flex items-center gap-1 ${statusColor}`}>
                {connectionStatus === "disconnected"
                  ? <WifiOff className="h-3 w-3" />
                  : <Wifi  className="h-3 w-3" />}
                {connectionStatus}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="sm" onClick={() => setIsSidebarOpen((v) => !v)} title="Toggle panels">
            <PanelLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={formatDocument} title="Format document">
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">Format</span>
          </Button>

          {/* Avatar stack */}
          <div className="hidden items-center -space-x-2 sm:flex">
            {presence.slice(0, 6).map((user) => (
              <motion.span
                key={`${user.name}-${user.color}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0B0D12] text-xs font-bold shadow-md"
                style={{ backgroundColor: user.color, color: "#080A0F" }}
                title={user.name}
              >
                {user.name.charAt(0).toUpperCase()}
              </motion.span>
            ))}
          </div>

          <Button variant="secondary" size="sm" onClick={copyLink}>
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
          </Button>
        </div>
      </header>

      <div className="border-b border-[#181C26] bg-[#0B0D12] lg:hidden">
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          {([
            ["files",    FileCode2,  "Files"],
            ["session",  UsersRound, "Team"],
            ["run",      Terminal,   "Run"],
            ["settings", Settings2,  "Settings"],
          ] as const).map(([panel, Icon, label]) => (
            <button
              key={panel}
              type="button"
              className={`flex h-9 items-center justify-center gap-1 rounded-md text-xs transition ${
                activePanel === panel && isSidebarOpen
                  ? "bg-[#171B24] text-[#F2994A]"
                  : "text-[#868C9C] hover:bg-[#12151D] hover:text-[#ECEEF3]"
              }`}
              onClick={() => {
                setActivePanel(panel);
                setIsSidebarOpen((open) => activePanel === panel ? !open : true);
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden min-[420px]:inline">{label}</span>
            </button>
          ))}
        </div>

        {isSidebarOpen && (
          <div className="max-h-[42vh] overflow-y-auto border-t border-[#181C26] bg-[#12151D] p-4">
            {activePanel === "files" && (
              <FileTree
                slug={room.slug}
                files={files}
                activeFileId={activeFileId}
                canEdit={role === "owner" || role === "editor"}
                onFileSelect={switchFile}
                onFilesChanged={loadFiles}
              />
            )}

            {activePanel === "session" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UsersRound className="h-4 w-4 text-[#F2994A]" /> Connected
                </div>
                <div className="grid gap-2">
                  {presence.map((user) => (
                    <div key={`${user.name}-${user.color}`} className="flex items-center justify-between rounded-md border border-[#232838] bg-[#0B0D12] p-3 text-sm">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: user.color }} />
                        <span className="truncate">{user.name}</span>
                      </span>
                      <span className="text-xs text-[#868C9C]">live</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activePanel === "run" && (
              <div className="rounded-md border border-[#232838] bg-[#0B0D12] p-4 text-sm leading-6 text-[#868C9C]">
                <div className="mb-2 flex items-center gap-2 font-semibold text-[#ECEEF3]">
                  <Terminal className="h-4 w-4 text-[#F2994A]" /> Code runner
                </div>
                Use the run button in the output panel below the editor. The active language is {getLanguageLabel(activeLanguage)}.
              </div>
            )}

            {activePanel === "settings" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Type className="h-4 w-4 text-[#F2994A]" /> Editor preferences
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => clampFontSize(fontSize - 1)}><Minus className="h-4 w-4" /></Button>
                  <span className="w-14 text-center text-sm" style={{ fontFamily: "var(--font-mono)" }}>{fontSize}px</span>
                  <Button variant="secondary" size="sm" onClick={() => clampFontSize(fontSize + 1)}><Plus className="h-4 w-4" /></Button>
                </div>
                <label className="flex items-center justify-between rounded-md border border-[#232838] bg-[#0B0D12] p-3 text-sm">
                  <span className="flex items-center gap-2"><WrapText className="h-4 w-4 text-[#2DD4BF]" />Word wrap</span>
                  <input type="checkbox" checked={wordWrapEnabled} onChange={(e) => setWordWrapEnabled(e.target.checked)} className="h-4 w-4 accent-[#F2994A]" />
                </label>
                <label className="flex items-center justify-between rounded-md border border-[#232838] bg-[#0B0D12] p-3 text-sm">
                  <span className="flex items-center gap-2"><PanelLeft className="h-4 w-4 text-[#2DD4BF]" />Minimap</span>
                  <input type="checkbox" checked={minimapEnabled} onChange={(e) => setMinimapEnabled(e.target.checked)} className="h-4 w-4 accent-[#F2994A]" />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className={`grid min-h-0 flex-1 overflow-hidden ${isSidebarOpen ? "lg:grid-cols-[56px_300px_1fr]" : "lg:grid-cols-[56px_1fr]"}`}>
        {/* Icon nav */}
        <nav className="hidden border-r border-[#181C26] bg-[#0B0D12] py-3 lg:block">
          <div className="flex flex-col items-center gap-2">
            {([
              ["files",    FileCode2,  "Files"],
              ["session",  UsersRound, "Session"],
              ["run",      Terminal,   "Run"],
              ["settings", Settings2,  "Settings"],
            ] as const).map(([panel, Icon, label]) => (
              <button
                key={panel} type="button" title={label}
                className={`flex h-10 w-10 items-center justify-center rounded-md transition ${
                  activePanel === panel
                    ? "bg-[#171B24] text-[#F2994A]"
                    : "text-[#868C9C] hover:bg-[#12151D] hover:text-[#ECEEF3]"
                }`}
                onClick={() => { setActivePanel(panel); setIsSidebarOpen(true); }}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </nav>

        {/* Sidebar */}
        {isSidebarOpen && (
          <aside className="hidden min-h-0 overflow-y-auto border-r border-[#181C26] bg-[#12151D] p-4 lg:block">
            {activePanel === "files" && (
              <FileTree
                slug={room.slug}
                files={files}
                activeFileId={activeFileId}
                canEdit={role === "owner" || role === "editor"}
                onFileSelect={switchFile}
                onFilesChanged={loadFiles}
              />
            )}

            {activePanel === "session" && (
              <div className="space-y-4">
                <section className="rounded-xl border border-[#232838] bg-[#0B0D12] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <UsersRound className="h-4 w-4 text-[#F2994A]" /> Connected
                  </div>
                  <div className="mt-4 space-y-2">
                    {presence.length === 0
                      ? <div className="rounded-md border border-dashed border-[#232838] p-3 text-sm text-[#868C9C]">You're the only one here.</div>
                      : presence.map((user) => (
                          <motion.div
                            key={`${user.name}-${user.color}`}
                            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                            className="flex items-center justify-between gap-3 rounded-lg border border-[#232838] bg-[#12151D] p-3"
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: user.color }} />
                              <span className="truncate text-sm">{user.name}</span>
                            </span>
                            <span className="text-xs text-[#868C9C]">live</span>
                          </motion.div>
                        ))}
                  </div>
                </section>
                <section className="rounded-xl border border-[#232838] bg-[#0B0D12] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <GitMerge className="h-4 w-4 text-[#2DD4BF]" /> Sync pipeline
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-[#868C9C]">
                    {[["Editor","Monaco"],["Document state","Yjs CRDT"],["Transport","Socket.IO"],["Scale","Redis"]].map(([k,v]) => (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <span>{k}</span><span className="text-[#ECEEF3]">{v}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activePanel === "run" && (
              <div className="space-y-4">
                <section className="rounded-xl border border-[#232838] bg-[#0B0D12] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Terminal className="h-4 w-4 text-[#F2994A]" /> Code runner
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#868C9C]">
                    Click <span className="font-semibold text-emerald-400">▶ Run</span> in the output panel below the editor.
                    Code executes through the backend runner with isolated temporary workspaces.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    {[["Engine","Backend runner"],["Sandbox","Temp workspace"],["Fallback","Piston API"]].map(([k,v]) => (
                      <div key={k} className="rounded-lg border border-[#232838] p-3">
                        <p className="text-[#868C9C]">{k}</p>
                        <p className="mt-1 font-medium text-[#ECEEF3]">{v}</p>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="flex items-start gap-2 rounded-xl border border-[#232838] bg-[#0B0D12] p-4 text-sm text-[#868C9C]">
                  <RadioTower className="mt-0.5 h-4 w-4 text-[#F2994A]" />
                  <p className="leading-6">Supports Python, JS, TS, Java, C, C++, Go, Rust, Ruby, PHP, C#, Swift, Kotlin, Dart, Shell.</p>
                </section>
              </div>
            )}

            {activePanel === "settings" && (
              <div className="space-y-4">
                <section className="rounded-xl border border-[#232838] bg-[#0B0D12] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Type className="h-4 w-4 text-[#F2994A]" /> Editor preferences
                  </div>
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="mb-2 text-xs text-[#868C9C]">Font size</p>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => clampFontSize(fontSize - 1)}><Minus className="h-4 w-4" /></Button>
                        <span className="w-12 text-center text-sm" style={{ fontFamily: "var(--font-mono)" }}>{fontSize}px</span>
                        <Button variant="secondary" size="sm" onClick={() => clampFontSize(fontSize + 1)}><Plus className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    {([
                      [WrapText, "Word wrap",  wordWrapEnabled, setWordWrapEnabled],
                      [PanelLeft,"Minimap",    minimapEnabled,  setMinimapEnabled ],
                    ] as const).map(([Icon, label, value, setter]) => (
                      <label key={label} className="flex items-center justify-between gap-3 rounded-lg border border-[#232838] p-3 text-sm">
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-[#2DD4BF]" />{label}
                        </span>
                        <input type="checkbox" checked={value} onChange={(e) => setter(e.target.checked)} className="h-4 w-4 accent-[#F2994A]" />
                      </label>
                    ))}
                  </div>
                </section>
                <section className="flex items-start gap-2 rounded-xl border border-[#232838] bg-[#0B0D12] p-4 text-sm text-[#868C9C]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-[#2DD4BF]" />
                  <p className="leading-6">Every edit is role-checked on the server before being applied.</p>
                </section>
              </div>
            )}
          </aside>
        )}

        {/* Editor + Output */}
        <section className="flex min-h-0 min-w-0 flex-col bg-[#0B0D12]">
          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-[#181C26] bg-[#12151D] px-3">
            <div className="flex min-w-0 items-center">
              <div className="flex h-10 min-w-0 items-center gap-2 border-r border-[#232838] bg-[#0B0D12] px-3 text-sm">
                <FileCode2 className="h-4 w-4 shrink-0 text-[#F2994A]" />
                <span className="truncate" style={{ fontFamily: "var(--font-mono)" }}>{activeFileName}</span>
              </div>
            </div>
            <div className="hidden items-center gap-3 text-xs text-[#868C9C] sm:flex">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-[#2DD4BF]" /> Auto-sync
              </span>
              <span>{charCount.toLocaleString()} chars</span>
            </div>
          </div>

          {/* Monaco */}
          <div className="relative flex-1 min-h-0">
            {/* Loading overlay — disappears once isReady */}
            {(!isReady || isSwitching) && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0B0D12]">
                <div className="w-full max-w-md space-y-4 px-6">
                  <div className="h-4 w-32 animate-pulse rounded bg-[#232838]" />
                  <div className="h-72 animate-pulse rounded-lg border border-[#232838] bg-[#12151D]" />
                  {initError
                    ? <p className="text-sm text-red-400">{initError}</p>
                    : <div className="flex items-center gap-2 text-sm text-[#868C9C]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {isSwitching ? "Switching file…" : "Connecting to collaborative session…"}
                      </div>}
                </div>
              </div>
            )}

            <div className="h-full">
              <Editor
                height="100%"
                theme="vs-dark"
                defaultLanguage={room.language}
                defaultValue={room.snapshot}
                onMount={handleMount}
                options={{
                  automaticLayout:            true,
                  cursorSmoothCaretAnimation: "on",
                  fontLigatures:              true,
                  renderLineHighlight:        "all",
                  roundedSelection:           false,
                  scrollBeyondLastLine:       false,
                  tabSize:                    2
                }}
              />
            </div>
          </div>

          {/* Output panel (compiler) */}
          <OutputPanel language={activeLanguage} getCode={getCode} />

          {/* Status bar */}
          <footer className="flex shrink-0 items-center justify-between border-t border-[#181C26] bg-[#12151D] px-3 text-xs text-[#868C9C]" style={{ height: 28 }}>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1 ${statusColor}`}>
                {connectionStatus === "disconnected" ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                {connectionStatus}
              </span>
              <span>{getLanguageLabel(activeLanguage)}</span>
              {role === "viewer" && (
                <span className="inline-flex items-center gap-1 text-[#F2994A]">
                  <Eye className="h-3 w-3" /> read only
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
              <span>{charCount.toLocaleString()} chars</span>
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}
