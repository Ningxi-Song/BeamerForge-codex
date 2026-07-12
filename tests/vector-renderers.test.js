"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const duck = require("../elements/decorations/logos/duck-vector");
const {
  validateVector,
  assertValidVector,
  renderSvg,
  renderTikz
} = require("../design/vector-renderers");

function clone(value) {
  return structuredClone(value);
}

test("canonical duck is deeply frozen plain data with five ordered primitives", () => {
  assert.equal(Object.isFrozen(duck), true);
  assert.equal(Object.isFrozen(duck.colors), true);
  assert.equal(Object.isFrozen(duck.primitives), true);
  assert.equal(duck.id, "duck");
  assert.deepEqual(duck.viewBox, [0, 0, 6, 4]);
  assert.deepEqual(duck.colors, {
    yellow: "#F4B942",
    orange: "#E67E22",
    black: "#17202A",
    wing: "#D99B2B"
  });
  assert.deepEqual(duck.primitives.map((primitive) => primitive.type), [
    "ellipse", "circle", "polygon", "circle", "ellipse"
  ]);
  assert.doesNotThrow(() => JSON.stringify(duck));
  assert.deepEqual(validateVector(duck), []);
  assert.equal(assertValidVector(duck), duck);
});

test("SVG renders the exact view box, colors, title, and one shape per primitive", () => {
  const svg = renderSvg(duck);

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 6 4" role="img" aria-labelledby="duck-title">/);
  assert.match(svg, /<title id="duck-title">duck logo<\/title>/);
  assert.equal((svg.match(/<(?:ellipse|circle|polygon|line)\b/g) || []).length, 5);
  assert.deepEqual(
    [...svg.matchAll(/<(ellipse|circle|polygon|line)\b/g)].map((match) => match[1]),
    ["ellipse", "circle", "polygon", "circle", "ellipse"]
  );
  for (const hex of Object.values(duck.colors)) assert.match(svg, new RegExp(hex));
});

test("TikZ defines trusted colors, inverts SVG y, and emits one command per primitive", () => {
  const tikz = renderTikz(duck);

  assert.match(tikz, /\\definecolor\{bfVectorDuckYellow\}\{HTML\}\{F4B942\}/);
  assert.match(tikz, /\\definecolor\{bfVectorDuckWing\}\{HTML\}\{D99B2B\}/);
  assert.match(tikz, /\\begin\{scope\}\[yscale=-1,yshift=-4cm\]/);
  assert.match(tikz, /\\path\[use as bounding box\] \(0,0\) rectangle \(6,4\);/);
  assert.equal((tikz.match(/^\s*\\(?:fill|draw)\b/gm) || []).length, 5);
  assert.equal(tikz.includes("<svg"), false);
  assert.equal(tikz.includes("<path"), false);
});

test("SVG and TikZ output is deterministic", () => {
  assert.equal(renderSvg(duck), renderSvg(duck));
  assert.equal(renderTikz(duck), renderTikz(duck));
});

const INVALID_CASES = [
  ["unknown primitive", (value) => { value.primitives[0] = { type: "path", d: "M0 0", fill: "yellow" }; }, "primitives[0].type"],
  ["extra top-level key", (value) => { value.markup = "<script>"; }, "markup"],
  ["extra primitive key", (value) => { value.primitives[0].onclick = "alert(1)"; }, "primitives[0].onclick"],
  ["non-finite number", (value) => { value.primitives[0].cx = NaN; }, "primitives[0].cx"],
  ["out-of-bounds radius", (value) => { value.primitives[0].rx = 9; }, "primitives[0].rx"],
  ["unknown fill", (value) => { value.primitives[0].fill = "missing"; }, "primitives[0].fill"],
  ["unsafe vector token", (value) => { value.id = "duck</title>"; }, "id"],
  ["unsafe color token", (value) => { value.colors["bad name"] = "#000000"; }, "colors.bad name"]
];

for (const [name, mutate, expectedPath] of INVALID_CASES) {
  test(`strict vector validation rejects ${name}`, () => {
    const value = clone(duck);
    mutate(value);
    const errors = validateVector(value);

    assert.equal(errors.some((error) => error.path === expectedPath), true, JSON.stringify(errors));
    assert.throws(() => assertValidVector(value), /Invalid vector:/);
    assert.throws(() => renderSvg(value), /Invalid vector:/);
    assert.throws(() => renderTikz(value), /Invalid vector:/);
  });
}

test("line is the only stroked primitive and requires a positive width", () => {
  const lineVector = {
    id: "line-logo",
    viewBox: [0, 0, 6, 4],
    colors: { ink: "#17202A" },
    primitives: [{ type: "line", x1: 0, y1: 0, x2: 6, y2: 4, stroke: "ink", strokeWidth: 0.2 }]
  };
  assert.deepEqual(validateVector(lineVector), []);
  assert.match(renderSvg(lineVector), /<line x1="0" y1="0" x2="6" y2="4" stroke="#17202A" stroke-width="0\.2"\/>/);
  assert.match(renderTikz(lineVector), /\\draw\[draw=bfVectorLineLogoInk,line width=0\.2cm\]/);

  lineVector.primitives[0].strokeWidth = 0;
  assert.equal(validateVector(lineVector)[0].path, "primitives[0].strokeWidth");
});
