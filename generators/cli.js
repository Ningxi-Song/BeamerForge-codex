"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { writeTemplateProject } = require("./project-writer");

function parseArgs(argv) {
  const args = { theme: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--theme") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error("Missing value for --theme");
      args.theme = argv[++i];
    } else if (arg === "--out") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error("Missing value for --out");
      args.out = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readTheme(themePath) {
  if (!themePath) return DEFAULT_THEME;
  if (themePath === "theme.json" && !fs.existsSync(themePath)) return DEFAULT_THEME;
  return JSON.parse(fs.readFileSync(themePath, "utf8"));
}

function main(argv = process.argv) {
  const args = parseArgs(argv);
  const theme = readTheme(args.theme);
  const outDir = path.resolve(args.out || path.join("templates", theme.identity.name));
  const manifest = writeTemplateProject(theme, outDir, {
    registry: getRegistry(),
    rootDir: process.cwd()
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { parseArgs, main };
