import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Router } from "express";
import ts from "typescript";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const RUN_TIMEOUT_MS = 10000;
const PISTON_TIMEOUT_MS = 15000;
const MAX_OUTPUT_CHARS = 12000;

type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  language: string;
  version: string;
};

const pistonRuntimes: Record<string, { language: string; version: string; fileName: string }> = {
  c: { language: "c", version: "10.2.0", fileName: "main.c" },
  cpp: { language: "c++", version: "10.2.0", fileName: "main.cpp" },
  csharp: { language: "csharp.net", version: "5.0.201", fileName: "Program.cs" },
  dart: { language: "dart", version: "2.19.6", fileName: "main.dart" },
  go: { language: "go", version: "1.16.2", fileName: "main.go" },
  kotlin: { language: "kotlin", version: "1.8.20", fileName: "Main.kt" },
  php: { language: "php", version: "8.2.3", fileName: "main.php" },
  ruby: { language: "ruby", version: "3.0.1", fileName: "main.rb" },
  rust: { language: "rust", version: "1.68.2", fileName: "main.rs" },
  shell: { language: "bash", version: "5.2.0", fileName: "main.sh" },
  sql: { language: "sqlite3", version: "3.36.0", fileName: "main.sql" },
  swift: { language: "swift", version: "5.3.3", fileName: "main.swift" }
};

const runSchema = z.object({
  language: z.string().trim().min(1).max(32),
  source: z.string().max(200_000),
  fileName: z.string().trim().min(1).max(255).optional()
});

function truncateOutput(value: string) {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n...output truncated...`;
}

async function runWithPiston(language: string, source: string): Promise<RunResult> {
  const runtime = pistonRuntimes[language];

  if (!runtime) {
    return {
      stdout: "",
      stderr: `No local or remote compiler is configured for "${language}".`,
      exitCode: 1,
      language,
      version: "unavailable"
    };
  }

  try {
    const response = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(PISTON_TIMEOUT_MS),
      body: JSON.stringify({
        language: runtime.language,
        version: runtime.version,
        files: [{ name: runtime.fileName, content: source }]
      })
    });

    if (!response.ok) {
      return {
        stdout: "",
        stderr: `Remote compiler error: ${response.status} ${response.statusText}`,
        exitCode: 1,
        language,
        version: runtime.version
      };
    }

    const data = await response.json() as {
      language: string;
      version: string;
      compile?: { stdout: string; stderr: string; code: number };
      run: { stdout: string; stderr: string; code: number };
    };

    const compileStdout = data.compile?.stdout ? truncateOutput(data.compile.stdout) : "";
    const compileStderr = data.compile?.stderr ? truncateOutput(data.compile.stderr) : "";
    const runStdout = truncateOutput(data.run.stdout);
    const runStderr = truncateOutput(data.run.stderr);

    return {
      stdout: [compileStdout, runStdout].filter(Boolean).join("\n"),
      stderr: [compileStderr, runStderr].filter(Boolean).join("\n"),
      exitCode: data.run.code ?? data.compile?.code ?? 0,
      language: data.language,
      version: data.version
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: `Remote compiler unavailable: ${error instanceof Error ? error.message : "Unknown error"}`,
      exitCode: 1,
      language,
      version: runtime.version
    };
  }
}

function runProcess(command: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const displayCommand = [command, ...args].join(" ");
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, RUN_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: `Runner command failed: ${displayCommand}\n${error.message}`,
        exitCode: 1,
        language: command,
        version: "local"
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: truncateOutput(stdout),
        stderr: timedOut ? `${truncateOutput(stderr)}\nExecution timed out after ${RUN_TIMEOUT_MS / 1000}s.` : truncateOutput(stderr),
        exitCode: timedOut ? 124 : code ?? 0,
        language: command,
        version: "local"
      });
    });
  });
}

function executableName(name: string) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

async function runDockerCompiler(language: "c" | "cpp", source: string, workdir: string): Promise<RunResult> {
  const fileName = language === "c" ? "main.c" : "main.cpp";
  const compiler = language === "c" ? "gcc" : "g++";
  const standard = language === "c" ? "-std=c17" : "-std=c++17";

  await writeFile(join(workdir, fileName), source, "utf8");

  const command = `${compiler} ${fileName} -O2 ${standard} -o main && ./main`;
  const result = await runProcess(
    "docker",
    ["run", "--rm", "-v", `${workdir}:/workspace`, "-w", "/workspace", "cloud-ide-cpp", "sh", "-lc", command],
    workdir
  );

  if (result.stderr.includes("Unable to find image") || result.stderr.includes("pull access denied")) {
    return {
      stdout: "",
      stderr: "C/C++ Docker runner image is missing. Build or pull the cloud-ide-cpp image, or install gcc/g++ locally.",
      exitCode: 1,
      language,
      version: "docker"
    };
  }

  return { ...result, language, version: "docker:cloud-ide-cpp" };
}

function javaClassName(source: string) {
  return source.match(/public\s+class\s+([A-Za-z_$][\w$]*)/)?.[1]
    ?? source.match(/class\s+([A-Za-z_$][\w$]*)/)?.[1]
    ?? "Main";
}

async function runJava(source: string, workdir: string): Promise<RunResult> {
  const className = javaClassName(source);
  await writeFile(join(workdir, `${className}.java`), source, "utf8");

  const compile = await runProcess("javac", [`${className}.java`], workdir);
  if (compile.exitCode !== 0) {
    return { ...compile, language: "java" };
  }

  const result = await runProcess("java", [className], workdir);
  return { ...result, language: "java" };
}

async function compileAndRun({
  language,
  source,
  workdir,
  fileName,
  outputName,
  compileCommand,
  compileArgs,
  runCommand,
  runArgs
}: {
  language: string;
  source: string;
  workdir: string;
  fileName: string;
  outputName?: string;
  compileCommand: string;
  compileArgs: string[];
  runCommand?: string;
  runArgs?: string[];
}): Promise<RunResult> {
  await writeFile(join(workdir, fileName), source, "utf8");
  const compile = await runProcess(compileCommand, compileArgs, workdir);

  if (compile.exitCode !== 0) {
    return { ...compile, language };
  }

  const command = runCommand ?? (outputName ? join(workdir, outputName) : "");
  const args = runArgs ?? [];

  if (!command) {
    return { stdout: "", stderr: "No run command configured.", exitCode: 1, language, version: "local" };
  }

  return { ...(await runProcess(command, args, workdir)), language };
}

async function runCSharp(source: string, workdir: string): Promise<RunResult> {
  const init = await runProcess("dotnet", ["new", "console", "--force", "--no-restore"], workdir);
  if (init.exitCode !== 0) {
    return { ...init, language: "csharp" };
  }

  await writeFile(join(workdir, "Program.cs"), source, "utf8");
  return { ...(await runProcess("dotnet", ["run", "--no-restore"], workdir)), language: "csharp" };
}

async function runSql(source: string, workdir: string): Promise<RunResult> {
  await writeFile(join(workdir, "main.sql"), source, "utf8");
  const shellCommand = process.platform === "win32"
    ? "Get-Content main.sql | sqlite3 :memory:"
    : "sqlite3 :memory: < main.sql";
  return { ...(await runProcess(shellCommand, [], workdir)), language: "sql" };
}

async function runScript(language: string, source: string, workdir: string): Promise<RunResult> {
  if (language === "javascript" || language === "typescript") {
    const runnableSource = language === "typescript"
      ? ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
      : source;

    await writeFile(join(workdir, "main.js"), runnableSource, "utf8");
    return { ...(await runProcess("node", ["main.js"], workdir)), language };
  }

  if (language === "python") {
    await writeFile(join(workdir, "main.py"), source, "utf8");
    return { ...(await runProcess("python", ["main.py"], workdir)), language };
  }

  if (language === "java") {
    return runJava(source, workdir);
  }

  if (language === "c") {
    return runDockerCompiler("c", source, workdir);
  }

  if (language === "cpp") {
    return runDockerCompiler("cpp", source, workdir);
  }

  if (language === "c-local") {
    const exe = executableName("main");
    return compileAndRun({
      language: "c",
      source,
      workdir,
      fileName: "main.c",
      outputName: exe,
      compileCommand: "gcc",
      compileArgs: ["main.c", "-O2", "-std=c17", "-o", exe]
    });
  }

  if (language === "cpp-local") {
    const exe = executableName("main");
    return compileAndRun({
      language: "cpp",
      source,
      workdir,
      fileName: "main.cpp",
      outputName: exe,
      compileCommand: "g++",
      compileArgs: ["main.cpp", "-O2", "-std=c++17", "-o", exe]
    });
  }

  if (language === "go") {
    const exe = executableName("main");
    return compileAndRun({
      language,
      source,
      workdir,
      fileName: "main.go",
      outputName: exe,
      compileCommand: "go",
      compileArgs: ["build", "-o", exe, "main.go"]
    });
  }

  if (language === "rust") {
    const exe = executableName("main");
    return compileAndRun({
      language,
      source,
      workdir,
      fileName: "main.rs",
      outputName: exe,
      compileCommand: "rustc",
      compileArgs: ["main.rs", "-O", "-o", exe]
    });
  }

  if (language === "csharp") {
    return runCSharp(source, workdir);
  }

  if (language === "php") {
    await writeFile(join(workdir, "main.php"), source, "utf8");
    return { ...(await runProcess("php", ["main.php"], workdir)), language };
  }

  if (language === "ruby") {
    await writeFile(join(workdir, "main.rb"), source, "utf8");
    return { ...(await runProcess("ruby", ["main.rb"], workdir)), language };
  }

  if (language === "shell") {
    await writeFile(join(workdir, "main.sh"), source, "utf8");
    const command = process.platform === "win32" ? "powershell" : "bash";
    const args = process.platform === "win32" ? ["-NoProfile", "-File", "main.sh"] : ["main.sh"];
    return { ...(await runProcess(command, args, workdir)), language };
  }

  if (language === "sql") {
    return runSql(source, workdir);
  }

  if (language === "swift") {
    await writeFile(join(workdir, "main.swift"), source, "utf8");
    return { ...(await runProcess("swift", ["main.swift"], workdir)), language };
  }

  if (language === "kotlin") {
    const jarName = "main.jar";
    return compileAndRun({
      language,
      source,
      workdir,
      fileName: "Main.kt",
      compileCommand: "kotlinc",
      compileArgs: ["Main.kt", "-include-runtime", "-d", jarName],
      runCommand: "java",
      runArgs: ["-jar", jarName]
    });
  }

  if (language === "dart") {
    await writeFile(join(workdir, "main.dart"), source, "utf8");
    return { ...(await runProcess("dart", ["run", "main.dart"], workdir)), language };
  }

  if (language in pistonRuntimes) {
    return runWithPiston(language, source);
  }

  return {
    stdout: "",
    stderr: `Local compiler is not configured for "${language}" yet.`,
    exitCode: 1,
    language,
    version: "local"
  };
}

router.use(requireAuth);

router.post("/", async (req, res, next) => {
  let workdir = "";

  try {
    const input = runSchema.parse(req.body);
    workdir = await mkdtemp(join(tmpdir(), "collabcode-run-"));
    const result = await runScript(input.language, input.source, workdir);
    return res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid run request", details: error.flatten() });
    }
    return next(error);
  } finally {
    if (workdir) {
      rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
});

export { router as runRouter };
