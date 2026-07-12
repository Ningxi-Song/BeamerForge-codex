const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { findCompiler, extractLatexExcerpt, compileTemplate } = require("../workbench/build");

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
