"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
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
  MAX_COMMAND_OUTPUT_BYTES,
  probeOutputMatches
} = require("../workbench/parity-check");

function validMeasurement(artifacts) {
  const raw = syntheticRaw(artifacts);
  const html = analyzeRawRgb(artifacts, raw);
  const pdf = analyzeRawRgb(artifacts, raw);
  return {
    status: "pass",
    structuralLandmarks: verifyStructuralLandmarks(artifacts),
    imageDistance: 0.01,
    dominantColorDistance: 0.01,
    regions: combineRegionSignatures(artifacts, html, pdf, Object.fromEntries(renderedRegions(artifacts).map((region) => [region.id, 0.1])))
  };
}

function rgb(hex) { return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)); }

function fillRect(buffer, width, x, y, rectWidth, rectHeight, color) {
  for (let row = y; row < y + rectHeight; row += 1) {
    for (let column = x; column < x + rectWidth; column += 1) {
      const offset = (row * width + column) * 3;
      buffer[offset] = color[0]; buffer[offset + 1] = color[1]; buffer[offset + 2] = color[2];
    }
  }
}

function geometryParts(geometry) { return geometry.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/).slice(1).map(Number); }

function syntheticRaw(artifacts, { omit = null, shift = null } = {}) {
  const background = rgb(artifacts.design.colors.background);
  const raw = Buffer.alloc(artifacts.width * artifacts.height * 3);
  for (let index = 0; index < raw.length; index += 3) {
    raw[index] = background[0]; raw[index + 1] = background[1]; raw[index + 2] = background[2];
  }
  for (const region of renderedRegions(artifacts)) {
    if (region.id === omit) continue;
    const [width, height, x, y] = geometryParts(region.geometry);
    const rectWidth = Math.max(2, Math.floor(width * 0.2));
    const rectHeight = Math.max(2, Math.floor(height * 0.2));
    const componentShift = shift?.id === region.id ? shift : { x: 0, y: 0 };
    const drawX = x + Math.floor((width - rectWidth) / 2) + Math.round(width * (componentShift.x || 0));
    const drawY = y + Math.floor((height - rectHeight) / 2) + Math.round(height * (componentShift.y || 0));
    fillRect(raw, artifacts.width, drawX, drawY, rectWidth, rectHeight, [0, 0, 0]);
  }
  return raw;
}

test("stress fixtures deterministically cover default, dark, 4:3, duck, and long content", () => {
  const fixtures = createStressFixtures();
  assert.deepEqual(fixtures.map((fixture) => fixture.id), ["default", "dark", "four-three", "duck", "long-content"]);
  assert.equal(fixtures[1].theme.colors.paletteId, "midnight-blue");
  assert.equal(fixtures[1].theme.navigation.style, "soft-miniframes");
  assert.equal(fixtures[2].theme.foundation.aspectRatio, "4:3");
  assert.equal(fixtures[3].theme.decorations.cornerLogo.id, "duck");
  assert.ok(fixtures[4].theme.contentDefaults.sampleTitle.length > 90);
  assert.match(fixtures[4].theme.contentDefaults.sampleBullets.join(" "), /renderer|layout|content/i);
  assert.match(fixtures[4].theme.contentDefaults.sampleBullets.join(" "), /\s/);
  assert.deepEqual(createStressFixtures(), fixtures);
});

test("tool discovery accepts command variants and reports every missing role", async () => {
  const available = new Map([
    ["latexmk", "C:/tex/latexmk.exe"],
    ["pdftoppm", "C:/poppler/pdftoppm.exe"],
    ["magick", "C:/imagemagick/magick.exe"],
    ["msedge", "C:/edge/msedge.exe"]
  ]);
  const found = await discoverToolchain(async (name) => available.get(name) || null);
  assert.deepEqual(found.missing, []);
  assert.equal(found.tools.latex.kind, "latexmk");
  assert.equal(found.tools.compare.kind, "magick");
  assert.equal(found.tools.browser.kind, "msedge");

  const partial = await discoverToolchain(async (name) => name === "xelatex" ? "/bin/xelatex" : null);
  assert.deepEqual(partial.missing, ["pdftoppm", "imagemagick", "browser"]);
  assert.equal(partial.tools.latex.kind, "xelatex");
});

test("tool discovery skips non-runnable shims and falls back to a runnable variant", async () => {
  const available = new Map([
    ["latexmk", "C:/broken/latexmk.cmd"],
    ["xelatex", "C:/tex/xelatex.exe"],
    ["pdftoppm", "C:/poppler/pdftoppm.exe"],
    ["compare", "C:/imagemagick/compare.exe"],
    ["convert", "C:/imagemagick/convert.exe"],
    ["chrome", "C:/chrome/chrome.exe"]
  ]);
  const result = await discoverToolchain(
    async (name) => available.get(name) || null,
    async (tool) => !tool.path.includes("broken")
  );

  assert.equal(result.tools.latex.kind, "xelatex");
  assert.deepEqual(result.missing, []);
});

test("tool probes require expected product identity and version", () => {
  assert.equal(probeOutputMatches("latexmk", "Latexmk, John Collins, 4.86"), true);
  assert.equal(probeOutputMatches("pdftoppm", "pdftoppm version 26.05.0"), true);
  assert.equal(probeOutputMatches("magick", "ImageMagick 7.1.1"), true);
  assert.equal(probeOutputMatches("chrome", "Mozilla Chrome/126.0.0.0"), true);
  assert.equal(probeOutputMatches("msedge", "Mozilla Edg/126.0.0.0"), true);
  assert.equal(probeOutputMatches("chrome", "unrelated executable 1.0"), false);
});

test("standalone HTML and generated TeX expose stable resolved landmarks", () => {
  const fixture = createStressFixtures().find((item) => item.id === "duck");
  const artifacts = renderStandaloneHtml(fixture);
  assert.match(artifacts.html, /data-theme-hash="[a-f0-9]{64}"/);
  assert.match(artifacts.html, /data-aspect-ratio="16:9"/);
  assert.match(artifacts.html, /data-duck="present"/);
  assert.deepEqual(verifyStructuralLandmarks(artifacts), {
    ok: true,
    themeHash: true,
    aspectRatio: true,
    title: true,
    content: true,
    duck: true
  });
  assert.equal(artifacts.design.capabilities.html, true);
  assert.equal(artifacts.design.capabilities.latex, true);
  assert.match(artifacts.files["content/overview.tex"], /The design keeps one idea visible per slide/);
});

test("standalone capture dimensions exactly match each authoritative aspect ratio", () => {
  const byId = Object.fromEntries(createStressFixtures().map((fixture) => [fixture.id, renderStandaloneHtml(fixture)]));
  assert.deepEqual([byId.default.width, byId.default.height], [1280, 720]);
  assert.deepEqual([byId["four-three"].width, byId["four-three"].height], [1024, 768]);
  assert.equal(byId.default.width / byId.default.height, 16 / 9);
  assert.equal(byId["four-three"].width / byId["four-three"].height, 4 / 3);
});

test("image metric parsing is explicit and rejects malformed or non-finite output", () => {
  assert.equal(parseImageDistance("1221.4 (0.018637)"), 0.018637);
  assert.throws(() => parseImageDistance("warning only"), /image distance/i);
  assert.throws(() => parseImageDistance("0 (NaN)"), /image distance/i);
  assert.ok(IMAGE_DISTANCE_TOLERANCE > 0 && IMAGE_DISTANCE_TOLERANCE < 1);
});

test("quantized histogram parser selects the highest-count representative color", () => {
  const histogram = [
    "  40: (10,20,30) #0A141E srgb(10,20,30)",
    "  900: (250,251,252) #FAFBFC srgb(250,251,252)",
    "  60: (100,110,120) #646E78 srgb(100,110,120)"
  ].join("\n");
  assert.deepEqual(parseDominantColor(histogram), { count: 900, rgb: [250, 251, 252] });
  assert.equal(normalizedRgbDistance([0, 0, 0], [255, 255, 255]), 1);
  assert.throws(() => parseDominantColor("not a histogram"), /histogram/i);
  assert.throws(() => parseDominantColor("1: (NaN,2,3)"), /histogram/i);
});

test("measured pass schema rejects missing, unknown, non-finite, and incomplete fields", () => {
  const artifacts = renderStandaloneHtml(createStressFixtures()[0]);
  const valid = validMeasurement(artifacts);
  assert.equal(validateMeasuredResult(artifacts, valid).status, "pass");

  const cases = [
    [{}, "status"],
    [{ ...valid, status: "mystery" }, "status"],
    [{ ...valid, structuralLandmarks: { ok: false } }, "structural"],
    [{ ...valid, imageDistance: NaN }, "imageDistance"],
    [{ ...valid, dominantColorDistance: Infinity }, "dominantColorDistance"],
    [{ ...valid, regions: {} }, "region title"],
    [{ ...valid, regions: { ...valid.regions, title: { ...valid.regions.title, centroidDelta: NaN } } }, "region title"],
    [{ ...valid, regions: { ...valid.regions, title: { ...valid.regions.title, centroidAxisDelta: undefined } } }, "region title"],
    [{ ...valid, regions: { ...valid.regions, title: { ...valid.regions.title, spatialDelta: undefined } } }, "region title"],
    [{ ...valid, regions: { ...valid.regions, title: { ...valid.regions.title, pass: false } } }, "region title"]
  ];
  for (const [measured, reason] of cases) {
    const result = validateMeasuredResult(artifacts, measured);
    assert.equal(result.status, "fail");
    assert.match(result.message, new RegExp(reason, "i"));
  }
});

test("every normalized distance deterministically rejects negative values", () => {
  const artifacts = renderStandaloneHtml(createStressFixtures()[0]);
  const fields = [
    (value) => { value.imageDistance = -0.01; },
    (value) => { value.dominantColorDistance = -0.01; },
    (value) => { value.regions.title.imageDistance = -0.01; },
    (value) => { value.regions.title.coverageDelta = -0.01; },
    (value) => { value.regions.title.centroidDelta = -0.01; },
    (value) => { value.regions.title.centroidAxisDelta.x = -0.01; },
    (value) => { value.regions.title.centroidAxisDelta.y = -0.01; },
    (value) => { value.regions.title.spatialDelta = -0.01; }
  ];
  for (const mutate of fields) {
    const measured = structuredClone(validMeasurement(artifacts));
    mutate(measured);
    const result = validateMeasuredResult(artifacts, measured);
    assert.equal(result.status, "fail");
    assert.match(result.message, /finite normalized|\[0,1\]/i);
  }
});

test("fixture-specific rendered regions gate title, content, footer, header, and duck", () => {
  const fixtures = createStressFixtures();
  const normal = renderStandaloneHtml(fixtures[0]);
  assert.deepEqual(renderedRegions(normal).map((region) => region.id), ["title", "content", "footer"]);
  const duck = renderStandaloneHtml(fixtures.find((fixture) => fixture.id === "duck"));
  assert.deepEqual(renderedRegions(duck).map((region) => region.id), ["title", "content", "footer", "duck"]);

  for (const id of ["title", "content", "footer", "duck"]) {
    const artifacts = id === "duck" ? duck : normal;
    for (const mutation of [
      { label: "omit", options: { omit: id } },
      { label: "shift-right-40pct", options: { shift: { id, x: 0.40, y: 0 } } },
      { label: "shift-up-35pct", options: { shift: { id, x: 0, y: -0.35 } } }
    ]) {
      const htmlRaw = syntheticRaw(artifacts, mutation.options);
      const pdfRaw = syntheticRaw(artifacts);
      const measured = validMeasurement(artifacts);
      measured.imageDistance = 0.001;
      measured.regions = combineRegionSignatures(
        artifacts,
        analyzeRawRgb(artifacts, htmlRaw),
        analyzeRawRgb(artifacts, pdfRaw),
        Object.fromEntries(renderedRegions(artifacts).map((region) => [region.id, 0.001]))
      );
      const result = validateMeasuredResult(artifacts, measured);
      assert.equal(result.status, "fail", `${id} ${mutation.label}`);
      assert.match(result.message, new RegExp(`region ${id}`, "i"));
    }
  }

  const withHeaderTheme = structuredClone(fixtures[0]);
  withHeaderTheme.theme.navigation.style = "soft-miniframes";
  const withHeader = renderStandaloneHtml(withHeaderTheme);
  assert.deepEqual(renderedRegions(withHeader).map((region) => region.id), ["title", "content", "header", "footer"]);
  for (const mutation of [
    { label: "omit", options: { omit: "header" } },
    { label: "shift-right-40pct", options: { shift: { id: "header", x: 0.40, y: 0 } } },
    { label: "shift-down-35pct", options: { shift: { id: "header", x: 0, y: 0.35 } } }
  ]) {
    const measured = validMeasurement(withHeader);
    measured.imageDistance = 0.001;
    measured.regions = combineRegionSignatures(
      withHeader,
      analyzeRawRgb(withHeader, syntheticRaw(withHeader, mutation.options)),
      analyzeRawRgb(withHeader, syntheticRaw(withHeader)),
      Object.fromEntries(renderedRegions(withHeader).map((region) => [region.id, 0.001]))
    );
    assert.match(validateMeasuredResult(withHeader, measured).message, /region header/i);
  }
});

test("raw signatures reject reviewer title shift but tolerate small renderer drift", () => {
  const artifacts = renderStandaloneHtml(createStressFixtures()[0]);
  const pdf = analyzeRawRgb(artifacts, syntheticRaw(artifacts));
  const distances = Object.fromEntries(renderedRegions(artifacts).map((region) => [region.id, 0.001]));

  const shifted = validMeasurement(artifacts);
  shifted.imageDistance = 0.001;
  shifted.regions = combineRegionSignatures(
    artifacts,
    analyzeRawRgb(artifacts, syntheticRaw(artifacts, { shift: { id: "title", x: 0.40, y: 0 } })),
    pdf,
    distances
  );
  assert.ok(shifted.regions.title.centroidAxisDelta.x >= 0.39);
  assert.equal(validateMeasuredResult(artifacts, shifted).status, "fail");

  const driftFixtures = [
    artifacts,
    renderStandaloneHtml(createStressFixtures().find((fixture) => fixture.id === "dark")),
    renderStandaloneHtml(createStressFixtures().find((fixture) => fixture.id === "duck"))
  ];
  for (const current of driftFixtures) {
    const currentPdf = analyzeRawRgb(current, syntheticRaw(current));
    const currentDistances = Object.fromEntries(renderedRegions(current).map((region) => [region.id, 0.001]));
    for (const region of renderedRegions(current)) {
      const drifted = validMeasurement(current);
      drifted.regions = combineRegionSignatures(
        current,
        analyzeRawRgb(current, syntheticRaw(current, { shift: { id: region.id, x: 0.04, y: 0.04 } })),
        currentPdf,
        currentDistances
      );
      assert.ok(drifted.regions[region.id].centroidAxisDelta.x <= 0.05, `${region.id} x drift`);
      assert.ok(drifted.regions[region.id].centroidAxisDelta.y <= 0.05, `${region.id} y drift`);
      assert.equal(validateMeasuredResult(current, drifted).status, "pass", `${current.fixtureId} ${region.id}`);
    }
  }
});

test("bounded command output keeps only the configured prefix", () => {
  assert.equal(boundedAppend("abc", "def", 5), "abcde");
  assert.equal(boundedAppend("abcde", "ignored", 5), "abcde");
  assert.ok(MAX_COMMAND_OUTPUT_BYTES >= 64 * 1024);
});

test("runCommand bounds output and terminates an owned child process tree on timeout", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bf-timeout-tree-"));
  const marker = path.join(root, "orphan.txt");
  const grandchild = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'orphan'),1200)`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});process.stdout.write('x'.repeat(200000));setInterval(()=>{},1000)`;
  try {
    const result = await runCommand(process.execPath, ["-e", parent], { timeoutMs: 100, graceMs: 500, maxOutputBytes: 1024 });
    assert.equal(result.timedOut, true);
    assert.equal(result.stdout.length, 1024);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writeFiles rejects traversal outside its owned root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bf-write-files-"));
  try {
    assert.throws(() => writeFiles(root, { "../escape.txt": "bad" }), /outside/i);
    assert.equal(fs.existsSync(path.join(root, "..", "escape.txt")), false);
    assert.doesNotThrow(() => writeFiles(root, { "nested/good.txt": "ok" }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writeFiles rejects existing symlink ancestors and leaves outside targets unchanged", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bf-write-symlink-root-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "bf-write-symlink-outside-"));
  const link = path.join(root, "linked");
  try {
    try {
      fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      t.skip(`symlink unavailable: ${error.code || error.message}`);
      return;
    }
    assert.throws(() => writeFiles(root, { "linked/new-directory/escape.txt": "bad" }), /symbolic link|outside/i);
    assert.equal(fs.existsSync(path.join(outside, "new-directory")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("writeFiles rejects an existing symlink leaf", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bf-write-leaf-root-"));
  const outside = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bf-write-leaf-outside-")), "target.txt");
  fs.writeFileSync(outside, "unchanged");
  try {
    try { fs.symlinkSync(outside, path.join(root, "leaf.txt"), "file"); }
    catch (error) { t.skip(`file symlink unavailable: ${error.code || error.message}`); return; }
    assert.throws(() => writeFiles(root, { "leaf.txt": "mutated" }), /symbolic link/i);
    assert.equal(fs.readFileSync(outside, "utf8"), "unchanged");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.dirname(outside), { recursive: true, force: true });
  }
});

test("runner results reject timeout, malformed output, and unexpected exit codes", () => {
  assert.throws(() => normalizeRunResult({ timedOut: true, code: null }, "browser"), /timed out/i);
  assert.throws(() => normalizeRunResult({ stdout: "" }, "latex"), /malformed/i);
  assert.throws(() => normalizeRunResult({ code: 7, stdout: "", stderr: "bad" }, "latex"), /exit 7/i);
  assert.equal(normalizeRunResult({ code: 1, stdout: "", stderr: "1 (0.1)" }, "compare", [0, 1]).code, 1);
});

test("overall status and exit codes give measured failures precedence over unavailable tools", () => {
  assert.deepEqual(summarizeReport([{ status: "pass" }], []), { status: "pass", exitCode: 0 });
  assert.deepEqual(summarizeReport([{ status: "unavailable" }], ["browser"]), { status: "unavailable", exitCode: 2 });
  assert.deepEqual(summarizeReport([{ status: "fail" }, { status: "unavailable" }], ["browser"]), { status: "fail", exitCode: 1 });
  assert.equal(exitCodeForReport({ status: "pass" }), 0);
  assert.equal(exitCodeForReport({ status: "fail" }), 1);
  assert.equal(exitCodeForReport({ status: "unavailable" }), 2);
});

test("missing toolchain never false-passes and names all missing dependencies", async () => {
  const report = await runParityCheck({ discover: async () => ({ tools: {}, missing: ["latex", "browser"] }) });
  assert.equal(report.status, "unavailable");
  assert.equal(report.exitCode, 2);
  assert.deepEqual(report.missing, ["latex", "browser"]);
  assert.equal(report.fixtures.every((fixture) => fixture.status === "unavailable"), true);
});

test("runParityCheck never promotes malformed measured results to pass", async () => {
  const tools = { latex: {}, pdftoppm: {}, compare: {}, browser: {} };
  for (const malformed of [{}, { status: "unknown" }, { status: "pass", imageDistance: NaN }]) {
    const report = await runParityCheck({
      discover: async () => ({ tools, missing: [] }),
      measureFixture: async () => malformed
    });
    assert.equal(report.status, "fail");
    assert.equal(report.exitCode, 1);
    assert.equal(report.fixtures.every((fixture) => fixture.status === "fail"), true);
    assert.match(report.fixtures[0].message, /invalid measurement/i);
  }
});

test("complete injected toolchain measures all fixtures and enforces tolerance", async () => {
  const tools = { latex: {}, pdftoppm: {}, compare: {}, browser: {} };
  const pass = await runParityCheck({
    discover: async () => ({ tools, missing: [] }),
    measureFixture: async ({ fixture, artifacts }) => ({
      ...validMeasurement(artifacts),
      imageDistance: fixture.id === "dark" ? IMAGE_DISTANCE_TOLERANCE : 0.01
    })
  });
  assert.equal(pass.status, "pass");
  assert.equal(pass.exitCode, 0);
  assert.deepEqual(pass.fixtures.map((fixture) => fixture.id), ["default", "dark", "four-three", "duck", "long-content"]);
  assert.equal(pass.fixtures.every((fixture) => fixture.structuralLandmarks.ok), true);

  const fail = await runParityCheck({
    discover: async () => ({ tools, missing: [] }),
    measureFixture: async ({ artifacts }) => ({ ...validMeasurement(artifacts), imageDistance: IMAGE_DISTANCE_TOLERANCE + 0.000001 })
  });
  assert.equal(fail.status, "fail");
  assert.equal(fail.exitCode, 1);
  assert.equal(fail.fixtures.every((fixture) => fixture.status === "fail"), true);

  const colorFail = await runParityCheck({
    discover: async () => ({ tools, missing: [] }),
    measureFixture: async ({ artifacts }) => ({ ...validMeasurement(artifacts), dominantColorDistance: 0.051 })
  });
  assert.equal(colorFail.status, "fail");
});

test("measureFixtureLocally executes the complete renderer and ImageMagick command contract", async () => {
  const fixture = createStressFixtures().find((item) => item.id === "duck");
  const artifacts = renderStandaloneHtml(fixture);
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "bf-measure-contract-"));
  const calls = [];
  const tools = {
    latex: { kind: "latexmk", path: "latexmk" },
    pdftoppm: { kind: "pdftoppm", path: "pdftoppm" },
    compare: { kind: "magick", path: "magick" },
    browser: { kind: "chrome", path: "chrome" }
  };
  const histogram = "900: (250,251,252) #FAFBFC srgb(250,251,252)\n100: (1,2,3) #010203 srgb(1,2,3)";
  const runner = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args.includes("histogram:info:-")) return { code: 0, stdout: histogram, stderr: "" };
    const rawTarget = args.find((arg) => String(arg).startsWith("RGB:"));
    if (rawTarget) {
      fs.writeFileSync(String(rawTarget).slice(4), syntheticRaw(artifacts));
      return { code: 0, stdout: "", stderr: "" };
    }
    if (args.includes("compare")) return { code: 1, stdout: "", stderr: "12 (0.10)" };
    return { code: 0, stdout: "", stderr: "" };
  };

  try {
    const result = await measureFixtureLocally({ artifacts, fixtureDir, toolchain: tools, runner });
    assert.equal(result.status, "pass");
    assert.equal(Object.keys(result.regions).includes("duck"), true);
    assert.deepEqual(calls.find((call) => call.command === "latexmk").args, ["-xelatex", "-interaction=nonstopmode", "-halt-on-error", "main.tex"]);
    assert.deepEqual(calls.find((call) => call.command === "pdftoppm").args.slice(0, 8), ["-f", "2", "-singlefile", "-png", "-r", "203.2", path.join(fixtureDir, "main.pdf"), path.join(fixtureDir, "pdf-overview")]);
    const browser = calls.find((call) => call.command === "chrome");
    assert.ok(browser.args.includes("--force-device-scale-factor=1"));
    assert.ok(browser.args.includes("--no-first-run"));
    assert.ok(browser.args.includes("--no-default-browser-check"));
    assert.ok(browser.args.includes("--disable-background-networking"));
    assert.ok(browser.args.includes("--host-resolver-rules=MAP * ~NOTFOUND"));
    assert.ok(browser.args.some((arg) => arg === `--user-data-dir=${path.join(fixtureDir, "browser-profile")}`));
    assert.ok(browser.args.includes("--window-size=1280,720"));
    assert.ok(calls.some((call) => call.command === "magick" && call.args.includes("-colors") && call.args.includes("histogram:info:-")));
    assert.ok(calls.some((call) => call.command === "magick" && call.args.includes("-crop") && call.args.includes("compare")));
    const rawDecodes = calls.filter((call) => call.command === "magick" && call.args.some((arg) => String(arg).startsWith("RGB:")));
    assert.equal(rawDecodes.length, 2);
    assert.equal(rawDecodes.every((call) => call.args.includes("-depth") && call.args.includes("8")), true);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("measureFixtureLocally rejects malformed short raw RGB decode output", async () => {
  const artifacts = renderStandaloneHtml(createStressFixtures()[0]);
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "bf-short-raw-"));
  const tools = {
    latex: { kind: "latexmk", path: "latexmk" }, pdftoppm: { kind: "pdftoppm", path: "pdftoppm" },
    compare: { kind: "magick", path: "magick" }, browser: { kind: "chrome", path: "chrome" }
  };
  const runner = async (_command, args) => {
    if (args.includes("histogram:info:-")) return { code: 0, stdout: "10: (255,255,255) #FFFFFF srgb(255,255,255)", stderr: "" };
    const rawTarget = args.find((arg) => String(arg).startsWith("RGB:"));
    if (rawTarget) fs.writeFileSync(String(rawTarget).slice(4), Buffer.alloc(3));
    if (args.includes("compare")) return { code: 1, stdout: "", stderr: "1 (0.01)" };
    return { code: 0, stdout: "", stderr: "" };
  };
  try {
    await assert.rejects(
      measureFixtureLocally({ artifacts, fixtureDir, toolchain: tools, runner }),
      /exactly \d+ bytes/i
    );
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("a measured fixture exception is a failure even when another fixture is unavailable", async () => {
  let call = 0;
  const report = await runParityCheck({
    discover: async () => ({ tools: { latex: {}, pdftoppm: {}, compare: {}, browser: {} }, missing: [] }),
    measureFixture: async () => {
      call += 1;
      if (call === 1) throw new Error("browser timed out");
      return { status: "unavailable", reason: "fixture dependency unavailable" };
    }
  });
  assert.equal(report.status, "fail");
  assert.equal(report.exitCode, 1);
  assert.match(report.fixtures[0].message, /timed out/);
});

test("owned temp cleanup failures are reported without masking primary fixture failures", async () => {
  let calls = 0;
  const report = await runParityCheck({
    discover: async () => ({ tools: { latex: {}, pdftoppm: {}, compare: {}, browser: {} }, missing: [] }),
    measureFixture: async ({ artifacts }) => {
      calls += 1;
      if (calls === 1) return { status: "fail", message: "primary renderer failure" };
      return validMeasurement(artifacts);
    },
    removeTemp() { throw new Error("cleanup denied"); }
  });
  assert.equal(report.status, "fail");
  assert.equal(report.fixtures[0].message, "primary renderer failure");
  assert.equal(report.cleanupFailure, "cleanup denied");
});

test("caller-owned temp roots are never removed", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bf-caller-temp-"));
  let removed = false;
  try {
    const report = await runParityCheck({
      tempRoot: root,
      discover: async () => ({ tools: { latex: {}, pdftoppm: {}, compare: {}, browser: {} }, missing: [] }),
      measureFixture: async ({ artifacts }) => validMeasurement(artifacts),
      removeTemp() { removed = true; }
    });
    assert.equal(report.status, "pass");
    assert.equal(removed, false);
    assert.equal(fs.existsSync(root), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
