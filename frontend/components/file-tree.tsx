"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  FolderOpen,
  Loader2,
  Pencil,
  Trash2,
  X,
  Check
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RoomFile } from "@/lib/api";
import { createFile, deleteFile, renameFile } from "@/lib/api";
import { languageOptions } from "@/lib/languages";

// ─── Tree building ────────────────────────────────────────────────────────────

type TreeNode =
  | { kind: "file"; file: RoomFile }
  | { kind: "folder"; name: string; path: string; children: TreeNode[]; expanded: boolean };

function buildTree(files: RoomFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    const isFolderMarker = parts.at(-1) === ".keep";
    if (parts.length === 1) {
      if (isFolderMarker) continue;
      root.push({ kind: "file", file });
      continue;
    }
    // Nested — find or create folder nodes
    let current = root;
    let folderPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      folderPath = folderPath ? `${folderPath}/${parts[i]}` : parts[i];
      let folder = current.find((n): n is TreeNode & { kind: "folder" } => n.kind === "folder" && n.path === folderPath);
      if (!folder) {
        folder = { kind: "folder", name: parts[i], path: folderPath, children: [], expanded: true };
        current.push(folder);
      }
      current = folder.children;
    }
    if (isFolderMarker) continue;
    current.push({ kind: "file", file });
  }

  return root;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type FileTreeProps = {
  slug: string;
  files: RoomFile[];
  activeFileId: string | null;
  canEdit: boolean;
  onFileSelect: (file: RoomFile) => void;
  onFilesChanged: () => void;
};

// ─── New-file form ────────────────────────────────────────────────────────────

function NewFileForm({
  slug,
  onDone
}: {
  slug: string;
  onDone: (created?: RoomFile) => void;
}) {
  const [path, setPath] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    const trimmed = path.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      const res = await createFile(slug, { path: trimmed, language });
      onDone(res?.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create file");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-1 mb-2 rounded-lg border border-[#232838] bg-[#0B0D12] p-2">
      <input
        ref={inputRef}
        value={path}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onDone(); }}
        placeholder="src/index.ts"
        className="w-full rounded bg-[#12151D] px-2 py-1 text-xs text-[#ECEEF3] outline-none placeholder:text-[#3A4152] focus:ring-1 focus:ring-[#F2994A]/40"
        style={{ fontFamily: "var(--font-mono)" }}
      />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="mt-1.5 w-full rounded bg-[#12151D] px-2 py-1 text-xs text-[#ECEEF3] outline-none"
      >
        {languageOptions.map((l) => (
          <option key={l.id} value={l.id}>{l.label}</option>
        ))}
      </select>
      {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
      <div className="mt-2 flex gap-1.5">
        <button
          onClick={submit}
          disabled={loading || !path.trim()}
          className="flex flex-1 items-center justify-center gap-1 rounded bg-[#F2994A] px-2 py-1 text-[11px] font-semibold text-[#0B0D12] hover:bg-[#f5a862] disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Create
        </button>
        <button
          onClick={() => onDone()}
          className="rounded px-2 py-1 text-[11px] text-[#868C9C] hover:text-[#ECEEF3]"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── FileTree component ───────────────────────────────────────────────────────

export function FileTree({ slug, files, activeFileId, canEdit, onFileSelect, onFilesChanged }: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => { setTree(buildTree(files)); }, [files]);

  function toggleFolder(path: string) {
    function toggle(nodes: TreeNode[]): TreeNode[] {
      return nodes.map((n) => {
        if (n.kind === "folder" && n.path === path) return { ...n, expanded: !n.expanded };
        if (n.kind === "folder") return { ...n, children: toggle(n.children) };
        return n;
      });
    }
    setTree((t) => toggle(t));
  }

  async function handleRename(fileId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingId(null); return; }
    try {
      await renameFile(slug, fileId, trimmed);
      onFilesChanged();
    } catch { /* ignore */ }
    setRenamingId(null);
  }

  async function handleDelete(fileId: string) {
    setDeletingId(fileId);
    try {
      await deleteFile(slug, fileId);
      onFilesChanged();
    } catch { /* ignore */ }
    setDeletingId(null);
  }

  async function handleCreateFolder() {
    const folderName = window.prompt("Folder name");
    const trimmed = folderName?.trim().replace(/^\/+|\/+$/g, "");
    if (!trimmed) return;

    setCreatingFolder(true);
    try {
      await createFile(slug, { path: `${trimmed}/.keep`, language: "plaintext" });
      onFilesChanged();
    } catch { /* ignore */ }
    setCreatingFolder(false);
  }

  function renderFile(file: RoomFile, depth: number) {
    const isActive = file.id === activeFileId;
    const isRenaming = renamingId === file.id;
    const isDeleting = deletingId === file.id;

    return (
      <motion.div
        key={file.id}
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        className={`group flex items-center gap-1.5 rounded-md px-2 py-[5px] text-xs transition cursor-pointer
          ${isActive ? "bg-[#1E2230] text-[#ECEEF3]" : "text-[#868C9C] hover:bg-[#12151D] hover:text-[#ECEEF3]"}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => !isRenaming && onFileSelect(file)}
      >
        <File className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[#F2994A]" : "text-[#3A4152] group-hover:text-[#868C9C]"}`} />

        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(file.id); if (e.key === "Escape") setRenamingId(null); }}
            onBlur={() => handleRename(file.id)}
            className="min-w-0 flex-1 rounded bg-[#0B0D12] px-1 py-0.5 text-xs text-[#ECEEF3] outline-none focus:ring-1 focus:ring-[#F2994A]/40"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: "var(--font-mono)" }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate" style={{ fontFamily: "var(--font-mono)" }}>
            {file.path.split("/").pop()}
          </span>
        )}

        {canEdit && !isRenaming && (
          <span className="ml-auto hidden shrink-0 items-center gap-1 group-hover:flex" onClick={(e) => e.stopPropagation()}>
            <button
              title="Rename"
              onClick={() => { setRenamingId(file.id); setRenameValue(file.path); }}
              className="rounded p-0.5 hover:text-[#F2994A] transition"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              title="Delete"
              disabled={isDeleting}
              onClick={() => handleDelete(file.id)}
              className="rounded p-0.5 hover:text-red-400 transition disabled:opacity-40"
            >
              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          </span>
        )}
      </motion.div>
    );
  }

  function renderNode(node: TreeNode, depth = 0): React.ReactNode {
    if (node.kind === "file") return renderFile(node.file, depth);
    return (
      <div key={node.path}>
        <button
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-[5px] text-xs text-[#868C9C] hover:text-[#ECEEF3] transition"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => toggleFolder(node.path)}
        >
          {node.expanded
            ? <><FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#F2994A]/70" /><ChevronDown className="h-3 w-3 shrink-0" /></>
            : <><Folder className="h-3.5 w-3.5 shrink-0 text-[#F2994A]/70" /><ChevronRight className="h-3 w-3 shrink-0" /></>}
          <span className="truncate" style={{ fontFamily: "var(--font-mono)" }}>{node.name}</span>
        </button>
        <AnimatePresence>
          {node.expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              {node.children.map((child) => renderNode(child, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[#868C9C]" style={{ fontFamily: "var(--font-mono)" }}>
          Files
        </span>
        {canEdit && (
          <span className="flex items-center gap-1">
            <button
              title="New folder"
              disabled={creatingFolder}
              onClick={handleCreateFolder}
              className="rounded p-1 text-[#868C9C] hover:text-[#F2994A] transition disabled:opacity-40"
            >
              {creatingFolder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
            </button>
            <button
              title="New file"
              onClick={() => setShowNewForm((v) => !v)}
              className="rounded p-1 text-[#868C9C] hover:text-[#F2994A] transition"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      {/* New file form */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
            <NewFileForm
              slug={slug}
              onDone={(created) => {
                setShowNewForm(false);
                if (created) onFilesChanged();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tree */}
      <div className="space-y-0.5">
        {tree.length === 0
          ? <p className="px-2 text-xs text-[#3A4152]">No files yet.</p>
          : tree.map((n) => renderNode(n))}
      </div>
    </div>
  );
}
