export type LanguageOption = {
  id: string;
  label: string;
};

export const languageOptions = [
  { id: "typescript", label: "TypeScript" },
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "swift", label: "Swift" },
  { id: "kotlin", label: "Kotlin" },
  { id: "dart", label: "Dart" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "json", label: "JSON" },
  { id: "markdown", label: "Markdown" },
  { id: "sql", label: "SQL" },
  { id: "shell", label: "Shell" },
  { id: "yaml", label: "YAML" },
  { id: "xml", label: "XML" },
  { id: "plaintext", label: "Plain Text" }
] as const satisfies readonly LanguageOption[];

export function getLanguageLabel(languageId: string) {
  return languageOptions.find((language) => language.id === languageId)?.label ?? languageId;
}
