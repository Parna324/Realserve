"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Eye,
  Loader2,
  Play,
  RefreshCw,
  Terminal,
  Trash2,
  XCircle
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { runCode, type RunResult } from "@/lib/piston";
import { Button } from "@/components/ui/button";
import { getLanguageLabel } from "@/lib/languages";

type Props = {
  language: string;
  getCode: () => string;
};

// Labels for the Run button by language
const RUN_LABELS: Record<string, string> = {
  html:      "Preview HTML",
  css:       "Preview CSS",
  markdown:  "Render",
  json:      "Format & Validate",
  xml:       "Format & Validate",
  yaml:      "Validate",
  plaintext: "Analyse",
  sql:       "Run SQL",
};

function runLabel(lang: string) {
  return RUN_LABELS[lang] ?? `Run ${getLanguageLabel(lang)}`;
}

export function OutputPanel({ language, getCode }: Props) {
  const [isOpen,    setIsOpen]    = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [result,    setResult]    = useState<RunResult | null>(null);
  const [height,    setHeight]    = useState(260);
  const isDragging   = useRef(false);
  const startY       = useRef(0);
  const startHeight  = useRef(0);
  const outputRef    = useRef<HTMLDivElement>(null);

  // Drag-to-resize
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!isDragging.current) return;
      setHeight(Math.max(140, Math.min(700, startHeight.current + (startY.current - e.clientY))));
    }
    function onUp() { isDragging.current = false; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // Auto-scroll terminal output
  useEffect(() => {
    if (result?.kind !== "preview" && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [result]);

  // Auto-open panel when language changes so user sees the correct run button
  useEffect(() => {
    setResult(null);
  }, [language]);

  async function handleRun() {
    setIsOpen(true);
    setIsRunning(true);
    setResult(null);
    try {
      const res = await runCode(language, getCode());
      setResult(res);
    } catch (err) {
      setResult({
        kind:     "terminal",
        stdout:   "",
        stderr:   err instanceof Error ? err.message : "Unknown error",
        exitCode: 1,
        language,
        version:  ""
      });
    } finally {
      setIsRunning(false);
    }
  }

  // Status badge
  function Badge() {
    if (!result) return null;
    if (result.kind === "terminal") {
      return (
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          result.exitCode === 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
        }`}>
          {result.exitCode === 0
            ? <><CheckCircle2 className="h-3 w-3" />exit 0</>
            : <><XCircle      className="h-3 w-3" />exit {result.exitCode}</>}
        </span>
      );
    }
    if (result.kind === "formatted") {
      return (
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          result.isError ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
        }`}>
          {result.isError ? <><XCircle className="h-3 w-3" />Error</> : <><CheckCircle2 className="h-3 w-3" />Valid</>}
        </span>
      );
    }
    if (result.kind === "preview") {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-[#38BDF8]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#38BDF8]">
          <Eye className="h-3 w-3" /> Preview
        </span>
      );
    }
    return null;
  }

  // Version label for Piston runs
  const versionLabel = result?.kind === "terminal" && result.version
    ? `${result.language} ${result.version}`
    : null;

  const isPreview = result?.kind === "preview";

  return (
    <div className="flex flex-col border-t border-[#181C26]">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center justify-between bg-[#12151D] px-3">
        <div className="flex items-center gap-2">
          {isPreview
            ? <Eye className="h-3.5 w-3.5 text-[#38BDF8]" />
            : <Terminal className="h-3.5 w-3.5 text-[#868C9C]" />}
          <span className="text-xs font-medium text-[#868C9C]">
            {isPreview ? "Preview" : "Output"}
          </span>
          <Badge />
          {versionLabel && <span className="text-[10px] text-[#3A4152]">{versionLabel}</span>}
        </div>

        <div className="flex items-center gap-1.5">
          {result && (
            <button
              onClick={() => setResult(null)}
              title="Clear"
              className="rounded p-1 text-[#868C9C] hover:text-[#ECEEF3] transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Re-run button (only when result exists) */}
          {result && !isRunning && (
            <button
              onClick={handleRun}
              title="Re-run"
              className="rounded p-1 text-[#868C9C] hover:text-emerald-400 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}

          <Button
            size="sm"
            disabled={isRunning}
            onClick={handleRun}
            className="h-6 gap-1 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {isRunning
              ? <><Loader2 className="h-3 w-3 animate-spin" />Running…</>
              : <><Play    className="h-3 w-3" />{runLabel(language)}</>}
          </Button>

          <button
            onClick={() => setIsOpen((v) => !v)}
            title={isOpen ? "Collapse" : "Expand"}
            className="rounded p-1 text-[#868C9C] hover:text-[#ECEEF3] transition"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Expandable body ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col overflow-hidden"
          >
            {/* Drag grip */}
            <div
              className="h-1 w-full cursor-row-resize bg-[#181C26] hover:bg-[#F2994A]/40 transition-colors"
              onMouseDown={(e) => {
                isDragging.current  = true;
                startY.current      = e.clientY;
                startHeight.current = height;
                e.preventDefault();
              }}
            />

            {/* Content area */}
            <div className="relative flex-1 overflow-hidden bg-[#080A0F]">

              {/* Loading */}
              {isRunning && (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-[#868C9C]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {["html","css","markdown"].includes(language) ? "Rendering…" : "Executing…"}
                </div>
              )}

              {/* Empty state */}
              {!isRunning && !result && (
                <div className="flex h-full items-center justify-center text-center">
                  <div>
                    <Code2 className="mx-auto mb-2 h-7 w-7 text-[#3A4152]" />
                    <p className="text-sm text-[#3A4152]">Press <span className="text-emerald-400 font-medium">▶ {runLabel(language)}</span> to start</p>
                  </div>
                </div>
              )}

              {/* ── Terminal output (Piston) ─────────────────────────── */}
              {!isRunning && result?.kind === "terminal" && (
                <div
                  ref={outputRef}
                  className="h-full overflow-auto px-4 py-3"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: "1.7" }}
                >
                  {result.stdout && (
                    <pre className="whitespace-pre-wrap text-[#ECEEF3]">{result.stdout}</pre>
                  )}
                  {result.stderr && (
                    <pre className="whitespace-pre-wrap text-red-400">{result.stderr}</pre>
                  )}
                  {!result.stdout && !result.stderr && (
                    <p className="text-[#868C9C]">(no output)</p>
                  )}
                </div>
              )}

              {/* ── Formatted output (JSON / XML / YAML / plaintext) ── */}
              {!isRunning && result?.kind === "formatted" && (
                <div
                  ref={outputRef}
                  className="h-full overflow-auto px-4 py-3"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: "1.7" }}
                >
                  <pre className={`whitespace-pre-wrap ${result.isError ? "text-red-400" : "text-[#ECEEF3]"}`}>
                    {result.content}
                  </pre>
                </div>
              )}

              {/* ── HTML / CSS / Markdown preview (iframe) ──────────── */}
              {!isRunning && result?.kind === "preview" && (
                <iframe
                  key={result.html /* remount when content changes */}
                  srcDoc={result.html}
                  sandbox="allow-scripts allow-same-origin"
                  className="h-full w-full border-none bg-white"
                  title={`${getLanguageLabel(language)} preview`}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
