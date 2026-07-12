"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const duck = require("../elements/decorations/logos/duck-vector");
const {
  validateVector,
  assertValidVector,
  renderSvg,
  renderTikz,
  validateTikzRenderability,
  formatNumber,
  LOGO_TARGET_WIDTHS_CM,
  MIN_TIKZ_SCALE,
  MAX_TIKZ_SCALE,
  TEX_SAFE_DIMENSION_CM,
  MAX_ABS_COORD,
  MAX_VIEWBOX_DIM,
  MAX_COLORS,
  MAX_PRIMITIVES,
  MAX_POLYGON_POINTS,
  MAX_TOTAL_POINTS,
  MAX_STROKE_WIDTH,
  MAX_TOKEN_LENGTH
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

  assert.match(tikz, /\\definecolor\{bfvI6475636bK79656c6c6f77\}\{HTML\}\{F4B942\}/);
  assert.match(tikz, /\\definecolor\{bfvI6475636bK77696e67\}\{HTML\}\{D99B2B\}/);
  assert.match(tikz, /\\begin\{scope\}\[yscale=-1,yshift=-4cm\]/);
  assert.match(tikz, /\\path\[use as bounding box\] \(0,0\) rectangle \(6,4\);/);
  assert.match(tikz, /\\clip \(0,0\) rectangle \(6,4\);/);
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
    primitives: [{ type: "line", x1: 0.1, y1: 0.1, x2: 5.9, y2: 3.9, stroke: "ink", strokeWidth: 0.2 }]
  };
  assert.deepEqual(validateVector(lineVector), []);
  assert.match(renderSvg(lineVector), /<line x1="0\.1" y1="0\.1" x2="5\.9" y2="3\.9" stroke="#17202A" stroke-width="0\.2"\/>/);
  assert.match(renderTikz(lineVector), /\\draw\[draw=bfvI6c696e652d6c6f676fK696e6b,line width=0\.2cm\]/);

  lineVector.primitives[0].strokeWidth = 0;
  assert.equal(validateVector(lineVector)[0].path, "primitives[0].strokeWidth");
});

test("TikZ rejects scaled strokes that round to zero and accepts the nearest positive boundary", () => {
  const lineVector = {
    id: "thin-line-logo",
    viewBox: [0, 0, 2, 1],
    colors: { ink: "#17202A" },
    primitives: [{
      type: "line",
      x1: 0.000001,
      y1: 0.5,
      x2: 1.999999,
      y2: 0.5,
      stroke: "ink",
      strokeWidth: 0.000001
    }]
  };

  assert.throws(
    () => renderTikz(lineVector, { strokeScale: 0.5 }),
    /TikZ scaled stroke width at primitives\[0\] must remain positive at 6-decimal precision/
  );
  assert.match(
    renderTikz(lineVector, { strokeScale: 0.500001 }),
    /line width=0\.000001cm/
  );
});

test("TikZ renderer options are validated before vector data", () => {
  assert.throws(
    () => renderTikz(null, { strokeScale: 0 }),
    /TikZ strokeScale must be greater than zero and at most 10000/
  );
});

test("TikZ renderability publishes the product widths and conservative TeX limits", () => {
  assert.deepEqual(LOGO_TARGET_WIDTHS_CM, { small: 0.8, medium: 1.2 });
  assert.equal(Object.isFrozen(LOGO_TARGET_WIDTHS_CM), true);
  assert.equal(MIN_TIKZ_SCALE, 0.000001);
  assert.equal(MAX_TIKZ_SCALE, 10000);
  assert.equal(TEX_SAFE_DIMENSION_CM, 500);
});

test("TikZ renderability accepts scale boundaries and rejects values outside them", () => {
  const tinyPolygon = {
    id: "tiny-polygon",
    viewBox: [0, 0, 0.00012, 0.00012],
    colors: { ink: "#17202A" },
    primitives: [{
      type: "polygon",
      points: [[0, 0], [0.00012, 0], [0, 0.00012]],
      fill: "ink"
    }]
  };

  assert.deepEqual(validateTikzRenderability(duck, { strokeScale: MIN_TIKZ_SCALE }), []);
  assert.equal(
    validateTikzRenderability(duck, { strokeScale: 0.0000004 })[0].path,
    "strokeScale"
  );
  assert.deepEqual(validateTikzRenderability(tinyPolygon, { strokeScale: MAX_TIKZ_SCALE }), []);
  assert.equal(
    validateTikzRenderability(tinyPolygon, { strokeScale: MAX_TIKZ_SCALE + 0.000001 })[0].path,
    "strokeScale"
  );
});

test("TikZ renderability enforces raw, shifted, and transformed coordinate dimensions", () => {
  const polygon = {
    id: "dimension-boundary",
    viewBox: [499, 0, 1, 1],
    colors: { ink: "#17202A" },
    primitives: [{ type: "polygon", points: [[499, 0], [500, 0], [499, 1]], fill: "ink" }]
  };
  assert.deepEqual(validateTikzRenderability(polygon, { strokeScale: 1 }), []);

  const rawOverflow = clone(polygon);
  rawOverflow.viewBox[0] = 499.000001;
  rawOverflow.primitives[0].points = [[499.000001, 0], [500.000001, 0], [499.000001, 1]];
  assert.equal(
    validateTikzRenderability(rawOverflow, { strokeScale: 1 })
      .some((item) => item.path === "viewBox[2]" && /serialized coordinate/.test(item.message)),
    true
  );

  const transformedOverflow = clone(polygon);
  transformedOverflow.viewBox = [249, 0, 1, 1];
  transformedOverflow.primitives[0].points = [[249, 0], [250, 0], [249, 1]];
  assert.equal(
    validateTikzRenderability(transformedOverflow, { strokeScale: 2.000001 })
      .some((item) => item.path === "viewBox[2]" && /transformed coordinate/.test(item.message)),
    true
  );

  const shiftedOverflow = clone(polygon);
  shiftedOverflow.viewBox = [0, 249.500001, 1, 1];
  shiftedOverflow.primitives[0].points = [[0, 249.500001], [1, 249.500001], [0, 250.500001]];
  assert.equal(
    validateTikzRenderability(shiftedOverflow, { strokeScale: 1 })
      .some((item) => item.path === "viewBox[1]" && /y-shift/.test(item.message)),
    true
  );
});

test("TikZ renderability bounds scaled strokes at the TeX dimension ceiling", () => {
  const lineVector = {
    id: "wide-rendered-line",
    viewBox: [0, 0, 0.1, 0.1],
    colors: { ink: "#17202A" },
    primitives: [{
      type: "line", x1: 0.05, y1: 0.05, x2: 0.05, y2: 0.05,
      stroke: "ink", strokeWidth: 0.1
    }]
  };

  assert.deepEqual(validateTikzRenderability(lineVector, { strokeScale: 5000 }), []);
  assert.equal(
    validateTikzRenderability(lineVector, { strokeScale: 5000.00002 })
      .some((item) => item.path === "primitives[0].strokeWidth" && /at most 500cm/.test(item.message)),
    true
  );
});

test("line strokes must remain inside every viewBox edge", () => {
  const vector = {
    id: "edge-line",
    viewBox: [0, 0, 6, 4],
    colors: { ink: "#17202A" },
    primitives: [{ type: "line", x1: 0, y1: 2, x2: 6, y2: 2, stroke: "ink", strokeWidth: 1 }]
  };

  assert.equal(validateVector(vector).some((item) => item.path === "primitives[0].x1"), true);
  assert.equal(validateVector(vector).some((item) => item.path === "primitives[0].x2"), true);
  assert.throws(() => renderSvg(vector), /must keep the stroke inside the viewBox/);
});

test("published vector limits are enforced before rendering", () => {
  assert.deepEqual({
    MAX_ABS_COORD,
    MAX_VIEWBOX_DIM,
    MAX_COLORS,
    MAX_PRIMITIVES,
    MAX_POLYGON_POINTS,
    MAX_TOTAL_POINTS,
    MAX_STROKE_WIDTH,
    MAX_TOKEN_LENGTH
  }, {
    MAX_ABS_COORD: 10000,
    MAX_VIEWBOX_DIM: 10000,
    MAX_COLORS: 32,
    MAX_PRIMITIVES: 128,
    MAX_POLYGON_POINTS: 256,
    MAX_TOTAL_POINTS: 1024,
    MAX_STROKE_WIDTH: 100,
    MAX_TOKEN_LENGTH: 64
  });

  const cases = [];
  const hugeViewBox = clone(duck);
  hugeViewBox.viewBox = [1e308, 0, 1e308, 4];
  cases.push([hugeViewBox, "viewBox[0]"]);
  const wideViewBox = clone(duck);
  wideViewBox.viewBox[2] = MAX_VIEWBOX_DIM + 1;
  cases.push([wideViewBox, "viewBox[2]"]);
  const tinyViewBox = clone(duck);
  tinyViewBox.viewBox[2] = 0.0000001;
  cases.push([tinyViewBox, "viewBox[2]"]);
  const hugeCoordinate = clone(duck);
  hugeCoordinate.primitives[0].cx = MAX_ABS_COORD + 1;
  cases.push([hugeCoordinate, "primitives[0].cx"]);
  const tooManyColors = clone(duck);
  for (let index = 0; index <= MAX_COLORS; index += 1) tooManyColors.colors[`c${index}`] = "#000000";
  cases.push([tooManyColors, "colors"]);
  const tooManyPrimitives = clone(duck);
  tooManyPrimitives.primitives = Array.from({ length: MAX_PRIMITIVES + 1 }, () => clone(duck.primitives[3]));
  cases.push([tooManyPrimitives, "primitives"]);
  const tooManyPolygonPoints = clone(duck);
  tooManyPolygonPoints.primitives = [{
    type: "polygon",
    points: Array.from({ length: MAX_POLYGON_POINTS + 1 }, () => [1, 1]),
    fill: "yellow"
  }];
  cases.push([tooManyPolygonPoints, "primitives[0].points"]);
  const tooManyTotalPoints = clone(duck);
  tooManyTotalPoints.primitives = Array.from({ length: 5 }, () => ({
    type: "polygon",
    points: Array.from({ length: 205 }, () => [1, 1]),
    fill: "yellow"
  }));
  cases.push([tooManyTotalPoints, "primitives"]);
  const wideStroke = {
    id: "wide-stroke",
    viewBox: [-100, -100, 200, 200],
    colors: { ink: "#000000" },
    primitives: [{ type: "line", x1: 0, y1: 0, x2: 1, y2: 1, stroke: "ink", strokeWidth: MAX_STROKE_WIDTH + 1 }]
  };
  cases.push([wideStroke, "primitives[0].strokeWidth"]);
  const tinyRadius = clone(duck);
  tinyRadius.primitives[3].r = 0.0000001;
  cases.push([tinyRadius, "primitives[3].r"]);
  const tinyStroke = {
    id: "tiny-stroke",
    viewBox: [0, 0, 6, 4],
    colors: { ink: "#000000" },
    primitives: [{ type: "line", x1: 1, y1: 1, x2: 2, y2: 2, stroke: "ink", strokeWidth: 0.0000001 }]
  };
  cases.push([tinyStroke, "primitives[0].strokeWidth"]);
  const longId = clone(duck);
  longId.id = `a${"b".repeat(MAX_TOKEN_LENGTH)}`;
  cases.push([longId, "id"]);
  const longColor = clone(duck);
  longColor.colors[`c${"d".repeat(MAX_TOKEN_LENGTH)}`] = "#000000";
  cases.push([longColor, `colors.c${"d".repeat(MAX_TOKEN_LENGTH)}`]);

  for (const [vector, expectedPath] of cases) {
    assert.equal(validateVector(vector).some((item) => item.path === expectedPath), true, expectedPath);
    assert.throws(() => renderSvg(vector), /Invalid vector:/);
    assert.throws(() => renderTikz(vector), /Invalid vector:/);
  }
});

test("invalid viewBox data does not suppress independent primitive schema errors", () => {
  const vector = clone(duck);
  vector.viewBox = [0, 0, -1, 4];
  vector.primitives[0] = { type: "path", d: "M0 0", fill: "yellow" };
  const paths = validateVector(vector).map((item) => item.path);

  assert.equal(paths.includes("viewBox"), true);
  assert.equal(paths.includes("primitives[0].type"), true);
  assert.equal(paths.includes("primitives[0].d"), true);
});

test("number formatting is bounded decimal text without exponent or floating noise", () => {
  assert.equal(formatNumber(0.1 + 0.2), "0.3");
  assert.equal(formatNumber(-0), "0");
  assert.equal(formatNumber(0.0000014), "0.000001");
  const vector = clone(duck);
  vector.primitives[3].cx = 0.1 + 0.2;
  const output = `${renderSvg(vector)}\n${renderTikz(vector)}`;
  assert.match(output, /0\.3/);
  assert.doesNotMatch(output, /(?:NaN|Infinity|(?:^|[^A-Za-z0-9])[-+]?\d+(?:\.\d+)?[eE][+-]?\d+(?=$|[^A-Za-z0-9]))/);
});

test("TikZ color identifiers are injective and preserve SVG color parity", () => {
  const vector = {
    id: "case-logo",
    viewBox: [0, 0, 2, 1],
    colors: { red: "#AA0000", Red: "#00AA00" },
    primitives: [
      { type: "circle", cx: 0.5, cy: 0.5, r: 0.25, fill: "red" },
      { type: "circle", cx: 1.5, cy: 0.5, r: 0.25, fill: "Red" }
    ]
  };
  const svg = renderSvg(vector);
  const tikz = renderTikz(vector);

  assert.match(svg, /fill="#AA0000"/);
  assert.match(svg, /fill="#00AA00"/);
  const definitions = [...tikz.matchAll(/\\definecolor\{([^}]+)\}\{HTML\}\{(AA0000|00AA00)\}/g)];
  assert.equal(definitions.length, 2);
  assert.notEqual(definitions[0][1], definitions[1][1]);
  assert.match(tikz, new RegExp(`\\\\fill\\[${definitions[0][1]}\\]`));
  assert.match(tikz, new RegExp(`\\\\fill\\[${definitions[1][1]}\\]`));
});
