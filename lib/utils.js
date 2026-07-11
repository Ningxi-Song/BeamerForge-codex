"use strict";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clampByte(value) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(255, n));
}

function hexToRgb(hex) {
  const s = String(hex || "").trim();
  if (!s) return null;
  let normalized = s.startsWith("#") ? s : `#${s}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(normalized)) {
    normalized = `#${normalized.slice(1).split("").map((c) => c + c).join("")}`;
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((c) => clampByte(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function hexWithoutHash(hex) {
  return String(hex).replace(/^#/, "").toUpperCase();
}

function rgbToHsl(r, g, b) {
  const nr = clampByte(r) / 255;
  const ng = clampByte(g) / 255;
  const nb = clampByte(b) / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === nr) h = (ng - nb) / d + (ng < nb ? 6 : 0);
  else if (max === ng) h = (nb - nr) / d + 2;
  else h = (nr - ng) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lit = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lit - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function luminance(r, g, b) {
  return (0.2126 * clampByte(r) + 0.7152 * clampByte(g) + 0.0722 * clampByte(b)) / 255;
}

function textColorForBg(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#111827";
  return luminance(rgb.r, rgb.g, rgb.b) > 0.56 ? "#111827" : "#FFFFFF";
}

function normalizeLatexNewlines(snippet) {
  return String(snippet || "").replace(/\\n/g, "\n");
}

function joinNonEmpty(parts) {
  return parts.filter(Boolean).join("\n");
}

module.exports = {
  HEX_COLOR_RE,
  SLUG_RE,
  clone,
  isPlainObject,
  slugify,
  clampByte,
  hexToRgb,
  rgbToHex,
  hexWithoutHash,
  rgbToHsl,
  hslToRgb,
  luminance,
  textColorForBg,
  normalizeLatexNewlines,
  joinNonEmpty,
};
