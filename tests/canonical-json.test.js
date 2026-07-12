"use strict";

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
  assert.match(second, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});
