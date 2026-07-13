const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const { createProjectArchive } = require("../workbench/project-archive");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readTar(buffer) {
  const tar = zlib.gunzipSync(buffer);
  const entries = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeText = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const start = offset + 512;
    entries.push({ name, bytes: tar.subarray(start, start + size) });
    offset = start + Math.ceil(size / 512) * 512;
  }
  return entries;
}

test("project archive is deterministic, sorted, and excludes temporary files", () => {
  const outputRoot = tempDir("beamerforge-archive-root-");
  const projectDir = path.join(outputRoot, "paper-theme");
  fs.mkdirSync(path.join(projectDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "main.tex"), "\\documentclass{beamer}\n", "utf8");
  fs.writeFileSync(path.join(projectDir, "assets", "a.txt"), "asset", "utf8");
  fs.writeFileSync(path.join(projectDir, "build.tmp"), "discard", "utf8");

  const first = createProjectArchive({ outputRoot, projectDir });
  const second = createProjectArchive({ outputRoot, projectDir });
  const entries = readTar(first);

  assert.equal(Buffer.isBuffer(first), true);
  assert.deepEqual(first, second);
  assert.deepEqual(entries.map(({ name }) => name), ["assets/a.txt", "main.tex"]);
  assert.equal(entries.find(({ name }) => name === "main.tex").bytes.toString("utf8"), "\\documentclass{beamer}\n");
});

test("project archive rejects projects outside the configured output root", () => {
  const outputRoot = tempDir("beamerforge-archive-root-");
  const projectDir = tempDir("beamerforge-archive-outside-");
  fs.writeFileSync(path.join(projectDir, "main.tex"), "outside", "utf8");
  assert.throws(() => createProjectArchive({ outputRoot, projectDir }), /outside the output directory/);
});

test("project archive rejects symbolic links when the platform permits creating one", (t) => {
  const outputRoot = tempDir("beamerforge-archive-root-");
  const projectDir = path.join(outputRoot, "paper-theme");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "main.tex"), "safe", "utf8");
  const outside = path.join(tempDir("beamerforge-link-target-"), "secret.txt");
  fs.writeFileSync(outside, "secret", "utf8");
  try {
    fs.symlinkSync(outside, path.join(projectDir, "secret.txt"), "file");
  } catch (error) {
    if (["EPERM", "EACCES"].includes(error.code)) { t.skip("symbol creation is unavailable on this Windows host"); return; }
    throw error;
  }
  assert.throws(() => createProjectArchive({ outputRoot, projectDir }), /symbolic link/);
});
