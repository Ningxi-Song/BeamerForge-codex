const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME, validateTheme, slugifyName } = require("../schema/theme-schema");

test("validates the default theme", () => {
  const result = validateTheme(DEFAULT_THEME);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.value.identity.name, "blue-academic");
  assert.equal(result.value.foundation.aspectRatio, "16:9");
});

test("reports field-level validation errors", () => {
  const broken = {
    identity: { name: "Bad Name With Spaces" },
    foundation: { aspectRatio: "3:2" },
    colors: { paletteId: "academic-blue", background: "white", primary: "#456990", accent: "#57C3C2", text: "#000000" },
    fonts: { body: "palatino", title: "palatino", mode: "serif-academic" },
    bullets: { style: "pifont-outline" },
    blocks: { style: "rounded" },
    navigation: { style: "page-number" },
    titlePage: { layout: "left-curtain" },
    decorations: { cornerLogo: { id: "none", position: "top-right", size: "small", scope: "content-frames" } },
    contentDefaults: { sampleTitle: "" }
  };
  const result = validateTheme(broken);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.path),
    [
      "identity.name",
      "identity.title",
      "identity.subtitle",
      "identity.author",
      "identity.institute",
      "identity.date",
      "foundation.aspectRatio",
      "colors.background",
      "colors.blockBody",
      "colors.alert",
      "contentDefaults.sampleTitle",
      "contentDefaults.sampleBullets"
    ]
  );
});

test("reports field-level errors for invalid sample bullet items", () => {
  const broken = JSON.parse(JSON.stringify(DEFAULT_THEME));
  broken.contentDefaults.sampleBullets = ["Good", "", {}];

  const result = validateTheme(broken);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.path),
    ["contentDefaults.sampleBullets.1", "contentDefaults.sampleBullets.2"]
  );
});

test("slugifies names for output paths", () => {
  assert.equal(slugifyName("Blue Academic 2026"), "blue-academic-2026");
  assert.equal(slugifyName("___Bamboo!!!"), "bamboo");
});

test("rejects unknown theme fields instead of silently ignoring AI code", () => {
  const broken = structuredClone(DEFAULT_THEME);
  broken.rawLatex = "\\usepackage{shellesc}";
  broken.colors.unexpected = "#000000";
  const result = validateTheme(broken);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.filter((error) => error.message === "is not allowed").map((error) => error.path), [
    "rawLatex",
    "colors.unexpected"
  ]);
});

test("validates trusted corner logo decorations", () => {
  const theme = structuredClone(DEFAULT_THEME);
  theme.decorations.cornerLogo = { id: "duck", position: "top-right", size: "small", scope: "content-frames" };
  assert.equal(validateTheme(theme, { registry: require("../registry/options").getRegistry() }).ok, true);
  theme.decorations.cornerLogo.position = "center";
  const result = validateTheme(theme, { registry: require("../registry/options").getRegistry() });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.path === "decorations.cornerLogo.position"), true);
});
