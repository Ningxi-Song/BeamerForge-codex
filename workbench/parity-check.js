"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { DEFAULT_THEME } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const { resolveDesignBundle } = require("../design/resolve-design");
const { renderSvg } = require("../design/vector-renderers");
const { generateResolvedFiles } = require("../generators/latex");

// Browser and PDF font rasterizers differ substantially. RMSE <= 0.20 catches
// layout/color regressions while tolerating antialiasing and font hinting.
const IMAGE_DISTANCE_TOLERANCE = 0.20;
const DOMINANT_COLOR_DISTANCE_TOLERANCE = 0.05;
const REGION_IMAGE_DISTANCE_TOLERANCE = 0.40;
// Pixels at least 8% of the RGB diagonal away from the resolved background are
// foreground. Each tight component box must contain 0.1%-70% foreground;
// browser/PDF coverage may differ by 20%; centroid movement is bounded to 12%
// on each axis; and the mean L1 difference across a 4x4 occupancy grid is 8%.
// These gates reject material movement while allowing 3%-5% raster/font drift.
const FOREGROUND_COLOR_DISTANCE = 0.08;
const REGION_COVERAGE_MINIMUM = 0.001;
const REGION_COVERAGE_MAXIMUM = 0.70;
const REGION_COVERAGE_DELTA_MAXIMUM = 0.20;
const REGION_CENTROID_DELTA_MAXIMUM = 0.35;
const REGION_CENTROID_AXIS_DELTA_MAXIMUM = 0.12;
const REGION_SPATIAL_DELTA_MAXIMUM = 0.08;
const COMMAND_TIMEOUT_MS = 60_000;
const TERMINATION_GRACE_MS = 2_000;
const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;

function clone(value) { return structuredClone(value); }

function createStressFixtures() {
  const create = (id, mutate = () => {}) => {
    const theme = clone(DEFAULT_THEME);
    theme.identity.name = `parity-${id}`;
    mutate(theme);
    return { id, theme };
  };
  const fixtures = [
    create("default"),
    create("dark", (theme) => {
      theme.colors = { ...getRegistry().palettes["midnight-blue"].colors, paletteId: "midnight-blue" };
      theme.navigation.style = "soft-miniframes";
    }),
    create("four-three", (theme) => { theme.foundation.aspectRatio = "4:3"; }),
    create("duck", (theme) => {
      theme.decorations.cornerLogo = { id: "duck", position: "top-right", size: "medium", scope: "content-frames" };
    }),
    create("long-content", (theme) => {
      theme.contentDefaults.sampleTitle = "A deliberately long conclusion-driven title exposes renderer overflow before a presentation is compiled";
      theme.contentDefaults.sampleBullets = [
        "Renderer parity should remain visible when realistic academic prose wraps across multiple lines in a dense presentation layout.",
        "The content region includes enough explanatory language to stress line breaking, vertical rhythm, and block placement in both outputs.",
        `One deliberately long token ${"overflow".repeat(22)} supplements the realistic wrapping text without replacing it.`,
        "Warnings remain informational so authors can shorten material after reviewing the compiled slide."
      ];
    })
  ];
  for (const [aspectId, aspectRatio] of [["four-three", "4:3"], ["sixteen-nine", "16:9"]]) {
    for (const size of ["small", "medium"]) {
      for (const position of ["left", "right"]) {
        fixtures.push(create(`${aspectId}-duck-${size}-${position}`, (theme) => {
          theme.foundation.aspectRatio = aspectRatio;
          theme.decorations.cornerLogo = {
            id: "duck",
            position: `top-${position}`,
            size,
            scope: "content-frames"
          };
        }));
      }
    }
  }
  return fixtures;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}

function dataSvg(vector) {
  if (vector === null) return "";
  return `data:image/svg+xml;base64,${Buffer.from(renderSvg(vector), "utf8").toString("base64")}`;
}

function renderPreviewDocument(design) {
  const width = design.canvas.aspectRatio === "4:3" ? 1024 : 1280;
  const height = design.canvas.aspectRatio === "4:3" ? 768 : 720;
  const logo = design.components.cornerLogo;
  const logoHtml = logo.vectorId === null ? "" : `<img class="logo ${escapeHtml(logo.position)}" data-vector-id="${escapeHtml(logo.vectorId)}" src="${dataSvg(logo.vector)}" alt="${escapeHtml(logo.label)} corner logo">`;
  const header = design.components.navigation.header ? `<div class="header">Section 1</div>` : "";
  const footline = design.components.navigation.footline ? `<div class="footline">${escapeHtml(design.identity.name)} | 1 / 3</div>` : "";
  const bullets = design.content.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");
  const hash = design.source.themeHash;
  return {
    width,
    height,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="theme-hash" content="${hash}"><style>
*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}body{background:${design.colors.background};color:${design.colors.text};font-family:${design.typography.body.cssFamily}}
.slide{position:relative;width:100%;height:100%;padding:6% 7%;display:flex;flex-direction:column}.header{border-bottom:2px solid ${design.colors.primary};padding-bottom:8px;margin-bottom:18px}.title{font:700 48px/1.08 ${design.typography.title.cssFamily};color:${design.colors.primary};margin:0 0 24px}.list{font-size:26px;line-height:1.35;list-style:none;padding:0;margin:0 0 24px}.list li::before{content:${JSON.stringify(design.components.bullet.marker + " ")};color:${design.colors.accent};font-weight:700}.block{border-radius:${design.components.block.cssRadius};box-shadow:${design.components.block.cssShadow};overflow:hidden}.block-title{padding:8px 14px;background:${design.colors.primary};color:${design.colors.primaryText};font-weight:700}.block-body{padding:12px 14px;background:${design.colors.blockBody}}.footline{position:absolute;left:7%;right:7%;bottom:3%;border-top:2px solid ${design.colors.primary};padding-top:8px;text-align:right;color:${design.colors.primary}}.logo{position:absolute;top:3.5%;width:${logo.widthFraction * 100}%}.logo.top-right{right:3.5%}.logo.top-left{left:3.5%}
</style></head><body><main class="slide" data-theme-hash="${hash}" data-aspect-ratio="${design.canvas.aspectRatio}" data-duck="${logo.vectorId === "duck" ? "present" : "absent"}">${logoHtml}${header}<h1 class="title">${escapeHtml(design.content.sampleTitle)}</h1><ul class="list">${bullets}</ul><section class="block"><div class="block-title">${escapeHtml(design.content.blockTitle)}</div><div class="block-body">${escapeHtml(design.content.blockBody)}</div></section>${footline}</main></body></html>`
  };
}

function renderStandaloneHtml(fixture, registry = getRegistry()) {
  const bundle = resolveDesignBundle(fixture.theme, registry);
  const design = bundle.design;
  const files = generateResolvedFiles(design);
  files["main.tex"] = `% parity-theme-hash:${design.source.themeHash}\n% parity-aspect-ratio:${design.canvas.aspectRatio}\n${files["main.tex"]}`;
  const preview = renderPreviewDocument(design);
  return { fixtureId: fixture.id, theme: bundle.theme, design, files, ...preview };
}

function verifyStructuralLandmarks(artifacts) {
  const { design, html, files } = artifacts;
  const overview = files["content/overview.tex"] || "";
  const themeClass = files["theme.cls"] || "";
  const themeHash = html.includes(`data-theme-hash="${design.source.themeHash}"`)
    && files["main.tex"].includes(`parity-theme-hash:${design.source.themeHash}`);
  const aspectToken = design.canvas.aspectRatio === "4:3" ? "aspectratio=43" : "aspectratio=169";
  const aspectRatio = html.includes(`data-aspect-ratio="${design.canvas.aspectRatio}"`)
    && themeClass.includes(aspectToken);
  const title = html.includes(escapeHtml(design.content.sampleTitle))
    && overview.includes(design.content.sampleTitle);
  const content = design.content.bullets.every((bullet) => html.includes(escapeHtml(bullet)) && overview.includes(bullet));
  const duckExpected = design.components.cornerLogo.vectorId === "duck";
  const duck = html.includes(`data-duck="${duckExpected ? "present" : "absent"}"`)
    && (duckExpected ? themeClass.includes("tikzpicture") : !themeClass.includes("tikzpicture"));
  return { ok: themeHash && aspectRatio && title && content && duck, themeHash, aspectRatio, title, content, duck };
}

function renderedRegions(artifacts) {
  const { width, height, design } = artifacts;
  const hasHeader = design.components.navigation.header;
  const region = (id, x, y, w, h, overrides = {}) => ({
    id,
    geometry: `${Math.round(w)}x${Math.round(h)}+${Math.round(x)}+${Math.round(y)}`,
    coverageMinimum: REGION_COVERAGE_MINIMUM,
    coverageMaximum: REGION_COVERAGE_MAXIMUM,
    centroidBounds: { minX: 0.03, maxX: 0.97, minY: 0.03, maxY: 0.97 },
    coverageDeltaMaximum: REGION_COVERAGE_DELTA_MAXIMUM,
    centroidDeltaMaximum: REGION_CENTROID_DELTA_MAXIMUM,
    centroidAxisDeltaMaximum: REGION_CENTROID_AXIS_DELTA_MAXIMUM,
    spatialDeltaMaximum: REGION_SPATIAL_DELTA_MAXIMUM,
    imageDistanceTolerance: REGION_IMAGE_DISTANCE_TOLERANCE,
    ...overrides
  });
  const regions = [
    region("title", width * 0.06, height * (hasHeader ? 0.13 : 0.09), width * 0.70, height * (hasHeader ? 0.14 : 0.18)),
    region("content", width * 0.06, height * (hasHeader ? 0.30 : 0.27), width * 0.88, height * (hasHeader ? 0.45 : 0.48)),
  ];
  if (hasHeader) {
    regions.push(region("header", width * 0.06, height * 0.025, width * 0.88, height * 0.09));
  }
  if (design.components.navigation.footline) {
    regions.push(region("footer", width * 0.06, height * 0.88, width * 0.88, height * 0.10));
  }
  if (design.components.cornerLogo.vectorId === "duck") {
    const isLeft = design.components.cornerLogo.position === "top-left";
    regions.push(region("duck", isLeft ? width * 0.015 : width * 0.82, height * 0.015, width * 0.165, height * 0.22, {
      imageDistanceTolerance: 0.50
    }));
  }
  return regions;
}

function parseDominantColor(output) {
  const colors = [];
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+):\s*\(\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*\d+(?:\.\d+)?)?\s*\)/);
    if (!match) continue;
    const count = Number(match[1]);
    const rgb = match.slice(2, 5).map(Number);
    if (!Number.isFinite(count) || count < 0 || rgb.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) continue;
    colors.push({ count, rgb });
  }
  if (colors.length === 0) throw new Error("Unable to parse ImageMagick histogram");
  colors.sort((a, b) => b.count - a.count || a.rgb.join(",").localeCompare(b.rgb.join(",")));
  return colors[0];
}

function normalizedRgbDistance(first, second) {
  if (![first, second].every((rgb) => Array.isArray(rgb) && rgb.length === 3 && rgb.every(Number.isFinite))) {
    throw new Error("RGB distance requires two finite colors");
  }
  return Math.sqrt(first.reduce((sum, value, index) => sum + (value - second[index]) ** 2, 0)) / Math.sqrt(3 * 255 ** 2);
}

function isNormalized(value) { return Number.isFinite(value) && value >= 0 && value <= 1; }

function rgbFromHex(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!match) throw new Error("Resolved background must be a #RRGGBB color");
  return [1, 3, 5].map((index) => Number.parseInt(match[1].slice(index - 1, index + 1), 16));
}

function geometryValues(geometry) {
  const match = /^(\d+)x(\d+)\+(\d+)\+(\d+)$/.exec(geometry);
  if (!match) throw new Error(`Invalid region geometry: ${geometry}`);
  return match.slice(1).map(Number);
}

function analyzeRawRgb(artifacts, raw) {
  const expectedBytes = artifacts.width * artifacts.height * 3;
  if (!Buffer.isBuffer(raw) || raw.length !== expectedBytes) {
    throw new Error(`Raw RGB output must contain exactly ${expectedBytes} bytes`);
  }
  const background = rgbFromHex(artifacts.design.colors.background);
  const signatures = {};
  for (const required of renderedRegions(artifacts)) {
    const [width, height, x, y] = geometryValues(required.geometry);
    if (x + width > artifacts.width || y + height > artifacts.height) throw new Error(`Region ${required.id} exceeds canvas`);
    let ink = 0, sumX = 0, sumY = 0;
    const binInk = Array(16).fill(0);
    const binPixels = Array(16).fill(0);
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        const offset = (row * artifacts.width + column) * 3;
        const localX = (column - x + 0.5) / width;
        const localY = (row - y + 0.5) / height;
        const bin = Math.min(3, Math.floor(localY * 4)) * 4 + Math.min(3, Math.floor(localX * 4));
        binPixels[bin] += 1;
        const distance = normalizedRgbDistance([raw[offset], raw[offset + 1], raw[offset + 2]], background);
        if (distance < FOREGROUND_COLOR_DISTANCE) continue;
        ink += 1;
        sumX += localX;
        sumY += localY;
        binInk[bin] += 1;
      }
    }
    signatures[required.id] = {
      coverage: ink / (width * height),
      centroid: ink === 0 ? null : { x: sumX / ink, y: sumY / ink },
      occupancy: binInk.map((count, index) => count / binPixels[index])
    };
  }
  return signatures;
}

function combineRegionSignatures(artifacts, htmlSignatures, pdfSignatures, distances) {
  const combined = {};
  for (const required of renderedRegions(artifacts)) {
    const html = htmlSignatures[required.id];
    const pdf = pdfSignatures[required.id];
    const imageDistance = distances[required.id];
    const coverageDelta = html && pdf ? Math.abs(html.coverage - pdf.coverage) : NaN;
    const centroidDelta = html?.centroid && pdf?.centroid
      ? Math.hypot(html.centroid.x - pdf.centroid.x, html.centroid.y - pdf.centroid.y) / Math.SQRT2
      : NaN;
    const centroidAxisDelta = html?.centroid && pdf?.centroid
      ? { x: Math.abs(html.centroid.x - pdf.centroid.x), y: Math.abs(html.centroid.y - pdf.centroid.y) }
      : { x: NaN, y: NaN };
    const spatialDelta = Array.isArray(html?.occupancy) && Array.isArray(pdf?.occupancy)
      && html.occupancy.length === 16 && pdf.occupancy.length === 16
      ? html.occupancy.reduce((sum, value, index) => sum + Math.abs(value - pdf.occupancy[index]), 0) / 16
      : NaN;
    const centroidInside = (signature) => signature?.centroid
      && signature.centroid.x >= required.centroidBounds.minX
      && signature.centroid.x <= required.centroidBounds.maxX
      && signature.centroid.y >= required.centroidBounds.minY
      && signature.centroid.y <= required.centroidBounds.maxY;
    combined[required.id] = {
      html,
      pdf,
      imageDistance,
      coverageDelta,
      centroidDelta,
      centroidAxisDelta,
      spatialDelta,
      pass: Boolean(
        html && pdf
        && html.coverage >= required.coverageMinimum && html.coverage <= required.coverageMaximum
        && pdf.coverage >= required.coverageMinimum && pdf.coverage <= required.coverageMaximum
        && centroidInside(html) && centroidInside(pdf)
        && coverageDelta <= required.coverageDeltaMaximum
        && centroidDelta <= required.centroidDeltaMaximum
        && centroidAxisDelta.x <= required.centroidAxisDeltaMaximum
        && centroidAxisDelta.y <= required.centroidAxisDeltaMaximum
        && spatialDelta <= required.spatialDeltaMaximum
        && imageDistance <= required.imageDistanceTolerance
      )
    };
  }
  return combined;
}

function invalidMeasurement(message, measured = {}) {
  return { ...measured, status: "fail", message: `Invalid measurement: ${message}` };
}

function validateMeasuredResult(artifacts, measured) {
  if (!measured || typeof measured !== "object" || !["pass", "fail", "unavailable"].includes(measured.status)) {
    return invalidMeasurement("status must be pass, fail, or unavailable");
  }
  if (measured.status !== "pass") return measured;
  if (measured.structuralLandmarks?.ok !== true) return invalidMeasurement("structuralLandmarks.ok must be true", measured);
  if (!isNormalized(measured.imageDistance) || measured.imageDistance > IMAGE_DISTANCE_TOLERANCE) {
    return invalidMeasurement("imageDistance must be a finite normalized value in [0,1] and within tolerance", measured);
  }
  if (!isNormalized(measured.dominantColorDistance) || measured.dominantColorDistance > DOMINANT_COLOR_DISTANCE_TOLERANCE) {
    return invalidMeasurement("dominantColorDistance must be a finite normalized value in [0,1] and within tolerance", measured);
  }
  if (!measured.regions || typeof measured.regions !== "object") return invalidMeasurement("regions are required", measured);
  for (const required of renderedRegions(artifacts)) {
    const value = measured.regions[required.id];
    const normalized = value
      && [value.imageDistance, value.coverageDelta, value.centroidDelta, value.centroidAxisDelta?.x,
        value.centroidAxisDelta?.y, value.spatialDelta, value.html?.coverage, value.pdf?.coverage,
        value.html?.centroid?.x, value.html?.centroid?.y, value.pdf?.centroid?.x, value.pdf?.centroid?.y].every(isNormalized);
    const normalizedOccupancy = [value?.html?.occupancy, value?.pdf?.occupancy]
      .every((bins) => Array.isArray(bins) && bins.length === 16 && bins.every(isNormalized));
    const passing = normalized && normalizedOccupancy && value.pass === true
      && value.imageDistance <= required.imageDistanceTolerance
      && value.coverageDelta <= required.coverageDeltaMaximum
      && value.centroidDelta <= required.centroidDeltaMaximum
      && value.centroidAxisDelta.x <= required.centroidAxisDeltaMaximum
      && value.centroidAxisDelta.y <= required.centroidAxisDeltaMaximum
      && value.spatialDelta <= required.spatialDeltaMaximum;
    if (!passing) return invalidMeasurement(`region ${required.id} must contain finite normalized [0,1] passing signature metrics`, measured);
  }
  return measured;
}

async function discoverToolchain(which = defaultWhich, probe = null) {
  const probeTool = probe || (which === defaultWhich ? defaultProbe : async () => true);
  async function first(candidates) {
    for (const [kind, name] of candidates) {
      const executable = await which(name);
      if (!executable) continue;
      const tool = { kind, path: executable };
      if (await probeTool(tool)) return tool;
    }
    return null;
  }
  const tools = {
    latex: await first([["latexmk", "latexmk.exe"], ["latexmk", "latexmk"], ["xelatex", "xelatex.exe"], ["xelatex", "xelatex"]]),
    pdftoppm: await first([["pdftoppm", "pdftoppm.exe"], ["pdftoppm", "pdftoppm"]]),
    compare: await first([["magick", "magick.exe"], ["magick", "magick"], ["compare", "compare.exe"], ["compare", "compare"]]),
    browser: await first([["chromium", "chromium.exe"], ["chromium", "chromium"], ["chromium", "chromium-browser"], ["chrome", "chrome.exe"], ["chrome", "chrome"], ["chrome", "google-chrome"], ["msedge", "msedge.exe"], ["msedge", "msedge"]])
  };
  if (tools.compare?.kind === "compare") {
    const stats = await first([["convert", "convert.exe"], ["convert", "convert"]]);
    tools.compare = stats ? { ...tools.compare, statsPath: stats.path } : null;
  }
  const missing = [];
  if (!tools.latex) missing.push("latex");
  if (!tools.pdftoppm) missing.push("pdftoppm");
  if (!tools.compare) missing.push("imagemagick");
  if (!tools.browser) missing.push("browser");
  return { tools, missing };
}

async function defaultProbe(tool) {
  const browser = ["chrome", "chromium", "msedge"].includes(tool.kind);
  let profile = null;
  try {
    const args = browser
      ? [
        "--headless=new", "--disable-gpu", "--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND", "--no-first-run",
        `--user-data-dir=${profile = fs.mkdtempSync(path.join(os.tmpdir(), "bf-browser-probe-"))}`,
        "--dump-dom", "data:text/html,<script>document.write(navigator.userAgent)</script>"
      ]
      : tool.kind === "pdftoppm" ? ["-v"] : ["--version"];
    const result = await runCommand(tool.path, args, { timeoutMs: 5_000 });
    return result.code === 0 && !result.timedOut && probeOutputMatches(tool.kind, `${result.stdout}\n${result.stderr}`);
  } catch {
    return false;
  } finally {
    if (profile) {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  }
}

function probeOutputMatches(kind, output) {
  const patterns = {
    latexmk: /Latexmk/i,
    xelatex: /XeTeX|XeLaTeX/i,
    pdftoppm: /pdftoppm/i,
    magick: /ImageMagick/i,
    compare: /ImageMagick/i,
    convert: /ImageMagick/i,
    chrome: /Chrome\/[\d.]+/i,
    chromium: /Chrom(?:e|ium)\/[\d.]+/i,
    msedge: /Edg\/[\d.]+/i
  };
  return Boolean(patterns[kind]?.test(String(output || "")));
}

function defaultWhich(name) {
  const windowsCandidates = process.platform === "win32" ? {
    chrome: ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"],
    msedge: ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"]
  }[name] || [] : [];
  for (const candidate of windowsCandidates) if (fs.existsSync(candidate)) return Promise.resolve(candidate);
  const command = process.platform === "win32" ? "where.exe" : "which";
  return runCommand(command, [name], { timeoutMs: 5_000 }).then((result) => {
    if (result.code !== 0) return null;
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
  }).catch(() => null);
}

function boundedAppend(current, chunk, limit = MAX_COMMAND_OUTPUT_BYTES) {
  if (current.length >= limit) return current;
  return current + String(chunk).slice(0, limit - current.length);
}

function waitForChild(child, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
    child.once("close", finish);
    child.once("error", finish);
    const timer = setTimeout(finish, timeoutMs);
  });
}

async function terminateProcessTree(child, options = {}) {
  if (!child || !Number.isInteger(child.pid)) return;
  const platform = options.platform || process.platform;
  const spawnImpl = options.spawnImpl || spawn;
  if (platform === "win32") {
    let killer;
    try {
      killer = spawnImpl("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
    } catch {
      try { child.kill("SIGKILL"); } catch {}
      return;
    }
    await waitForChild(killer, options.graceMs || TERMINATION_GRACE_MS);
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); }
  catch { try { child.kill("SIGTERM"); } catch {} }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const spawnImpl = options.spawnImpl || spawn;
    const platform = options.platform || process.platform;
    const child = spawnImpl(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      detached: platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "", stderr = "", settled = false, timedOut = false;
    let timer, graceTimer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      resolve({ stdout, stderr, ...result });
    };
    child.stdout?.on("data", (chunk) => { stdout = boundedAppend(stdout, chunk, options.maxOutputBytes); });
    child.stderr?.on("data", (chunk) => { stderr = boundedAppend(stderr, chunk, options.maxOutputBytes); });
    child.on("error", (error) => { if (!timedOut) finish({ code: null, error }); });
    child.on("close", (code, signal) => { if (!timedOut) finish({ code, signal, timedOut: false }); });
    timer = setTimeout(async () => {
      timedOut = true;
      graceTimer = setTimeout(() => {
        if (platform !== "win32" && Number.isInteger(child.pid)) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
        } else {
          try { child.kill("SIGKILL"); } catch {}
        }
        finish({ code: null, signal: "SIGKILL", timedOut: true });
      }, options.graceMs || TERMINATION_GRACE_MS);
      await (options.terminateImpl || terminateProcessTree)(child, { graceMs: options.graceMs, platform });
    }, options.timeoutMs || COMMAND_TIMEOUT_MS);
  });
}

function normalizeRunResult(result, label, acceptedCodes = [0]) {
  if (!result || typeof result !== "object" || (!Number.isInteger(result.code) && !result.timedOut)) {
    throw new Error(`${label} returned malformed command output`);
  }
  if (result.timedOut) throw new Error(`${label} timed out`);
  if (!acceptedCodes.includes(result.code)) {
    const detail = String(result.stderr || result.stdout || "").trim().slice(0, 500);
    throw new Error(`${label} exited with exit ${result.code}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function parseImageDistance(output) {
  const match = String(output).match(/\(([-+\d.eE]+)\)\s*$/m);
  const value = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(value) || value < 0) throw new Error("Unable to parse normalized image distance");
  return value;
}

function imageMagickInvocation(tool, operation, args) {
  if (tool.kind === "magick") return { command: tool.path, args: [operation, ...args] };
  if (operation === "compare") return { command: tool.path, args };
  if (!tool.statsPath) throw new Error("ImageMagick convert executable is required for histogram and region statistics");
  return { command: tool.statsPath, args };
}

function writeFiles(root, files) {
  const absoluteRoot = path.resolve(root);
  if (fs.existsSync(absoluteRoot) && fs.lstatSync(absoluteRoot).isSymbolicLink()) throw new Error("Output root is a symbolic link");
  fs.mkdirSync(absoluteRoot, { recursive: true });
  const realRoot = fs.realpathSync(absoluteRoot);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.resolve(absoluteRoot, relative);
    const relation = path.relative(absoluteRoot, target);
    if (relation.startsWith("..") || path.isAbsolute(relation)) throw new Error(`Output path is outside root: ${relative}`);
    const segments = relation.split(path.sep).filter(Boolean);
    let parent = realRoot;
    for (const segment of segments.slice(0, -1)) {
      const next = path.join(parent, segment);
      if (fs.existsSync(next)) {
        if (fs.lstatSync(next).isSymbolicLink()) throw new Error(`Output ancestor is a symbolic link: ${relative}`);
        const resolved = fs.realpathSync(next);
        const resolvedRelation = path.relative(realRoot, resolved);
        if (resolvedRelation.startsWith("..") || path.isAbsolute(resolvedRelation)) throw new Error(`Output ancestor resolves outside root: ${relative}`);
        parent = resolved;
      } else {
        fs.mkdirSync(next);
        parent = next;
      }
    }
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error(`Output path is a symbolic link: ${relative}`);
    fs.writeFileSync(target, content, "utf8");
  }
}

async function measureFixtureLocally({ artifacts, fixtureDir, toolchain, runner = runCommand }) {
  fs.mkdirSync(fixtureDir, { recursive: true });
  writeFiles(fixtureDir, { ...artifacts.files, "preview.html": artifacts.html });
  const htmlPath = path.join(fixtureDir, "preview.html");
  const structuralLandmarks = verifyStructuralLandmarks(artifacts);
  if (!structuralLandmarks.ok) return { status: "fail", structuralLandmarks, message: "Structural landmark mismatch" };

  const latex = toolchain.latex;
  if (latex.kind === "latexmk") {
    normalizeRunResult(await runner(latex.path, ["-xelatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex"], { cwd: fixtureDir, timeoutMs: COMMAND_TIMEOUT_MS }), "latex");
  } else {
    const args = ["-interaction=nonstopmode", "-halt-on-error", "main.tex"];
    normalizeRunResult(await runner(latex.path, args, { cwd: fixtureDir, timeoutMs: COMMAND_TIMEOUT_MS }), "latex");
    normalizeRunResult(await runner(latex.path, args, { cwd: fixtureDir, timeoutMs: COMMAND_TIMEOUT_MS }), "latex");
  }

  const pdfPrefix = path.join(fixtureDir, "pdf-overview");
  // Beamer uses 16x9 cm or 12.8x9.6 cm paper. 203.2 DPI maps those
  // canvases to the same 1280x720 or 1024x768 pixels captured in HTML.
  normalizeRunResult(await runner(toolchain.pdftoppm.path, ["-f", "2", "-singlefile", "-png", "-r", "203.2", path.join(fixtureDir, "main.pdf"), pdfPrefix], { cwd: fixtureDir, timeoutMs: COMMAND_TIMEOUT_MS }), "pdftoppm");
  const htmlPng = path.join(fixtureDir, "html-overview.png");
  const browserArgs = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--host-resolver-rules=MAP * ~NOTFOUND",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-sync",
    "--metrics-recording-only",
    "--force-device-scale-factor=1",
    `--user-data-dir=${path.join(fixtureDir, "browser-profile")}`,
    `--screenshot=${htmlPng}`,
    `--window-size=${artifacts.width},${artifacts.height}`,
    pathToFileURL(htmlPath).href
  ];
  normalizeRunResult(await runner(toolchain.browser.path, browserArgs, { cwd: fixtureDir, timeoutMs: COMMAND_TIMEOUT_MS }), "browser");

  const pdfPng = `${pdfPrefix}.png`;
  const compare = imageMagickInvocation(toolchain.compare, "compare", ["-metric", "RMSE", htmlPng, pdfPng, "null:"]);
  const compared = normalizeRunResult(await runner(compare.command, compare.args, { cwd: fixtureDir, timeoutMs: COMMAND_TIMEOUT_MS }), "compare", [0, 1]);
  const imageDistance = parseImageDistance(compared.stderr || compared.stdout);

  async function histogram(imagePath, label) {
    const invocation = imageMagickInvocation(toolchain.compare, "convert", [imagePath, "-alpha", "off", "-depth", "8", "-colors", "8", "-format", "%c", "histogram:info:-"]);
    const result = normalizeRunResult(await runner(invocation.command, invocation.args, { cwd: fixtureDir, timeoutMs: COMMAND_TIMEOUT_MS }), `${label} histogram`);
    return parseDominantColor(result.stdout || result.stderr).rgb;
  }
  const htmlDominant = await histogram(htmlPng, "HTML");
  const pdfDominant = await histogram(pdfPng, "PDF");
  const dominantColorDistance = normalizedRgbDistance(htmlDominant, pdfDominant);

  async function decodeRaw(imagePath, rawPath, label) {
    const invocation = imageMagickInvocation(toolchain.compare, "convert", [imagePath, "-alpha", "off", "-depth", "8", `RGB:${rawPath}`]);
    normalizeRunResult(await runner(invocation.command, invocation.args, { cwd: fixtureDir, timeoutMs: COMMAND_TIMEOUT_MS }), `${label} raw RGB decode`);
    let raw;
    try { raw = fs.readFileSync(rawPath); }
    catch { throw new Error(`${label} raw RGB decode did not produce output`); }
    return analyzeRawRgb(artifacts, raw);
  }
  const htmlSignatures = await decodeRaw(htmlPng, path.join(fixtureDir, "html-overview.rgb"), "HTML");
  const pdfSignatures = await decodeRaw(pdfPng, path.join(fixtureDir, "pdf-overview.rgb"), "PDF");
  const regionDistances = {};
  for (const required of renderedRegions(artifacts)) {
    const invocation = imageMagickInvocation(toolchain.compare, "compare", ["-metric", "RMSE", "-crop", required.geometry, htmlPng, pdfPng, "null:"]);
    const comparedRegion = normalizeRunResult(await runner(invocation.command, invocation.args, { cwd: fixtureDir, timeoutMs: COMMAND_TIMEOUT_MS }), `${required.id} compare`, [0, 1]);
    regionDistances[required.id] = parseImageDistance(comparedRegion.stderr || comparedRegion.stdout);
  }
  const regions = combineRegionSignatures(artifacts, htmlSignatures, pdfSignatures, regionDistances);
  const withinTolerance = imageDistance <= IMAGE_DISTANCE_TOLERANCE
    && dominantColorDistance <= DOMINANT_COLOR_DISTANCE_TOLERANCE
    && Object.values(regions).every((region) => region.pass);
  return {
    status: withinTolerance ? "pass" : "fail",
    structuralLandmarks,
    imageDistance,
    dominantColorDistance,
    dominantColors: { html: htmlDominant, pdf: pdfDominant },
    regions,
    tolerance: IMAGE_DISTANCE_TOLERANCE,
    dominantColorTolerance: DOMINANT_COLOR_DISTANCE_TOLERANCE,
    ...(!withinTolerance ? { message: "Image or dominant-color distance exceeds tolerance" } : {})
  };
}

function summarizeReport(fixtures, missing) {
  if (fixtures.some((fixture) => fixture.status === "fail")) return { status: "fail", exitCode: 1 };
  if (missing.length > 0 || fixtures.some((fixture) => fixture.status === "unavailable")) return { status: "unavailable", exitCode: 2 };
  return { status: "pass", exitCode: 0 };
}

function exitCodeForReport(report) {
  return report.status === "pass" ? 0 : report.status === "fail" ? 1 : 2;
}

async function runParityCheck(options = {}) {
  const fixtures = createStressFixtures();
  const discovered = await (options.discover || discoverToolchain)();
  const missing = Array.isArray(discovered.missing) ? [...discovered.missing] : [];
  if (missing.length > 0) {
    const results = fixtures.map(({ id }) => ({ id, status: "unavailable", missing: [...missing] }));
    return { version: 1, ...summarizeReport(results, missing), missing, tolerance: IMAGE_DISTANCE_TOLERANCE, fixtures: results };
  }

  const tempRoot = options.tempRoot || fs.mkdtempSync(path.join(os.tmpdir(), "beamerforge-parity-"));
  const ownsTemp = !options.tempRoot;
  const measureFixture = options.measureFixture || measureFixtureLocally;
  const results = [];
  let cleanupFailure = null;
  try {
    for (const fixture of fixtures) {
      const artifacts = renderStandaloneHtml(fixture, options.registry || getRegistry());
      try {
        const measured = await measureFixture({ fixture, artifacts, fixtureDir: path.join(tempRoot, fixture.id), toolchain: discovered.tools, runner: options.runner || runCommand });
        results.push({ id: fixture.id, ...validateMeasuredResult(artifacts, measured) });
      } catch (error) {
        results.push({ id: fixture.id, status: "fail", message: String(error && error.message || error).slice(0, 500) });
      }
    }
  } finally {
    if (ownsTemp) {
      try { (options.removeTemp || fs.rmSync)(tempRoot, { recursive: true, force: true }); }
      catch (error) { cleanupFailure = String(error && error.message || error).slice(0, 500); }
    }
  }
  const summary = summarizeReport(cleanupFailure ? [...results, { status: "fail" }] : results, missing);
  return {
    version: 1,
    ...summary,
    missing,
    tolerance: IMAGE_DISTANCE_TOLERANCE,
    fixtures: results,
    ...(cleanupFailure ? { cleanupFailure } : {})
  };
}

module.exports = {
  IMAGE_DISTANCE_TOLERANCE,
  createStressFixtures,
  discoverToolchain,
  renderStandaloneHtml,
  verifyStructuralLandmarks,
  renderedRegions,
  analyzeRawRgb,
  combineRegionSignatures,
  parseImageDistance,
  parseDominantColor,
  normalizedRgbDistance,
  validateMeasuredResult,
  normalizeRunResult,
  summarizeReport,
  exitCodeForReport,
  runParityCheck,
  runCommand,
  measureFixtureLocally,
  writeFiles,
  boundedAppend,
  terminateProcessTree,
  probeOutputMatches,
  MAX_COMMAND_OUTPUT_BYTES
};

if (require.main === module) {
  runParityCheck().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = exitCodeForReport(report);
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "fail", exitCode: 1, message: String(error && error.message || error) })}\n`);
    process.exitCode = 1;
  });
}
