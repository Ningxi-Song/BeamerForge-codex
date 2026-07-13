const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MISSING_COMPILER_MESSAGE =
  "Install TeX Live, MiKTeX, Tectonic, or another XeLaTeX distribution with latexmk, xelatex, or tectonic available on PATH.";
const PROBE_TIMEOUT_MS = 5000;
const COMPILE_TIMEOUT_MS = 120000;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const TERMINATION_GRACE_MS = 1000;

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

function captureOutput(limit) {
  return { chunks: [], bytes: 0, limit };
}

function appendOutput(capture, chunk) {
  if (capture.bytes >= capture.limit) return;
  const source = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
  const kept = source.subarray(0, capture.limit - capture.bytes);
  capture.chunks.push(kept);
  capture.bytes += kept.length;
}

function outputText(capture) {
  return Buffer.concat(capture.chunks, capture.bytes).toString("utf8");
}

function waitForProcess(child, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.once("close", (code) => finish({ closed: true, code }));
    child.once("error", (error) => finish({ closed: false, error }));
    const timer = setTimeout(() => finish({ closed: false }), timeoutMs);
  });
}

async function terminateProcessTree(child, closedPromise, isClosed, options = {}) {
  const graceMs = options.graceMs || TERMINATION_GRACE_MS;
  const platform = options.platform || process.platform;
  const killProcess = options.killProcess || process.kill;
  if (isClosed()) return;
  if (platform === "win32" && Number.isInteger(child.pid)) {
    let taskkillResult = { closed: false };
    try {
      const killer = childProcess.spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
      taskkillResult = await waitForProcess(killer, graceMs);
      if (!taskkillResult.closed) {
        try { killer.kill("SIGKILL"); } catch { /* taskkill already stopped */ }
      }
    } catch { /* fall through to direct forced termination */ }
    if ((!taskkillResult.closed || taskkillResult.code !== 0) && !isClosed()) {
      try { child.kill("SIGKILL"); } catch { /* child already stopped */ }
    }
    await closedPromise;
    return;
  }

  try {
    if (Number.isInteger(child.pid)) killProcess(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch { /* child already stopped */ }
  }
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  if (Number.isInteger(child.pid) || !isClosed()) {
    try {
      if (Number.isInteger(child.pid)) killProcess(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      try { child.kill("SIGKILL"); } catch { /* child already stopped */ }
    }
  }
  await closedPromise;
}

function runCommandAsync(command, args, options = {}, spawn = childProcess.spawn) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"]
      });
    }
    catch (error) { resolve({ status: null, stdout: "", stderr: "", error }); return; }
    const maxOutputBytes = Number.isSafeInteger(options.maxOutputBytes) && options.maxOutputBytes >= 0
      ? options.maxOutputBytes : MAX_COMMAND_OUTPUT_BYTES;
    const stdout = captureOutput(maxOutputBytes);
    const stderr = captureOutput(maxOutputBytes);
    let settled = false;
    let closed = false;
    let timedOut = false;
    let spawnError = null;
    let timer = null;
    let closeResolve;
    const closedPromise = new Promise((done) => { closeResolve = done; });
    const finish = (status, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status,
        stdout: outputText(stdout),
        stderr: outputText(stderr),
        ...(error ? { error } : {})
      });
    };
    child.stdout?.on("data", (chunk) => appendOutput(stdout, chunk));
    child.stderr?.on("data", (chunk) => appendOutput(stderr, chunk));
    child.on("error", (error) => {
      spawnError = error;
      if (!Number.isInteger(child.pid) && !closed) {
        closed = true;
        closeResolve();
        finish(null, error);
      }
    });
    child.on("close", (code) => {
      if (!closed) {
        closed = true;
        closeResolve();
      }
      if (!timedOut) finish(code, spawnError);
    });
    timer = setTimeout(async () => {
      if (settled || closed) return;
      timedOut = true;
      const error = new Error(`Command timed out after ${options.timeout || COMPILE_TIMEOUT_MS}ms`);
      try {
        await terminateProcessTree(child, closedPromise, () => closed, { graceMs: options.graceMs });
      } catch { /* timeout remains the primary error */ }
      finish(null, error);
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
  terminateProcessTree,
  extractLatexExcerpt,
  compileTemplate,
  compileTemplateAsync
};
