export const supportedLanguages = [
  "typescript",
  "javascript",
  "python",
  "java",
  "c",
  "cpp",
  "csharp",
  "go",
  "rust",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "dart",
  "html",
  "css",
  "json",
  "markdown",
  "sql",
  "shell",
  "yaml",
  "xml",
  "plaintext"
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

const supportedLanguageSet = new Set<string>(supportedLanguages);

export function isSupportedLanguage(language: string): language is SupportedLanguage {
  return supportedLanguageSet.has(language);
}

export function initialSnapshotForLanguage(language: SupportedLanguage) {
  if (["html", "xml", "markdown"].includes(language)) {
    return "<!-- Start collaborating here -->\n";
  }

  if (language === "css") {
    return "/* Start collaborating here */\n";
  }

  if (["python", "ruby", "shell", "yaml"].includes(language)) {
    return "# Start collaborating here\n";
  }

  if (language === "json") {
    return "{\n  \n}\n";
  }

  if (language === "sql") {
    return "-- Start collaborating here\n";
  }

  if (language === "plaintext") {
    return "Start collaborating here\n";
  }

  return "// Start collaborating here\n";
}
