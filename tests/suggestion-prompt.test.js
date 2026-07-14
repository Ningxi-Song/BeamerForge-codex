"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_THEME, validateTheme } = require("../schema/theme-schema");
const { getRegistry } = require("../registry/options");
const {
  createMessages,
  parseCandidate
} = require("../workbench/ai/suggestion-prompt");

test("messages constrain output and include the complete protected context", () => {
  const baseline = structuredClone(DEFAULT_THEME);
  const messages = createMessages({
    baseline,
    brief: "Make the palette warmer but keep the typography.",
    registry: getRegistry(),
    referenceContext: {
      text: "--- sample.tex ---\n\\begin{frame}Example\\end{frame}",
      images: []
    }
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /complete JSON object/);
  assert.match(messages[0].content, /exactly the same supported theme shape/);
  assert.match(messages[0].content, /Do not return Markdown/);
  assert.match(messages[0].content, /raw LaTeX/);
  assert.match(messages[0].content, /TikZ/);
  assert.match(messages[0].content, /packages/);
  assert.match(messages[0].content, /arbitrary asset paths/);
  assert.equal(messages[1].role, "user");
  assert.equal(typeof messages[1].content, "string");
  assert.match(messages[1].content, /Make the palette warmer/);
  assert.match(messages[1].content, /Protected baseline JSON/);
  assert.match(messages[1].content, /sample\.tex/);
  assert.match(messages[1].content, /Allowed catalog choices/);
  assert.match(messages[1].content, /warm-neutral/);
  assert.match(messages[1].content, /Warm Neutral/);
  assert.match(messages[1].content, /fira-sans/);
  assert.match(messages[1].content, /Triangle/);
  assert.ok(messages[1].content.includes(JSON.stringify(baseline)));
});

test("image blocks are appended to the user message", () => {
  const image = {
    type: "image_url",
    image_url: { url: "data:image/png;base64,cG5n" }
  };
  const messages = createMessages({
    baseline: DEFAULT_THEME,
    brief: "Use this composition as inspiration.",
    referenceContext: { text: "", images: [image] }
  });
  assert.ok(Array.isArray(messages[1].content));
  assert.equal(messages[1].content[0].type, "text");
  assert.deepEqual(messages[1].content[1], image);
});

test("an empty brief is rejected before provider work starts", () => {
  assert.throws(
    () => createMessages({
      baseline: DEFAULT_THEME,
      brief: "   ",
      referenceContext: { text: "", images: [] }
    }),
    (error) => error.statusCode === 400 && /Describe/.test(error.message)
  );
});

test("parser accepts plain and fenced complete theme JSON", () => {
  const options = { registry: getRegistry(), validateTheme };
  const plain = parseCandidate(JSON.stringify(DEFAULT_THEME), options);
  const fenced = parseCandidate(`\`\`\`json\n${JSON.stringify(DEFAULT_THEME)}\n\`\`\``, options);
  assert.deepEqual(plain, DEFAULT_THEME);
  assert.deepEqual(fenced, DEFAULT_THEME);
});

test("parser rejects arrays and prose with a stable response error", () => {
  const options = { registry: getRegistry(), validateTheme };
  for (const content of ["[]", "Here is your theme: {}"] ) {
    assert.throws(
      () => parseCandidate(content, options),
      (error) => error.code === "provider_invalid_response" && error.statusCode === 502
    );
  }
});

test("parser rejects unknown fields and invalid registry IDs", () => {
  const options = { registry: getRegistry(), validateTheme };
  const unknown = structuredClone(DEFAULT_THEME);
  unknown.rawLatex = "\\usepackage{shellesc}";
  assert.throws(
    () => parseCandidate(JSON.stringify(unknown), options),
    (error) => error.code === "provider_invalid_theme"
      && error.statusCode === 422
      && Array.isArray(error.errors)
  );

  const invalidId = structuredClone(DEFAULT_THEME);
  invalidId.colors.id = "not-a-registered-palette";
  assert.throws(
    () => parseCandidate(JSON.stringify(invalidId), options),
    (error) => error.code === "provider_invalid_theme"
      && error.errors.some(({ path }) => path === "colors.id")
  );
});
