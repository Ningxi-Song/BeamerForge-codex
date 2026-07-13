"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function assertInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw httpError(400, "Project download is outside the output directory");
  }
}

function writeOctal(buffer, offset, length, value) {
  const octal = Number(value).toString(8).padStart(length - 1, "0");
  if (octal.length > length - 1) throw new Error("Archive value is too large");
  buffer.write(octal, offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

function createHeader(name, size) {
  if (Buffer.byteLength(name) > 100) throw httpError(400, `Archive path is too long: ${name}`);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function collect(directory, prefix = "") {
  const files = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw httpError(400, `Project contains a symbolic link: ${relative}`);
    if (entry.isDirectory()) files.push(...collect(absolute, relative));
    else if (entry.isFile() && !entry.name.endsWith(".tmp")) files.push({ absolute, relative });
    else if (!entry.isFile()) throw httpError(400, `Project contains an unsupported file: ${relative}`);
  }
  return files;
}

function createProjectArchive({ outputRoot, projectDir }) {
  assertInside(outputRoot, projectDir);
  let stat;
  try { stat = fs.statSync(projectDir); }
  catch (error) {
    if (error.code === "ENOENT") throw httpError(404, "Generated project was not found");
    throw error;
  }
  if (!stat.isDirectory()) throw httpError(404, "Generated project was not found");
  const blocks = [];
  for (const file of collect(projectDir)) {
    const bytes = fs.readFileSync(file.absolute);
    blocks.push(createHeader(file.relative, bytes.length), bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9 });
}

module.exports = { createProjectArchive };
