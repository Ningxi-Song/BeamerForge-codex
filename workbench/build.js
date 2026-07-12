const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MISSING_COMPILER_MESSAGE =
  "Install TeX Live, MiKTeX, Tectonic, or another XeLaTeX distribution with latexmk, xelatex, or tectonic available on PATH.";
const PROBE_TIMEOUT_MS = 5000;
const COMPILE_TIMEOUT_MS = 120000;

function probeCompiler(spawnSync, command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    windowsHide: true
  });
  return result && result.status === 0;
}

function findCompiler(spawnSync = childProcess.spawnSync) {
  if (probeCompiler(spawnSync, "latexmk")) {
    return {
      kind: "latexmk",
      command: "latexmk",
      args: ["-g", "-xelatex", "-interaction=nonstopmode", "main.tex"]
    };
  }

  if (probeCompiler(spawnSync, "xelatex")) {
    return {
      kind: "xelatex",
      command: "xelatex",
      args: ["-interaction=nonstopmode", "main.tex"]
    };
  }

  if (probeCompiler(spawnSync, "tectonic")) {
    return {
      kind: "tectonic",
      command: "tectonic",
      args: ["main.tex"]
    };
  }

  return { kind: "missing" };
}

function runCommandAsync(command, args, options = {}, spawn = childProcess.spawn) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(command, args, { cwd: options.cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { resolve({ status: null, stdout: "", stderr: "", error }); return; }
    let stdout = ""; let stderr = ""; let settled = false; let timer = null;
    const finish = (status, error = null) => {
      if (settled) return; settled = true; if (timer) clearTimeout(timer);
      resolve({ status, stdout, stderr, ...(error ? { error } : {}) });
    };
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => finish(null, error));
    child.on("close", (code) => finish(code));
    timer = setTimeout(() => {
      const error = new Error(`Command timed out after ${options.timeout || COMPILE_TIMEOUT_MS}ms`);
      finish(null, error);
      try { child.kill(); } catch { /* already settled */ }
    }, options.timeout || COMPILE_TIMEOUT_MS);
  });
}

async function findCompilerAsync(runCommand = runCommandAsync) {
  for (const candidate of [
    { kind: "latexmk", command: "latexmk", args: ["-g", "-xelatex", "-interaction=nonstopmode", "main.tex"] },
    { kind: "xelatex", command: "xelatex", args: ["-interaction=nonstopmode", "main.tex"] },
    { kind: "tectonic", command: "tectonic", args: ["main.tex"] }
  ]) {
    const result = await runCommand(candidate.command, ["--version"], { timeout: PROBE_TIMEOUT_MS, windowsHide: true });
    if (result && result.status === 0) return candidate;
  }
  return { kind: "missing" };
}

function extractLatexExcerpt(logText) {
  const lines = String(logText || "").split(/\r?\n/);
  const selected = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^! /.test(line) || /^l\.\d+/.test(line) || /\b(error|fatal)\b/i.test(line)) {
      if (index > 0) selected.push(lines[index - 1]);
      selected.push(line);
      if (index + 1 < lines.length) selected.push(lines[index + 1]);
    }
  }

  return [...new Set(selected)].join("\n").trim();
}

function compileTemplate(templateDir, options = {}) {
  const spawnSync = options.spawnSync || childProcess.spawnSync;
  const compiler = options.compiler || findCompiler(spawnSync);

  if (compiler.kind === "missing") {
    return {
      ok: false,
      status: "missing-compiler",
      compilerKind: compiler.kind,
      message: MISSING_COMPILER_MESSAGE,
      logPath: null,
      excerpt: ""
    };
  }

  const logPath = path.join(templateDir, "workbench-build.log");
  const pdfPath = path.join(templateDir, "main.pdf");
  const command = [compiler.command, ...compiler.args].join(" ");
  const passCount = compiler.kind === "xelatex" ? 2 : 1;
  let result = null;
  let combinedLog = "";

  for (let passIndex = 0; passIndex < passCount; passIndex += 1) {
    result = spawnSync(compiler.command, compiler.args, {
      cwd: templateDir,
      encoding: "utf8",
      timeout: options.timeoutMs || COMPILE_TIMEOUT_MS,
      windowsHide: true
    });

    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    const spawnError = result.error ? result.error.message : "";
    const passLog = `${stdout}${stderr}${spawnError ? `\n${spawnError}\n` : ""}`;
    combinedLog += passCount > 1 ? `--- xelatex pass ${passIndex + 1} ---\n${passLog}` : passLog;

    if (result.status !== 0 || result.error) {
      break;
    }
  }

  const spawnError = result && result.error ? result.error.message : "";

  fs.writeFileSync(logPath, combinedLog, "utf8");

  if (result && result.status === 0 && fs.existsSync(pdfPath)) {
    return {
      ok: true,
      status: "compiled",
      compilerKind: compiler.kind,
      message: "Template compiled.",
      command,
      exitCode: result.status,
      logPath,
      excerpt: "",
      pdfPath
    };
  }

  return {
    ok: false,
    status: "compile-failed",
    compilerKind: compiler.kind,
    message: spawnError ? `Template compilation failed: ${spawnError}` : "Template compilation failed.",
    command,
    exitCode: result ? result.status : null,
    logPath,
    excerpt: extractLatexExcerpt(combinedLog) || spawnError
  };
}

async function compileTemplateAsync(templateDir, options = {}) {
  const runCommand = options.runCommand || runCommandAsync;
  const compiler = options.compiler || await findCompilerAsync(runCommand);
  if (compiler.kind === "missing") return { ok: false, status: "missing-compiler", compilerKind: "missing", message: MISSING_COMPILER_MESSAGE, logPath: null, excerpt: "" };
  const logPath = path.join(templateDir, "workbench-build.log");
  const pdfPath = path.join(templateDir, "main.pdf");
  const command = [compiler.command, ...compiler.args].join(" ");
  const passCount = compiler.kind === "xelatex" ? 2 : 1;
  let result = null; let combinedLog = "";
  for (let passIndex = 0; passIndex < passCount; passIndex++) {
    result = await runCommand(compiler.command, compiler.args, { cwd: templateDir, timeout: options.timeoutMs || COMPILE_TIMEOUT_MS, windowsHide: true });
    const spawnError = result?.error?.message || "";
    const passLog = `${result?.stdout || ""}${result?.stderr || ""}${spawnError ? `\n${spawnError}\n` : ""}`;
    combinedLog += passCount > 1 ? `--- xelatex pass ${passIndex + 1} ---\n${passLog}` : passLog;
    if (result?.status !== 0 || result?.error) break;
  }
  fs.writeFileSync(logPath, combinedLog, "utf8");
  if (result?.status === 0 && fs.existsSync(pdfPath)) return { ok: true, status: "compiled", compilerKind: compiler.kind, message: "Template compiled.", command, exitCode: 0, logPath, excerpt: "", pdfPath };
  const spawnError = result?.error?.message || "";
  return { ok: false, status: "compile-failed", compilerKind: compiler.kind, message: spawnError ? `Template compilation failed: ${spawnError}` : "Template compilation failed.", command, exitCode: result?.status ?? null, logPath, excerpt: extractLatexExcerpt(combinedLog) || spawnError };
}

module.exports = {
  COMPILE_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
  findCompiler,
  findCompilerAsync,
  runCommandAsync,
  extractLatexExcerpt,
  compileTemplate,
  compileTemplateAsync
};
