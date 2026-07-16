// ─── Result types ──────────────────────────────────────────────────────────────
export type RunResult =
  | { kind: "terminal";  stdout: string; stderr: string; exitCode: number; language: string; version: string }
  | { kind: "preview";   html: string;   language: string }
  | { kind: "formatted"; content: string; language: string; isError: boolean };

import { executeCode } from "@/lib/api";

// ─── Browser-native helpers ────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Wrap CSS in a page with demo elements so the user can see their styles applied
function runCss(source: string): RunResult {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:24px;font-family:system-ui,sans-serif;background:#f8f9fa}
</style>
<style>${source}</style>
</head>
<body>
  <div class="container wrapper">
    <header class="header site-header">
      <h1 class="title heading">Hello, CSS!</h1>
      <nav class="nav navigation">
        <a href="#" class="nav-link link active">Home</a>
        <a href="#" class="nav-link link">About</a>
        <a href="#" class="nav-link link">Contact</a>
      </nav>
    </header>
    <main class="main content">
      <section class="section">
        <article class="card box">
          <h2 class="card-title subtitle">Card Title</h2>
          <p class="card-body description text">A paragraph of text to show how your styles look on real elements.</p>
          <button class="btn button primary cta">Click me</button>
          <button class="btn button secondary">Cancel</button>
        </article>
        <article class="card box">
          <h3 class="card-title">Another Card</h3>
          <ul class="list">
            <li class="item list-item">List item one</li>
            <li class="item list-item">List item two</li>
            <li class="item list-item">List item three</li>
          </ul>
          <input class="input field" placeholder="Text input" type="text">
          <input class="input checkbox" type="checkbox" id="chk"><label for="chk"> Checkbox</label>
        </article>
      </section>
      <table class="table data-table">
        <thead><tr><th class="th">Name</th><th class="th">Value</th><th class="th">Status</th></tr></thead>
        <tbody>
          <tr class="tr row"><td class="td">Alpha</td><td class="td">42</td><td class="td badge success">Active</td></tr>
          <tr class="tr row alt"><td class="td">Beta</td><td class="td">17</td><td class="td badge warning">Pending</td></tr>
        </tbody>
      </table>
    </main>
    <footer class="footer site-footer"><p class="footer-text">&copy; CSS Preview</p></footer>
  </div>
</body>
</html>`;
  return { kind: "preview", html, language: "css" };
}

function runHtml(source: string): RunResult {
  return { kind: "preview", html: source, language: "html" };
}

// Simple but robust Markdown → HTML
function runMarkdown(source: string): RunResult {
  const codeBlocks: string[] = [];
  let md = source;
  const PH = "\u00A7BLK"; // § prefix — safe, never appears in normal code

  // Extract fenced code blocks
  md = md.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const cls = lang ? ` class="language-${lang}"` : "";
    codeBlocks.push(`<pre><code${cls}>${escHtml(code.trimEnd())}</code></pre>`);
    return `${PH}${idx}§`;
  });

  // Escape HTML in remaining text (skip placeholder regions)
  md = md.replace(/&(?![a-zA-Z#]\w*;)/g, "&amp;");
  // Process line by line so we never escape inside placeholders
  md = md.split("\n").map(line =>
    line.startsWith(PH) ? line : line.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  ).join("\n");

  // Inline code
  md = md.replace(/`([^`]+?)`/g, (_, c) => `<code>${escHtml(c)}</code>`);

  // Headings
  md = md.replace(/^#{6}\s+(.+)$/gm, "<h6>$1</h6>");
  md = md.replace(/^#{5}\s+(.+)$/gm, "<h5>$1</h5>");
  md = md.replace(/^#{4}\s+(.+)$/gm, "<h4>$1</h4>");
  md = md.replace(/^#{3}\s+(.+)$/gm, "<h3>$1</h3>");
  md = md.replace(/^#{2}\s+(.+)$/gm, "<h2>$1</h2>");
  md = md.replace(/^#\s+(.+)$/gm,    "<h1>$1</h1>");

  // Setext-style headings
  md = md.replace(/^(.+)\r?\n={3,}$/gm, "<h1>$1</h1>");
  md = md.replace(/^(.+)\r?\n-{3,}$/gm, "<h2>$1</h2>");

  // Horizontal rules
  md = md.replace(/^[-*_]([ \t]*[-*_]){2,}[ \t]*$/gm, "<hr>");

  // Bold + italic
  md = md.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  md = md.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
  md = md.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  md = md.replace(/__(.+?)__/g, "<strong>$1</strong>");
  md = md.replace(/\*(.+?)\*/g, "<em>$1</em>");
  md = md.replace(/_(.+?)_/g, "<em>$1</em>");

  // Strikethrough
  md = md.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Blockquotes
  md = md.replace(/^&gt;\s?(.*)$/gm, "<blockquote><p>$1</p></blockquote>");
  md = md.replace(/<\/blockquote>\r?\n<\/blockquote>/g, "\n");

  // Images (before links)
  md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">');

  // Links
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Unordered lists
  md = md.replace(/(^[-*+] .+\n?)+/gm, (block) => {
    const items = block.trim().split(/\n/).map(l => `<li>${l.replace(/^[-*+] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  md = md.replace(/(^\d+\. .+\n?)+/gm, (block) => {
    const items = block.trim().split(/\n/).map(l => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });

  // Paragraphs — wrap lines that aren't already block elements or placeholders
  const blockStarts = ["<h", "<ul", "<ol", "<li", "<blockquote", "<hr", "<pre", "<p", "</", "<img", PH];
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) { out.push(""); continue; }
    if (blockStarts.some(b => line.startsWith(b))) { out.push(line); continue; }
    out.push(`<p>${line}</p>`);
  }
  md = out.join("\n");

  // Restore code blocks
  md = md.replace(/§BLK(\d+)§/g, (_, idx) => codeBlocks[parseInt(idx)]);

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:780px;margin:40px auto;padding:0 24px;color:#24292f;line-height:1.7}
  h1,h2{border-bottom:1px solid #d8dee4;padding-bottom:0.3em;margin-top:1.5em}
  h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.25em}
  code{background:#f6f8fa;padding:0.2em 0.45em;border-radius:4px;font-family:monospace;font-size:0.9em}
  pre{background:#f6f8fa;padding:16px;border-radius:8px;overflow-x:auto}
  pre code{background:none;padding:0}
  blockquote{border-left:4px solid #d8dee4;margin:0;padding:0 1em;color:#57606a}
  ul,ol{padding-left:2em}li{margin:0.25em 0}
  a{color:#0969da}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #d8dee4;padding:6px 12px}th{background:#f6f8fa;font-weight:600}
  hr{border:none;border-top:1px solid #d8dee4;margin:1.5em 0}
  img{max-width:100%}
  del{color:#57606a}
</style>
</head>
<body>${md}</body>
</html>`;
  return { kind: "preview", html: fullHtml, language: "markdown" };
}

function runJson(source: string): RunResult {
  try {
    const parsed = JSON.parse(source);
    return { kind: "formatted", content: JSON.stringify(parsed, null, 2), language: "json", isError: false };
  } catch (e) {
    return { kind: "formatted", content: e instanceof Error ? `JSON SyntaxError: ${e.message}` : "Invalid JSON", language: "json", isError: true };
  }
}

function runXml(source: string): RunResult {
  try {
    if (typeof window === "undefined") return { kind: "formatted", content: source, language: "xml", isError: false };
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) return { kind: "formatted", content: err.textContent ?? "XML parse error", language: "xml", isError: true };
    const serializer = new XMLSerializer();
    return { kind: "formatted", content: formatXml(serializer.serializeToString(doc)), language: "xml", isError: false };
  } catch (e) {
    return { kind: "formatted", content: e instanceof Error ? e.message : "XML error", language: "xml", isError: true };
  }
}

function formatXml(xml: string): string {
  let indent = 0;
  return xml
    .replace(/(>)(<)(\/*)/g, "$1\n$2$3")
    .split("\n")
    .map((node) => {
      const trimmed = node.trim();
      if (!trimmed) return "";
      let padding = indent;
      if (trimmed.startsWith("</")) { indent = Math.max(0, indent - 1); padding = indent; }
      else if (!trimmed.startsWith("<?") && !trimmed.includes("</") && !trimmed.endsWith("/>")) { indent++; }
      return "  ".repeat(padding) + trimmed;
    })
    .filter(Boolean)
    .join("\n");
}

function runYaml(source: string): RunResult {
  if (/\t/.test(source)) {
    return { kind: "formatted", content: "YAML Error: Tab characters are not allowed — use spaces for indentation.", language: "yaml", isError: true };
  }
  // No YAML library available in browser — display formatted with stat header
  const lines = source.split("\n").length;
  return { kind: "formatted", content: source, language: "yaml", isError: false };
}

function runPlaintext(source: string): RunResult {
  const lines = source.split("\n").length;
  const words = source.trim().split(/\s+/).filter(Boolean).length;
  const chars = source.length;
  const header = `── Stats ──────────────────────────────\nLines: ${lines}   Words: ${words}   Chars: ${chars}\n${"─".repeat(40)}\n\n`;
  return { kind: "formatted", content: header + source, language: "plaintext", isError: false };
}

// ─── Browser runner map ────────────────────────────────────────────────────────
const BROWSER_RUNNERS: Record<string, (source: string) => RunResult> = {
  html:      runHtml,
  css:       runCss,
  json:      runJson,
  xml:       runXml,
  yaml:      runYaml,
  markdown:  runMarkdown,
  plaintext: runPlaintext,
};

// ─── Public API ────────────────────────────────────────────────────────────────

export function canRun(_language: string): boolean {
  return true; // Every language is now handled
}

export async function runCode(language: string, source: string): Promise<RunResult> {
  // Browser-native (no network)
  const browserRunner = BROWSER_RUNNERS[language];
  if (browserRunner) return browserRunner(source);

  const result = await executeCode({ language, source });
  return { kind: "terminal", ...result };
}
