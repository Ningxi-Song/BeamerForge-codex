const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { findCompiler, findCompilerAsync, runCommandAsync, terminateProcessTree, extractLatexExcerpt, compileTemplate, compileTemplateAsync } = require("../workbench/build");

test("findCompiler returns missing when no compiler command succeeds", () => {
  const fakeSpawn = () => ({ status: 1, error: new Error("missing") });
  const result = findCompiler(fakeSpawn);
  assert.equal(result.kind, "missing");
});

test("findCompiler prefers latexmk when available", () => {
  const fakeSpawn = (command) => ({ status: command === "latexmk" ? 0 : 1 });
  const result = findCompiler(fakeSpawn);
  assert.equal(result.kind, "latexmk");
  assert.equal(result.command, "latexmk");
});

test("findCompiler forces latexmk rebuilds to recover from stale failed state", () => {
  const fakeSpawn = (command) => ({ status: command === "latexmk" ? 0 : 1 });
  const result = findCompiler(fakeSpawn);

  assert.deepEqual(result.args, ["-g", "-xelatex", "-interaction=nonstopmode", "main.tex"]);
});

test("findCompiler falls back to tectonic when latexmk and xelatex are unavailable", () => {
  const fakeSpawn = (command) => ({ status: command === "tectonic" ? 0 : 1 });
  const result = findCompiler(fakeSpawn);
  assert.equal(result.kind, "tectonic");
  assert.equal(result.command, "tectonic");
  assert.deepEqual(result.args, ["main.tex"]);
});

test("extractLatexExcerpt returns useful error lines", () => {
  const excerpt = extractLatexExcerpt("line one\n! Undefined control sequence.\nl.12 bad macro\nmore text");
  assert.match(excerpt, /Undefined control sequence/);
  assert.match(excerpt, /l\.12/);
});

test("compileTemplate reports missing compiler", () => {
  const result = compileTemplate("C:/no-project", {
    spawnSync: () => ({ status: 1, error: new Error("missing") })
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "missing-compiler");
  assert.equal(result.compilerKind, "missing");
  assert.match(result.message, /latexmk, xelatex, or tectonic/);
});

test("findCompiler passes numeric timeout to compiler probes", () => {
  const fakeSpawn = (command, args, options) => {
    assert.equal(typeof options.timeout, "number");
    assert.ok(options.timeout > 0);
    return { status: command === "xelatex" ? 0 : 1 };
  };

  const result = findCompiler(fakeSpawn);

  assert.equal(result.kind, "xelatex");
});

test("compileTemplate returns success when fake xelatex writes a PDF", () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "beamer-build-success-"));
  const calls = [];
  const fakeSpawn = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "xelatex" && options.cwd === templateDir) {
      assert.equal(typeof options.timeout, "number");
      assert.ok(options.timeout > 0);
      fs.writeFileSync(path.join(templateDir, "main.pdf"), "fake pdf");
      return { status: 0, stdout: "compiled", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "" };
  };

  const result = compileTemplate(templateDir, {
    spawnSync: fakeSpawn,
    compiler: { kind: "xelatex", command: "xelatex", args: ["main.tex"] }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "compiled");
  assert.equal(result.compilerKind, "xelatex");
  assert.equal(result.command, "xelatex main.tex");
  assert.equal(result.exitCode, 0);
  assert.equal(path.basename(result.pdfPath), "main.pdf");
  assert.equal(fs.existsSync(result.logPath), true);
  assert.equal(calls.length, 2);
});

test("compileTemplate returns a LaTeX excerpt for failed compiles", () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "beamer-build-fail-"));
  const fakeSpawn = (command, args, options) => {
    assert.equal(typeof options.timeout, "number");
    assert.ok(options.timeout > 0);
    return { status: 1, stdout: "! Undefined control sequence.\nl.7 bad", stderr: "" };
  };

  const result = compileTemplate(templateDir, {
    spawnSync: fakeSpawn,
    compiler: { kind: "xelatex", command: "xelatex", args: ["main.tex"] }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "compile-failed");
  assert.equal(result.compilerKind, "xelatex");
  assert.equal(result.command, "xelatex main.tex");
  assert.equal(result.exitCode, 1);
  assert.match(result.excerpt, /Undefined control sequence/);
});

test("compileTemplate includes spawn errors when compiler produces no output", () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "beamer-build-error-"));
  const fakeSpawn = (command, args, options) => {
    assert.equal(typeof options.timeout, "number");
    assert.ok(options.timeout > 0);
    return { status: null, stdout: "", stderr: "", error: new Error("spawn blew up") };
  };

  const result = compileTemplate(templateDir, {
    spawnSync: fakeSpawn,
    compiler: { kind: "xelatex", command: "xelatex", args: ["main.tex"] }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "compile-failed");
  assert.equal(result.compilerKind, "xelatex");
  assert.equal(result.command, "xelatex main.tex");
  assert.equal(result.exitCode, null);
  assert.match(`${result.excerpt}\n${result.message}`, /spawn blew up/);
  assert.match(fs.readFileSync(result.logPath, "utf8"), /spawn blew up/);
});

test("findCompilerAsync probes compilers without synchronous spawning", async () => {
  const calls = [];
  const compiler = await findCompilerAsync(async (command, args, options) => {
    calls.push({ command, args, options });
    return { status: command === "tectonic" ? 0 : 1, stdout: "", stderr: "" };
  });
  assert.equal(compiler.kind, "tectonic");
  assert.deepEqual(calls.map((call) => call.command), ["latexmk", "xelatex", "tectonic"]);
  assert.equal(calls.every((call) => call.options.windowsHide === true), true);
});

test("compileTemplateAsync runs two xelatex passes and captures logs", async () => {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "beamer-build-async-"));
  let calls = 0;
  const result = await compileTemplateAsync(templateDir, {
    compiler: { kind: "xelatex", command: "xelatex", args: ["main.tex"] },
    async runCommand(command, args, options) {
      calls++;
      assert.equal(options.cwd, templateDir);
      fs.writeFileSync(path.join(templateDir, "main.pdf"), "async pdf");
      return { status: 0, stdout: `pass ${calls}`, stderr: "" };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.compilerKind, "xelatex");
  assert.equal(calls, 2);
  assert.match(fs.readFileSync(result.logPath, "utf8"), /pass 1[\s\S]*pass 2/);
});

test("runCommandAsync captures output and kills timed out children", async () => {
  let killed = false;
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { killed = true; child.emit("close", null); };
  const resultPromise = runCommandAsync("xelatex", ["main.tex"], { timeout: 5 }, () => child);
  child.stdout.emit("data", Buffer.from("partial"));
  const result = await resultPromise;
  assert.equal(killed, true);
  assert.equal(result.status, null);
  assert.match(result.error.message, /timed out/i);
  assert.equal(result.stdout, "partial");
});

test("runCommandAsync does not resolve a timeout until the child closes", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => true;
  const resultPromise = runCommandAsync("xelatex", ["main.tex"], { timeout: 5, graceMs: 5 }, () => child);
  const early = await Promise.race([
    resultPromise.then(() => "resolved"),
    new Promise((resolve) => setTimeout(() => resolve("waiting"), 25))
  ]);
  assert.equal(early, "waiting");
  child.emit("close", null, "SIGKILL");
  assert.match((await resultPromise).error.message, /timed out/i);
});

test("POSIX process-tree cleanup escalates the group after grace even when its leader closes", async () => {
  const signals = [];
  let closed = false;
  let closeLeader;
  const closedPromise = new Promise((resolve) => { closeLeader = resolve; });
  const child = { pid: 424242, kill() {} };

  await terminateProcessTree(child, closedPromise, () => closed, {
    platform: "linux",
    graceMs: 5,
    killProcess(pid, signal) {
      signals.push([pid, signal]);
      if (signal === "SIGTERM") {
        closed = true;
        closeLeader();
      }
    }
  });

  assert.deepEqual(signals, [
    [-child.pid, "SIGTERM"],
    [-child.pid, "SIGKILL"]
  ]);
});

test("runCommandAsync bounds stdout and stderr without changing successful or nonzero exits", async () => {
  const success = await runCommandAsync(process.execPath, ["-e", "process.stdout.write('o'.repeat(200000));process.stderr.write('e'.repeat(200000))"], { maxOutputBytes: 1024 });
  assert.equal(success.status, 0);
  assert.equal(success.stdout.length, 1024);
  assert.equal(success.stderr.length, 1024);
  assert.equal(success.error, undefined);

  const failure = await runCommandAsync(process.execPath, ["-e", "process.stderr.write('failed');process.exit(7)"], { maxOutputBytes: 1024 });
  assert.equal(failure.status, 7);
  assert.equal(failure.stderr, "failed");
  assert.equal(failure.error, undefined);
});

test("runCommandAsync waits for timeout cleanup and terminates child process trees", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bf-build-timeout-tree-"));
  const marker = path.join(root, "orphan.txt");
  const grandchild = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'orphan'),1200)`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  try {
    const result = await runCommandAsync(process.execPath, ["-e", parent], { timeout: 500, graceMs: 400, maxOutputBytes: 1024 });
    assert.equal(result.status, null);
    assert.match(result.error.message, /timed out/i);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
