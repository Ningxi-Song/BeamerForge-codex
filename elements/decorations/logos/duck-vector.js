"use strict";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

module.exports = deepFreeze({
  id: "duck",
  viewBox: [0, 0, 6, 4],
  colors: {
    yellow: "#F4B942",
    orange: "#E67E22",
    black: "#17202A",
    wing: "#D99B2B"
  },
  primitives: [
    { type: "ellipse", cx: 2.3, cy: 2.5, rx: 2.3, ry: 1.25, fill: "yellow" },
    { type: "circle", cx: 3.85, cy: 1.45, r: 0.9, fill: "yellow" },
    { type: "polygon", points: [[4.5, 1.35], [5.55, 1.6], [4.5, 1.85]], fill: "orange" },
    { type: "circle", cx: 4.1, cy: 1.2, r: 0.11, fill: "black" },
    { type: "ellipse", cx: 1.2, cy: 2.35, rx: 1.15, ry: 0.62, fill: "wing" }
  ]
});
