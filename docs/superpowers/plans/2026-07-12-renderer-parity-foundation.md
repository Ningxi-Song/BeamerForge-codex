# Renderer Parity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make the instant HTML preview and authoritative LaTeX output consume one resolved design model, add cached compiled previews to review routes, and generate the duck SVG and TikZ from one trusted vector description.

**Architecture:** Validated theme JSON is converted by one pure resolver into a deeply frozen ResolvedDesign. The browser obtains resolved designs from a narrow local API, while the LaTeX generator resolves internally before rendering. A separate preview-cache service owns deterministic hashes, atomic compilation, stale fallback, and safe PDF lookup.

**Tech Stack:** Node.js 20 CommonJS, node:test, browser DOM JavaScript, HTTP server, XeLaTeX/latexmk, optional Chromium and Poppler parity tooling.

---

## File Structure

- Create: lib/canonical-json.js — recursively stable JSON and SHA-256 theme keys.
- Create: design/registry-contract.js — validates declared HTML and LaTeX support.
- Create: design/resolve-design.js — the only theme-ID-to-registry resolution boundary.
- Create: design/vector-renderers.js — trusted vector primitive validation plus SVG and TikZ rendering.
- Create: elements/decorations/logos/duck-vector.js — canonical duck geometry.
- Create: workbench/preview-cache.js — compiled-preview cache and in-flight request coalescing.
- Create: workbench/parity-check.js — optional local rendered-parity command.
- Create: tests/canonical-json.test.js
- Create: tests/registry-contract.test.js
- Create: tests/resolved-design.test.js
- Create: tests/vector-renderers.test.js
- Create: tests/preview-cache.test.js
- Create: tests/parity-check.test.js
- Modify: registry/options.js — add renderer declarations and canonical logo vector metadata.
- Modify: generators/latex.js — render from ResolvedDesign.
- Modify: generators/project-writer.js — copy generated SVG rather than a separately maintained file.
- Modify: workbench/server.js — validate registry, resolve browser previews, compile cached previews, and serve safe PDFs.
- Modify: workbench/public/index.html — label instant preview and add authoritative preview region.
- Modify: workbench/public/app.js — render ResolvedDesign and trigger review-route compilation.
- Modify: workbench/public/styles.css — style preview modes, stale state, errors, and PDF frame.
- Modify: workbench/build.js — expose compiler identity used in preview metadata.
- Modify: package.json — check new modules and add the parity command.
- Modify: tests/generator.test.js
- Modify: tests/project-writer.test.js
- Modify: tests/server.test.js
- Modify: tests/public-ui.test.js
- Modify: tests/registry.test.js

### Task 1: Canonical hashing and registry support contract

**Files:**
- Create: lib/canonical-json.js
- Create: design/registry-contract.js
- Create: tests/canonical-json.test.js
- Create: tests/registry-contract.test.js
- Modify: registry/options.js

- [ ] **Step 1: Write failing canonical JSON tests**

Create tests/canonical-json.test.js:

    const test = require("node:test");
    const assert = require("node:assert/strict");
    const { canonicalJson, hashCanonical } = require("../lib/canonical-json");

    test("canonical JSON sorts nested object keys but preserves array order", () => {
      const left = { z: 1, a: { y: 2, x: 3 }, list: ["b", "a"] };
      const right = { list: ["b", "a"], a: { x: 3, y: 2 }, z: 1 };
      assert.equal(canonicalJson(left), canonicalJson(right));
      assert.equal(canonicalJson(left), '{"a":{"x":3,"y":2},"list":["b","a"],"z":1}');
    });

    test("canonical hash changes when a nested theme value changes", () => {
      const first = hashCanonical({ colors: { primary: "#112233" } });
      const second = hashCanonical({ colors: { primary: "#112234" } });
      assert.match(first, /^[a-f0-9]{64}$/);
      assert.notEqual(first, second);
    });

- [ ] **Step 2: Run the canonical tests and verify RED**

Run:

    node --test tests/canonical-json.test.js

Expected: FAIL because lib/canonical-json.js does not exist.

- [ ] **Step 3: Implement canonical JSON and SHA-256**

Create lib/canonical-json.js:

    "use strict";

    const crypto = require("node:crypto");

    function canonicalize(value) {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
        );
      }
      return value;
    }

    function canonicalJson(value) {
      return JSON.stringify(canonicalize(value));
    }

    function hashCanonical(value) {
      return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
    }

    module.exports = { canonicalJson, hashCanonical };

- [ ] **Step 4: Write failing registry contract tests**

Create tests/registry-contract.test.js:

    const test = require("node:test");
    const assert = require("node:assert/strict");
    const { getRegistry } = require("../registry/options");
    const { validateRegistryContract } = require("../design/registry-contract");

    test("every selectable registry option declares HTML and LaTeX support", () => {
      assert.deepEqual(validateRegistryContract(getRegistry()), []);
    });

    test("registry contract identifies the collection, ID, and missing renderer", () => {
      const registry = getRegistry();
      delete registry.blocks.classic.renderers.latex;
      assert.deepEqual(validateRegistryContract(registry), [
        { collection: "blocks", id: "classic", renderer: "latex", message: "renderer support must be boolean" }
      ]);
    });

    test("unsupported renderers require an explicit limitation", () => {
      const registry = getRegistry();
      registry.blocks.classic.renderers.html = false;
      assert.deepEqual(validateRegistryContract(registry), [
        { collection: "blocks", id: "classic", renderer: "html", message: "unsupported renderer requires a limitation" }
      ]);
    });

- [ ] **Step 5: Run registry contract tests and verify RED**

Run:

    node --test tests/registry-contract.test.js

Expected: FAIL because design/registry-contract.js and renderer declarations do not exist.

- [ ] **Step 6: Add renderer declarations and contract validation**

In registry/options.js add renderers: { html: true, latex: true } to every palette, font, bullet, block, navigation, title page, and logo entry. Add this helper to design/registry-contract.js:

    "use strict";

    const COLLECTIONS = ["palettes", "fonts", "bullets", "blocks", "navigation", "titlePages", "logos"];

    function validateRegistryContract(registry) {
      const errors = [];
      for (const collection of COLLECTIONS) {
        for (const [id, option] of Object.entries(registry[collection] || {})) {
          for (const renderer of ["html", "latex"]) {
            if (typeof option.renderers?.[renderer] !== "boolean") {
              errors.push({ collection, id, renderer, message: "renderer support must be boolean" });
            } else if (option.renderers[renderer] === false && !String(option.limitations?.[renderer] || "").trim()) {
              errors.push({ collection, id, renderer, message: "unsupported renderer requires a limitation" });
            }
          }
        }
      }
      return errors;
    }

    function assertRegistryContract(registry) {
      const errors = validateRegistryContract(registry);
      if (errors.length) {
        const detail = errors.map((error) => error.collection + "." + error.id + "." + error.renderer).join(", ");
        throw new Error("Invalid registry renderer contract: " + detail);
      }
      return registry;
    }

    module.exports = { validateRegistryContract, assertRegistryContract };

- [ ] **Step 7: Run Task 1 tests and the full suite**

Run:

    node --test tests/canonical-json.test.js tests/registry-contract.test.js tests/registry.test.js
    npm test

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 1**

    git add lib/canonical-json.js design/registry-contract.js registry/options.js tests/canonical-json.test.js tests/registry-contract.test.js tests/registry.test.js
    git commit -m "feat: define renderer support contract"

### Task 2: Resolve validated themes into one immutable design model

**Files:**
- Create: design/resolve-design.js
- Create: tests/resolved-design.test.js
- Modify: registry/options.js

- [ ] **Step 1: Write failing resolver tests**

Create tests/resolved-design.test.js with these cases:

    const test = require("node:test");
    const assert = require("node:assert/strict");
    const { DEFAULT_THEME } = require("../schema/theme-schema");
    const { getRegistry } = require("../registry/options");
    const { resolveDesign, GENERATOR_VERSION } = require("../design/resolve-design");

    test("resolved design contains renderer-neutral identity, canvas, and components", () => {
      const design = resolveDesign(DEFAULT_THEME, getRegistry());
      assert.equal(design.identity.name, DEFAULT_THEME.identity.name);
      assert.deepEqual(design.canvas, { aspectRatio: "16:9", widthUnits: 16, heightUnits: 9 });
      assert.equal(design.colors.primary, "#456990");
      assert.equal(design.components.bullet.id, "pifont-outline");
      assert.equal(design.components.navigation.id, "page-number");
      assert.equal(design.source.generatorVersion, GENERATOR_VERSION);
      assert.match(design.source.themeHash, /^[a-f0-9]{64}$/);
    });

    test("resolved designs are deeply frozen and detached from inputs", () => {
      const theme = structuredClone(DEFAULT_THEME);
      const design = resolveDesign(theme, getRegistry());
      assert.equal(Object.isFrozen(design), true);
      assert.equal(Object.isFrozen(design.components.cornerLogo), true);
      assert.throws(() => { design.colors.primary = "#000000"; }, TypeError);
      theme.colors.primary = "#000000";
      assert.equal(design.colors.primary, "#456990");
    });

    test("resolver rejects invalid themes before registry lookup", () => {
      const theme = structuredClone(DEFAULT_THEME);
      theme.navigation.style = "missing";
      assert.throws(() => resolveDesign(theme, getRegistry()), /navigation\.style/);
    });

- [ ] **Step 2: Run resolver tests and verify RED**

Run:

    node --test tests/resolved-design.test.js

Expected: FAIL because design/resolve-design.js does not exist.

- [ ] **Step 3: Add normalized registry semantics**

Extend registry entries with the semantics consumed by the resolver:

- titlePages entries receive alignment and layout.
- blocks receive radiusUnits and shadow boolean in addition to existing renderer syntax.
- bullets expose marker, latexPackages, latexItem, and latexSubitem names while retaining old names until Task 3 completes.
- navigation exposes header and footline booleans.
- logos expose vectorId; duck uses duck and none uses null.

- [ ] **Step 4: Implement the pure resolver**

Create design/resolve-design.js. It must validate with validateTheme, assert the registry contract, resolve all IDs once, compute primaryText with textColorForBg, compute normalized logo sizes small = 0.8 and medium = 1.2, clone all returned arrays, and recursively freeze the result. Export GENERATOR_VERSION = "1".

The public API is:

    function resolveDesign(theme, registry) {
      const validation = validateTheme(theme, { registry });
      if (!validation.ok) {
        throw new Error("Invalid theme: " + validation.errors.map(formatError).join("; "));
      }
      assertRegistryContract(registry);
      const value = validation.value;
      const choices = resolveThemeChoices(value, registry);
      return deepFreeze({
        source: { themeHash: hashCanonical(value), generatorVersion: GENERATOR_VERSION },
        canvas: canvasFor(value.foundation.aspectRatio),
        identity: clone(value.identity),
        colors: resolvedColors(value.colors),
        typography: resolvedTypography(choices),
        components: resolvedComponents(value, choices),
        content: {
          sampleTitle: value.contentDefaults.sampleTitle,
          bullets: clone(value.contentDefaults.sampleBullets),
          blockTitle: "Design note",
          blockBody: "The instant HTML preview and authoritative PDF use the same resolved design."
        },
        capabilities: { html: true, latex: true, approximations: [] }
      });
    }

- [ ] **Step 5: Run resolver and registry tests**

Run:

    node --test tests/resolved-design.test.js tests/registry-contract.test.js tests/registry.test.js

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 2**

    git add design/resolve-design.js registry/options.js tests/resolved-design.test.js tests/registry.test.js
    git commit -m "feat: add immutable resolved design model"

### Task 3: Migrate LaTeX and project generation to ResolvedDesign

**Files:**
- Modify: generators/latex.js
- Modify: generators/project-writer.js
- Modify: tests/generator.test.js
- Modify: tests/project-writer.test.js

- [ ] **Step 1: Write failing LaTeX resolver-boundary tests**

Add to tests/generator.test.js:

    test("LaTeX generation resolves once and accepts a resolved design", () => {
      const registry = getRegistry();
      const design = resolveDesign(DEFAULT_THEME, registry);
      const files = generateResolvedFiles(design);
      assert.match(files["theme.cls"], /\\definecolor\{bfPrimary\}\{HTML\}\{456990\}/);
      assert.match(files["content/overview.tex"], /same resolved design/);
    });

    test("resolved 4:3 and dark fixtures preserve canvas and colors", () => {
      const theme = structuredClone(DEFAULT_THEME);
      theme.foundation.aspectRatio = "4:3";
      theme.colors.background = "#111827";
      theme.colors.primary = "#38BDF8";
      const files = generateResolvedFiles(resolveDesign(theme, getRegistry()));
      assert.match(files["theme.cls"], /\\LoadClass\[10pt,aspectratio=43\]\{beamer\}/);
      assert.match(files["theme.cls"], /\\definecolor\{bfBackground\}\{HTML\}\{111827\}/);
    });

Import resolveDesign and generateResolvedFiles in that test file.

- [ ] **Step 2: Run generator tests and verify RED**

Run:

    node --test tests/generator.test.js

Expected: FAIL because generateResolvedFiles is not exported.

- [ ] **Step 3: Refactor LaTeX generation**

In generators/latex.js:

- make generateMainTex, generateClassTex, generateOverviewTex, and generateReadme consume ResolvedDesign;
- remove registry lookup from generateClassTex;
- read identity, canvas, colors, typography, and components only from design;
- add generateResolvedFiles(design);
- keep generateFiles(theme, registry) as a compatibility boundary that calls resolveDesign and then generateResolvedFiles;
- retain schema validation behavior through resolveDesign errors.

The compatibility wrapper is:

    function generateFiles(theme, registry = getRegistry()) {
      return generateResolvedFiles(resolveDesign(theme, registry));
    }

- [ ] **Step 4: Make the project writer resolve once**

Update writeTemplateProject so it validates by calling resolveDesign once, passes the result to generateResolvedFiles, and derives font and decoration assets from design.typography and design.components instead of calling resolveThemeChoices.

- [ ] **Step 5: Run generator, writer, and full tests**

Run:

    node --test tests/generator.test.js tests/project-writer.test.js
    npm test

Expected: all tests PASS and existing generated TeX assertions remain unchanged except the resolved-design explanatory sentence.

- [ ] **Step 6: Commit Task 3**

    git add generators/latex.js generators/project-writer.js tests/generator.test.js tests/project-writer.test.js
    git commit -m "refactor: render LaTeX from resolved designs"

### Task 4: Render browser previews from server-resolved designs

**Files:**
- Modify: workbench/server.js
- Modify: workbench/public/index.html
- Modify: workbench/public/app.js
- Modify: tests/server.test.js
- Modify: tests/public-ui.test.js

- [ ] **Step 1: Write failing resolve API test**

Add to tests/server.test.js:

    test("POST /api/design/resolve returns a resolved design and rejects invalid themes", async (t) => {
      const stateDir = tempDir("beamerforge-resolve-server-");
      const baseUrl = await withServer(t, { stateDir });
      let response = await fetch(baseUrl + "/api/design/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(DEFAULT_THEME)
      });
      const design = await response.json();
      assert.equal(response.status, 200);
      assert.equal(design.colors.primary, DEFAULT_THEME.colors.primary);
      assert.equal(design.components.bullet.id, DEFAULT_THEME.bullets.style);

      const invalid = structuredClone(DEFAULT_THEME);
      invalid.navigation.style = "missing";
      response = await fetch(baseUrl + "/api/design/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(invalid)
      });
      assert.equal(response.status, 400);
    });

- [ ] **Step 2: Run the server test and verify RED**

Run:

    node --test --test-name-pattern="design/resolve" tests/server.test.js

Expected: FAIL with HTTP 405 or 404.

- [ ] **Step 3: Add the resolve API**

In workbench/server.js import resolveDesign and add POST /api/design/resolve after PUT /api/theme. Parse the request body, call resolveDesign(theme, registry), return the resolved object, and translate resolver validation errors to HTTP 400.

- [ ] **Step 4: Write failing browser contract tests**

Add to tests/public-ui.test.js assertions that:

- the toolbar contains the exact label Instant HTML preview;
- app state contains resolvedDesign and resolveSequence;
- resolvePreviewDesign posts state.theme to /api/design/resolve;
- stale responses are discarded by comparing the request sequence;
- renderThemeInto reads design.components and does not read state.registry inside appendHeader, appendList, appendBlock, appendFootline, or appendCornerLogo.

- [ ] **Step 5: Run public UI tests and verify RED**

Run:

    node --test tests/public-ui.test.js

Expected: FAIL because the new label and resolver flow are absent.

- [ ] **Step 6: Migrate the browser preview**

In index.html change Live Beamer preview to Instant HTML preview.

In app.js:

- add resolvedDesign: null and resolveSequence: 0 to state;
- add async resolvePreviewDesign(theme) that increments the sequence, POSTs the theme, discards an older response, stores the newest design, and calls renderPreview;
- call it after boot and after theme mutations, with a 50 ms debounce for continuous color input;
- change appendHeader, appendTitle, appendList, appendBlock, appendFootline, appendCornerLogo, and renderThemeInto to consume ResolvedDesign only;
- keep the last valid resolved design visible while a newer invalid request reports field errors.

- [ ] **Step 7: Run focused and full tests**

Run:

    node --test tests/server.test.js tests/public-ui.test.js
    npm test

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 4**

    git add workbench/server.js workbench/public/index.html workbench/public/app.js tests/server.test.js tests/public-ui.test.js
    git commit -m "feat: render HTML from resolved designs"

### Task 5: Add deterministic compiled-preview caching

**Files:**
- Create: workbench/preview-cache.js
- Create: tests/preview-cache.test.js
- Modify: workbench/build.js

- [ ] **Step 1: Write failing preview-cache tests**

Create tests/preview-cache.test.js with real temporary directories and injected writer/compiler functions. Cover:

    test("preview cache compiles once for an identical design", async () => {
      let compiles = 0;
      const service = createPreviewCache({
        cacheRoot: tempDir("beamerforge-preview-"),
        projectWriter: writeFakeProject,
        compiler: compileFakePdf(() => { compiles += 1; })
      });
      const first = await service.compile({ theme: DEFAULT_THEME, registry: getRegistry(), sourceVersion: "manual" });
      const second = await service.compile({ theme: DEFAULT_THEME, registry: getRegistry(), sourceVersion: "selected" });
      assert.equal(first.status, "ready");
      assert.equal(first.cached, false);
      assert.equal(second.cached, true);
      assert.equal(first.cacheKey, second.cacheKey);
      assert.equal(compiles, 1);
    });

Also add separate tests for generator-version invalidation, concurrent request coalescing, forced refresh, missing compiler returning unavailable, failed compilation preserving stalePdfPath, corrupt metadata producing a miss, and resolvePdf rejecting traversal.

- [ ] **Step 2: Run preview-cache tests and verify RED**

Run:

    node --test tests/preview-cache.test.js

Expected: FAIL because workbench/preview-cache.js does not exist.

- [ ] **Step 3: Implement preview-cache service**

Create createPreviewCache(options) with:

- cacheRoot, rootDir, outputRoot, projectWriter, compiler, registry, and generatorVersion dependencies;
- compile({ theme, sourceVersion, force }) returning ready, failed, or unavailable;
- key = themeHash + "-" + generatorVersion;
- ready metadata accepted only when metadata.json and main.pdf both exist and hashes match;
- an inFlight Map keyed by cache key;
- compilation in a temporary sibling directory;
- atomic rename into the final cache directory only after success;
- forced refresh preserving an existing ready directory until replacement succeeds;
- resolvePdf(cacheKey) accepting only /^[a-f0-9]{64}-[A-Za-z0-9._-]+$/ and returning an existing main.pdf beneath cacheRoot.

Return browser-safe metadata only; never return absolute filesystem paths from the server API.

- [ ] **Step 4: Expose compiler identity**

In workbench/build.js ensure successful, missing, and failed compile results all include compilerKind. This value populates cache metadata without parsing command strings.

- [ ] **Step 5: Run cache and build tests**

Run:

    node --test tests/preview-cache.test.js tests/build.test.js

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 5**

    git add workbench/preview-cache.js workbench/build.js tests/preview-cache.test.js tests/build.test.js
    git commit -m "feat: cache authoritative LaTeX previews"

### Task 6: Add compiled-preview API and review-route UI

**Files:**
- Modify: workbench/server.js
- Modify: workbench/public/index.html
- Modify: workbench/public/app.js
- Modify: workbench/public/styles.css
- Modify: tests/server.test.js
- Modify: tests/public-ui.test.js

- [ ] **Step 1: Write failing compiled-preview API tests**

Add server tests for:

- POST /api/preview/compile with source manual using manual-theme.json when it
  exists and otherwise using the current validated theme for pre-freeze review;
- source ai requiring ai-draft-theme.json;
- source selected reading theme.json;
- force boolean forwarding;
- ready response containing pdfUrl but no absolute path;
- GET /api/preview/{cacheKey}/main.pdf returning application/pdf;
- invalid cache keys and traversal returning 404;
- failed and unavailable results returning HTTP 200 because they are preview states, not transport errors.

Use an injected previewCache in createWorkbenchServer options so tests do not require a real compiler.

- [ ] **Step 2: Run API tests and verify RED**

Run:

    node --test --test-name-pattern="preview" tests/server.test.js

Expected: FAIL because preview routes are absent.

- [ ] **Step 3: Wire preview cache into the server**

Instantiate createPreviewCache once in createWorkbenchServer unless options.previewCache is supplied. Add:

- POST /api/preview/compile reading { source, force };
- the source-to-theme mapping manual, ai, selected, including the current-theme
  fallback for a not-yet-frozen manual review;
- GET /api/preview/{cacheKey}/main.pdf using previewCache.resolvePdf;
- .pdf = application/pdf in CONTENT_TYPES;
- startup assertRegistryContract(registry).

- [ ] **Step 4: Write failing UI tests**

Extend public-ui tests to require:

- authoritativePreview, authoritativeStatus, retryPreview, and refreshPreview IDs;
- exact heading Authoritative LaTeX preview;
- maybeRequestAuthoritativePreview only for manual-review, ai-compare, and final-review;
- source mapping manual-review to manual, AI comparison to both manual and ai,
  and final review to selected;
- manualLatexPreview and aiLatexPreview comparison slots that render the cached
  baseline and newly compiled draft independently;
- cached, stale, unavailable, failed, and ready state rendering;
- an iframe or object using only the returned pdfUrl;
- HTML slidePreview remaining present for every compiled-preview state.

- [ ] **Step 5: Run UI tests and verify RED**

Run:

    node --test tests/public-ui.test.js

Expected: FAIL because authoritative preview elements and behavior are absent.

- [ ] **Step 6: Implement the review-route interface**

Add the authoritative preview region beneath slidePreview in index.html. In app.js:

- track authoritativePreviews as independent manual, ai, and selected records,
  each shaped { requestKey, state, source, pdfUrl, stalePdfUrl, error };
- call maybeRequestAuthoritativePreview after each render;
- avoid repeat calls by keying on route, source, and resolved theme hash;
- POST to /api/preview/compile;
- show ready PDFs in an object element with type application/pdf;
- render manual and AI authoritative objects beneath their corresponding cards
  on the AI comparison route;
- show cached and stale labels;
- show bounded compiler messages in textContent;
- wire Retry to force false after failure and Refresh to force true;
- keep the instant HTML article mounted in every state.

Add styles for .authoritative-preview, .preview-state, .is-stale, .is-failed, and the PDF object with the selected aspect ratio.

- [ ] **Step 7: Run focused and full tests**

Run:

    node --test tests/server.test.js tests/public-ui.test.js tests/preview-cache.test.js
    npm test

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 6**

    git add workbench/server.js workbench/public/index.html workbench/public/app.js workbench/public/styles.css tests/server.test.js tests/public-ui.test.js
    git commit -m "feat: show authoritative previews on review routes"

### Task 7: Generate SVG and TikZ from one trusted duck vector

**Files:**
- Create: elements/decorations/logos/duck-vector.js
- Create: design/vector-renderers.js
- Create: tests/vector-renderers.test.js
- Modify: registry/options.js
- Modify: generators/latex.js
- Modify: generators/project-writer.js
- Modify: tests/generator.test.js
- Modify: tests/project-writer.test.js
- Modify: tests/registry.test.js

- [ ] **Step 1: Write failing vector renderer tests**

Create tests/vector-renderers.test.js:

    const test = require("node:test");
    const assert = require("node:assert/strict");
    const duck = require("../elements/decorations/logos/duck-vector");
    const { validateVector, renderSvg, renderTikz } = require("../design/vector-renderers");

    test("duck vector validates and renders the same five primitives", () => {
      assert.deepEqual(validateVector(duck), []);
      const svg = renderSvg(duck);
      const tikz = renderTikz(duck);
      assert.equal((svg.match(/<(ellipse|circle|polygon|line)\b/g) || []).length, 5);
      assert.equal((tikz.match(/\\(fill|draw)\b/g) || []).length, 5);
      assert.match(svg, /viewBox="0 0 6 4"/);
      assert.match(tikz, /bfDuckYellow/);
    });

    test("unknown vector primitives are rejected", () => {
      assert.deepEqual(validateVector({ viewBox: [0, 0, 1, 1], colors: {}, primitives: [{ type: "path" }] }), [
        { path: "primitives.0.type", message: "unsupported primitive path" }
      ]);
    });

- [ ] **Step 2: Run vector tests and verify RED**

Run:

    node --test tests/vector-renderers.test.js

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Define canonical duck geometry**

Create duck-vector.js with a 6 by 4 view box, named yellow, orange, black, and wing colors, and the existing five shapes represented as numeric ellipse, circle, and polygon primitives. Export a deeply frozen plain object with id duck.

- [ ] **Step 4: Implement strict SVG and TikZ renderers**

Create vector-renderers.js:

- validate finite viewBox values, known color names, and exact numeric fields;
- support ellipse, circle, polygon, and line only;
- XML-escape SVG IDs and color values;
- generate deterministic SVG order;
- map normalized coordinates into a TikZ scope with y-axis inversion;
- generate one fill or draw command per primitive;
- throw a combined validation error before rendering invalid vectors.

- [ ] **Step 5: Replace duplicated duck implementations**

In registry/options.js replace the static asset path with vectorId: "duck" and previewUrl: "/assets/generated/logos/duck.svg".

In resolve-design.js attach the trusted vector description to the resolved cornerLogo.

In latex.js replace the hand-written duck TikZ body with renderTikz(design.components.cornerLogo.vector).

In project-writer.js write renderSvg(vector) to assets/corner-logo.svg.

In server.js serve /assets/generated/logos/duck.svg from renderSvg through the trusted logo registry rather than from an arbitrary path.

Remove elements/decorations/logos/duck.svg only after the new tests pass and no registry entry references it.

- [ ] **Step 6: Run vector, generator, writer, registry, and server tests**

Run:

    node --test tests/vector-renderers.test.js tests/generator.test.js tests/project-writer.test.js tests/registry.test.js tests/server.test.js
    npm test

Expected: all tests PASS and no source reference remains to elements/decorations/logos/duck.svg.

- [ ] **Step 7: Compile the duck fixture**

Run:

    npm run smoke:compile

Expected: exit 0 with a generated PDF when a compiler is available. If the script reports missing compiler, record the exact unavailable result and do not claim compile verification.

- [ ] **Step 8: Commit Task 7**

    git add design/vector-renderers.js elements/decorations/logos/duck-vector.js elements/decorations/logos/duck.svg registry/options.js design/resolve-design.js generators/latex.js generators/project-writer.js workbench/server.js tests/vector-renderers.test.js tests/generator.test.js tests/project-writer.test.js tests/registry.test.js tests/server.test.js
    git commit -m "refactor: generate duck renderers from one vector"

### Task 8: Add stress fixtures and optional rendered parity command

**Files:**
- Create: workbench/parity-check.js
- Create: tests/parity-check.test.js
- Modify: package.json
- Modify: tests/resolved-design.test.js
- Modify: tests/generator.test.js

- [ ] **Step 1: Write failing structural stress tests**

Add fixtures for default, dark, 4:3, duck, and long-content themes. Assert each resolves with HTML and LaTeX capabilities, generates TeX, and reports a density warning when sampleTitle exceeds 90 characters or combined bullet text exceeds 360 characters.

The warning shape is:

    { code: "content-density", severity: "warning", message: "Sample content may overflow in one or both renderers." }

- [ ] **Step 2: Run stress tests and verify RED**

Run:

    node --test tests/resolved-design.test.js tests/generator.test.js

Expected: FAIL because capabilities.warnings and density analysis are absent.

- [ ] **Step 3: Add deterministic density analysis**

In resolve-design.js compute capabilities.warnings from the exact thresholds above. Do not block generation; warnings are informational and shared by both renderers.

- [ ] **Step 4: Write failing parity command tests**

Create tests/parity-check.test.js with injected command discovery and execution. Verify:

- missing XeLaTeX reports { status: "unavailable", missing: ["latex"] };
- missing browser, pdftoppm, or ImageMagick compare names each missing dependency;
- a complete fake toolchain returns a report containing all five fixture IDs, structural landmark results, dominant-color distance, and image-distance score;
- a score above the configured threshold returns status failed rather than passed.

- [ ] **Step 5: Run parity command tests and verify RED**

Run:

    node --test tests/parity-check.test.js

Expected: FAIL because workbench/parity-check.js does not exist.

- [ ] **Step 6: Implement optional parity orchestration**

Create parity-check.js that:

- discovers latexmk or xelatex, pdftoppm, ImageMagick compare, and chromium,
  chrome, or msedge;
- returns unavailable and names every missing dependency before doing work;
- writes fixture projects beneath a temporary directory;
- uses the existing generator and compiler;
- writes a deterministic standalone HTML fixture from ResolvedDesign;
- captures HTML at matching aspect ratio with a headless browser;
- rasterizes the overview PDF page;
- compares required landmark presence and invokes ImageMagick compare for the
  normalized image-distance score;
- reports measured, unavailable, or failed without converting missing tools into a pass;
- exits 0 for measured pass, 1 for measured failure, and 2 for unavailable
  dependencies;
- exports pure helpers for unit testing and runs from the command line.

Add package scripts:

    "parity": "node workbench/parity-check.js"

Add all new production modules to npm run check.

- [ ] **Step 7: Run parity tests and the local command**

Run:

    node --test tests/parity-check.test.js tests/resolved-design.test.js tests/generator.test.js
    npm run parity

Expected: tests PASS. The command either emits a measured report and exits 0, or
reports unavailable dependencies and exits 2.

- [ ] **Step 8: Commit Task 8**

    git add workbench/parity-check.js tests/parity-check.test.js tests/resolved-design.test.js tests/generator.test.js package.json
    git commit -m "test: add renderer parity stress suite"

### Task 9: Final integration and visual verification

**Files:**
- Modify only files required by defects revealed in this task.

- [ ] **Step 1: Run the complete automated verification**

Run:

    npm test
    npm run check
    git diff --check

Expected: all tests PASS, syntax checks exit 0, and diff check prints no errors.

- [ ] **Step 2: Start the updated workbench**

Run:

    $env:PORT = "5188"
    npm start

Expected: BeamerForge reports http://localhost:5188 and remains running.

- [ ] **Step 3: Verify the manual review workflow**

Open /manual-review after completing or loading a valid manual theme. Confirm:

- Instant HTML preview is visible immediately.
- Authoritative LaTeX preview enters pending then ready, cached, or unavailable.
- Refresh forces a new attempt.
- An unavailable compiler does not remove the HTML preview.

- [ ] **Step 4: Verify AI comparison and final review**

With the existing manual baseline and duck AI draft, confirm:

- manual and AI HTML comparisons still render;
- manual compiled preview is reused;
- AI draft compiles under a distinct key;
- final review compiles the explicitly selected theme;
- duck position, size, and scope agree between HTML and PDF.

- [ ] **Step 5: Run the parity command and inspect its report**

Run:

    npm run parity

Expected: measured report with no failed fixture when all tools exist, or explicit unavailable dependencies.

- [ ] **Step 6: Commit verified integration fixes**

If verification reveals a defect, follow a fresh red-green cycle, stage only the
test and production files changed for that defect, rerun Step 1, and commit them
with message fix: complete renderer parity integration. If verification reveals
no defect, do not create an empty integration commit.

- [ ] **Step 7: Record final evidence**

Capture the final test count, syntax-check exit code, parity status, compile status, and git status for the handoff. Do not claim image parity when npm run parity reports unavailable.
