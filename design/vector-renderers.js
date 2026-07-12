"use strict";

const SAFE_TOKEN = /^[A-Za-z][A-Za-z0-9-]*$/;
const SAFE_COLOR_NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const MAX_ABS_COORD = 10000;
const MAX_VIEWBOX_DIM = 10000;
const MAX_COLORS = 32;
const MAX_PRIMITIVES = 128;
const MAX_POLYGON_POINTS = 256;
const MAX_TOTAL_POINTS = 1024;
const MAX_STROKE_WIDTH = 100;
const MAX_TOKEN_LENGTH = 64;
const FORMAT_DECIMAL_PLACES = 6;
const LOGO_TARGET_WIDTHS_CM = Object.freeze({ small: 0.8, medium: 1.2 });
const MIN_TIKZ_SCALE = 0.000001;
const MAX_TIKZ_SCALE = 10000;
// TeX's absolute dimension limit is about 575.8cm; retain headroom for PGF operations.
const TEX_SAFE_DIMENSION_CM = 500;
const TOP_FIELDS = ["id", "viewBox", "colors", "primitives"];
const PRIMITIVE_FIELDS = {
  ellipse: ["type", "cx", "cy", "rx", "ry", "fill"],
  circle: ["type", "cx", "cy", "r", "fill"],
  polygon: ["type", "points", "fill"],
  line: ["type", "x1", "y1", "x2", "y2", "stroke", "strokeWidth"]
};

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function error(path, message) {
  return { path, message };
}

function rejectExtraFields(value, allowed, path, errors) {
  if (!isPlainObject(value)) return;
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value).filter((key) => !allowedSet.has(key)).sort()) {
    errors.push(error(path ? `${path}.${key}` : key, "is not allowed"));
  }
}

function requireFields(value, required, path, errors) {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      errors.push(error(path ? `${path}.${key}` : key, "is required"));
    }
  }
}

function finiteNumber(value, path, errors) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(error(path, "must be a finite number"));
    return false;
  }
  return true;
}

function boundedNumber(value, path, errors, maximum = MAX_ABS_COORD) {
  if (!finiteNumber(value, path, errors)) return false;
  if (Math.abs(value) > maximum) {
    errors.push(error(path, `absolute value must be at most ${maximum}`));
    return false;
  }
  return true;
}

function roundedNumber(value) {
  return Number(value.toFixed(FORMAT_DECIMAL_PLACES));
}

function inside(value, minimum, maximum) {
  return value >= minimum && value <= maximum;
}

function validatePaint(value, colors, path, errors) {
  if (typeof value !== "string" || !Object.hasOwn(colors, value)) {
    errors.push(error(path, "must name a declared color"));
  }
}

function validatePrimitive(primitive, index, colors, bounds, errors) {
  const path = `primitives[${index}]`;
  if (!isPlainObject(primitive)) {
    errors.push(error(path, "must be a plain object"));
    return;
  }
  const fields = PRIMITIVE_FIELDS[primitive.type];
  if (!fields) {
    errors.push(error(`${path}.type`, "must be ellipse, circle, polygon, or line"));
    rejectExtraFields(primitive, ["type"], path, errors);
    return;
  }
  rejectExtraFields(primitive, fields, path, errors);
  requireFields(primitive, fields, path, errors);
  const [minX, minY, maxX, maxY] = bounds || [null, null, null, null];

  if (primitive.type === "ellipse") {
    const cx = boundedNumber(primitive.cx, `${path}.cx`, errors);
    const cy = boundedNumber(primitive.cy, `${path}.cy`, errors);
    const rx = boundedNumber(primitive.rx, `${path}.rx`, errors);
    const ry = boundedNumber(primitive.ry, `${path}.ry`, errors);
    if (rx && roundedNumber(primitive.rx) <= 0) errors.push(error(`${path}.rx`, "must remain greater than zero at six decimals"));
    if (ry && roundedNumber(primitive.ry) <= 0) errors.push(error(`${path}.ry`, "must remain greater than zero at six decimals"));
    const renderedCx = cx ? roundedNumber(primitive.cx) : null;
    const renderedCy = cy ? roundedNumber(primitive.cy) : null;
    const renderedRx = rx ? roundedNumber(primitive.rx) : null;
    const renderedRy = ry ? roundedNumber(primitive.ry) : null;
    if (bounds && cx && rx && renderedRx > 0 && (!inside(renderedCx - renderedRx, minX, maxX) || !inside(renderedCx + renderedRx, minX, maxX))) {
      errors.push(error(`${path}.rx`, "must keep the ellipse inside the viewBox"));
    }
    if (bounds && cy && ry && renderedRy > 0 && (!inside(renderedCy - renderedRy, minY, maxY) || !inside(renderedCy + renderedRy, minY, maxY))) {
      errors.push(error(`${path}.ry`, "must keep the ellipse inside the viewBox"));
    }
    validatePaint(primitive.fill, colors, `${path}.fill`, errors);
    return;
  }

  if (primitive.type === "circle") {
    const cx = boundedNumber(primitive.cx, `${path}.cx`, errors);
    const cy = boundedNumber(primitive.cy, `${path}.cy`, errors);
    const radius = boundedNumber(primitive.r, `${path}.r`, errors);
    if (radius && roundedNumber(primitive.r) <= 0) errors.push(error(`${path}.r`, "must remain greater than zero at six decimals"));
    const renderedCx = cx ? roundedNumber(primitive.cx) : null;
    const renderedCy = cy ? roundedNumber(primitive.cy) : null;
    const renderedRadius = radius ? roundedNumber(primitive.r) : null;
    if (bounds && cx && cy && radius && renderedRadius > 0 && (
      !inside(renderedCx - renderedRadius, minX, maxX)
      || !inside(renderedCx + renderedRadius, minX, maxX)
      || !inside(renderedCy - renderedRadius, minY, maxY)
      || !inside(renderedCy + renderedRadius, minY, maxY)
    )) errors.push(error(`${path}.r`, "must keep the circle inside the viewBox"));
    validatePaint(primitive.fill, colors, `${path}.fill`, errors);
    return;
  }

  if (primitive.type === "polygon") {
    if (!Array.isArray(primitive.points) || primitive.points.length < 3) {
      errors.push(error(`${path}.points`, "must contain at least three coordinate pairs"));
    } else {
      if (primitive.points.length > MAX_POLYGON_POINTS) {
        errors.push(error(`${path}.points`, `must contain at most ${MAX_POLYGON_POINTS} coordinate pairs`));
      }
      primitive.points.slice(0, MAX_POLYGON_POINTS).forEach((point, pointIndex) => {
        const pointPath = `${path}.points[${pointIndex}]`;
        if (!Array.isArray(point) || point.length !== 2) {
          errors.push(error(pointPath, "must be a coordinate pair"));
          return;
        }
        point.forEach((coordinate, coordinateIndex) => {
          const coordinatePath = `${pointPath}[${coordinateIndex}]`;
          if (!boundedNumber(coordinate, coordinatePath, errors)) return;
          if (!bounds) return;
          const minimum = coordinateIndex === 0 ? minX : minY;
          const maximum = coordinateIndex === 0 ? maxX : maxY;
          if (!inside(roundedNumber(coordinate), minimum, maximum)) errors.push(error(coordinatePath, "must be inside the viewBox"));
        });
      });
    }
    validatePaint(primitive.fill, colors, `${path}.fill`, errors);
    return;
  }

  const coordinateValidity = new Map();
  for (const [field, minimum, maximum] of [
    ["x1", minX, maxX], ["y1", minY, maxY], ["x2", minX, maxX], ["y2", minY, maxY]
  ]) {
    const valid = boundedNumber(primitive[field], `${path}.${field}`, errors);
    coordinateValidity.set(field, valid);
    if (bounds && valid && !inside(roundedNumber(primitive[field]), minimum, maximum)) {
      errors.push(error(`${path}.${field}`, "must be inside the viewBox"));
    }
  }
  const strokeValid = boundedNumber(primitive.strokeWidth, `${path}.strokeWidth`, errors, MAX_STROKE_WIDTH);
  if (strokeValid && roundedNumber(primitive.strokeWidth) <= 0) {
    errors.push(error(`${path}.strokeWidth`, "must remain greater than zero at six decimals"));
  }
  if (bounds && strokeValid && roundedNumber(primitive.strokeWidth) > 0) {
    const halfStroke = roundedNumber(primitive.strokeWidth) / 2;
    for (const [field, minimum, maximum] of [
      ["x1", minX, maxX], ["y1", minY, maxY], ["x2", minX, maxX], ["y2", minY, maxY]
    ]) {
      if (coordinateValidity.get(field)
        && !inside(roundedNumber(primitive[field]), minimum + halfStroke, maximum - halfStroke)) {
        errors.push(error(`${path}.${field}`, "must keep the stroke inside the viewBox"));
      }
    }
  }
  validatePaint(primitive.stroke, colors, `${path}.stroke`, errors);
}

function validateVector(vector) {
  const errors = [];
  if (!isPlainObject(vector)) return [error("", "must be a plain object")];
  rejectExtraFields(vector, TOP_FIELDS, "", errors);
  requireFields(vector, TOP_FIELDS, "", errors);

  if (typeof vector.id !== "string" || !SAFE_TOKEN.test(vector.id) || vector.id.length > MAX_TOKEN_LENGTH) {
    errors.push(error("id", `must be a safe token of at most ${MAX_TOKEN_LENGTH} characters`));
  }

  let bounds = null;
  if (!Array.isArray(vector.viewBox) || vector.viewBox.length !== 4) {
    errors.push(error("viewBox", "must contain four finite numbers"));
  } else {
    let valid = true;
    vector.viewBox.forEach((value, index) => {
      const maximum = index < 2 ? MAX_ABS_COORD : MAX_VIEWBOX_DIM;
      if (!boundedNumber(value, `viewBox[${index}]`, errors, maximum)) valid = false;
    });
    if (valid && (vector.viewBox[2] <= 0 || vector.viewBox[3] <= 0)) {
      errors.push(error("viewBox", "width and height must be greater than zero"));
      valid = false;
    }
    if (valid) {
      const renderedViewBox = vector.viewBox.map(roundedNumber);
      if (renderedViewBox[2] <= 0) {
        errors.push(error("viewBox[2]", "must remain greater than zero at six decimals"));
        valid = false;
      }
      if (renderedViewBox[3] <= 0) {
        errors.push(error("viewBox[3]", "must remain greater than zero at six decimals"));
        valid = false;
      }
      const maxX = renderedViewBox[0] + renderedViewBox[2];
      const maxY = renderedViewBox[1] + renderedViewBox[3];
      if (!Number.isFinite(maxX) || Math.abs(maxX) > MAX_ABS_COORD) {
        errors.push(error("viewBox[2]", `must keep the viewBox within ${MAX_ABS_COORD}`));
        valid = false;
      }
      if (!Number.isFinite(maxY) || Math.abs(maxY) > MAX_ABS_COORD) {
        errors.push(error("viewBox[3]", `must keep the viewBox within ${MAX_ABS_COORD}`));
        valid = false;
      }
      if (valid) bounds = [renderedViewBox[0], renderedViewBox[1], maxX, maxY];
    }
  }

  const colors = isPlainObject(vector.colors) ? vector.colors : {};
  if (!isPlainObject(vector.colors)) {
    errors.push(error("colors", "must be a plain object"));
  } else {
    const colorNames = Object.keys(colors).sort();
    if (colorNames.length > MAX_COLORS) {
      errors.push(error("colors", `must contain at most ${MAX_COLORS} entries`));
    }
    for (const name of colorNames.slice(0, MAX_COLORS)) {
      if (!SAFE_COLOR_NAME.test(name) || name.length > MAX_TOKEN_LENGTH) {
        errors.push(error(`colors.${name}`, `name must be a safe token of at most ${MAX_TOKEN_LENGTH} characters`));
      }
      if (typeof colors[name] !== "string" || !HEX_COLOR.test(colors[name])) {
        errors.push(error(`colors.${name}`, "must be a #RRGGBB color"));
      }
    }
  }

  if (!Array.isArray(vector.primitives) || vector.primitives.length === 0) {
    errors.push(error("primitives", "must be a non-empty array"));
  } else {
    if (vector.primitives.length > MAX_PRIMITIVES) {
      errors.push(error("primitives", `must contain at most ${MAX_PRIMITIVES} entries`));
    }
    let totalPoints = 0;
    vector.primitives.slice(0, MAX_PRIMITIVES).forEach((primitive, index) => {
      if (isPlainObject(primitive) && primitive.type === "polygon" && Array.isArray(primitive.points)) {
        totalPoints += primitive.points.length;
      }
      validatePrimitive(primitive, index, colors, bounds, errors);
    });
    if (totalPoints > MAX_TOTAL_POINTS) {
      errors.push(error("primitives", `must contain at most ${MAX_TOTAL_POINTS} total polygon points`));
    }
  }
  return errors;
}

function assertValidVector(vector) {
  const errors = validateVector(vector);
  if (errors.length) {
    throw new Error(`Invalid vector: ${errors.map((item) => `${item.path || "vector"}: ${item.message}`).join("; ")}`);
  }
  return vector;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) throw new Error("Cannot format a non-finite number");
  const rounded = roundedNumber(value);
  return Object.is(rounded, -0) || rounded === 0
    ? "0"
    : rounded.toFixed(FORMAT_DECIMAL_PLACES).replace(/\.?0+$/, "");
}

function isPositiveAtFormatPrecision(value) {
  return Number.isFinite(value) && value > 0 && formatNumber(value) !== "0";
}

function tikzScaleForTargetWidth(vector, targetWidth) {
  if (!vector || !Array.isArray(vector.viewBox) || typeof targetWidth !== "number"
    || !Number.isFinite(targetWidth) || targetWidth <= 0) {
    throw new Error("Cannot derive TikZ scale without a vector viewBox and positive target width");
  }
  return Number(formatNumber(targetWidth / vector.viewBox[2]));
}

function validateTikzRenderability(vector, options = {}) {
  const errors = [];
  if (!isPlainObject(options) || Object.keys(options).some((key) => key !== "strokeScale")) {
    return [error("strokeScale", "TikZ renderer options must contain only strokeScale")];
  }
  const strokeScale = options.strokeScale === undefined ? 1 : options.strokeScale;
  if (typeof strokeScale !== "number" || !Number.isFinite(strokeScale)) {
    return [error("strokeScale", "TikZ strokeScale must be a finite number")];
  }
  if (strokeScale < MIN_TIKZ_SCALE) {
    return [error("strokeScale", `TikZ strokeScale must be at least ${MIN_TIKZ_SCALE} at ${FORMAT_DECIMAL_PLACES}-decimal precision`)];
  }
  if (strokeScale > MAX_TIKZ_SCALE) {
    return [error("strokeScale", `TikZ strokeScale must be at most ${MAX_TIKZ_SCALE}`)];
  }

  const vectorErrors = validateVector(vector);
  if (vectorErrors.length) return vectorErrors;

  const seen = new Set();
  const add = (path, message) => {
    const key = `${path}\0${message}`;
    if (!seen.has(key)) {
      seen.add(key);
      errors.push(error(path, message));
    }
  };
  const checkDimension = (value, path, label = "coordinate") => {
    const serialized = Number(formatNumber(value));
    if (Math.abs(serialized) > TEX_SAFE_DIMENSION_CM) {
      add(path, `TikZ serialized ${label} must be at most ${TEX_SAFE_DIMENSION_CM}cm in magnitude`);
    }
    const transformed = Number(formatNumber(serialized * strokeScale));
    if (Math.abs(transformed) > TEX_SAFE_DIMENSION_CM) {
      add(path, `TikZ transformed ${label} must be at most ${TEX_SAFE_DIMENSION_CM}cm in magnitude`);
    }
  };

  const [x, y, width, height] = vector.viewBox.map(roundedNumber);
  checkDimension(x, "viewBox[0]");
  checkDimension(y, "viewBox[1]");
  checkDimension(x + width, "viewBox[2]");
  checkDimension(y + height, "viewBox[3]");
  const yShift = -(y * 2 + height);
  checkDimension(yShift, "viewBox[1]", "y-shift");

  vector.primitives.forEach((primitive, primitiveIndex) => {
    const base = `primitives[${primitiveIndex}]`;
    if (primitive.type === "ellipse") {
      for (const field of ["cx", "cy", "rx", "ry"]) checkDimension(primitive[field], `${base}.${field}`);
    } else if (primitive.type === "circle") {
      for (const field of ["cx", "cy", "r"]) checkDimension(primitive[field], `${base}.${field}`);
    } else if (primitive.type === "polygon") {
      primitive.points.forEach((point, pointIndex) => point.forEach((coordinate, coordinateIndex) => {
        checkDimension(coordinate, `${base}.points[${pointIndex}][${coordinateIndex}]`);
      }));
    } else {
      for (const field of ["x1", "y1", "x2", "y2"]) checkDimension(primitive[field], `${base}.${field}`);
      const scaledStroke = Number(formatNumber(primitive.strokeWidth * strokeScale));
      if (!isPositiveAtFormatPrecision(primitive.strokeWidth * strokeScale)) {
        add(`${base}.strokeWidth`, `TikZ scaled stroke width at ${base} must remain positive at ${FORMAT_DECIMAL_PLACES}-decimal precision`);
      } else if (scaledStroke > TEX_SAFE_DIMENSION_CM) {
        add(`${base}.strokeWidth`, `TikZ scaled stroke width must be at most ${TEX_SAFE_DIMENSION_CM}cm`);
      }
    }
  });
  return errors;
}

function validateLogoVectorRenderability(vector) {
  const vectorErrors = validateVector(vector);
  if (vectorErrors.length) return vectorErrors;
  const errors = [];
  for (const targetWidth of Object.values(LOGO_TARGET_WIDTHS_CM)) {
    const strokeScale = tikzScaleForTargetWidth(vector, targetWidth);
    for (const renderError of validateTikzRenderability(vector, { strokeScale })) {
      errors.push(error(
        renderError.path === "strokeScale" ? "viewBox[2]" : renderError.path,
        `target width ${formatNumber(targetWidth)}cm: ${renderError.message}`
      ));
    }
  }
  return errors;
}

function svgPrimitive(primitive, colors) {
  if (primitive.type === "ellipse") {
    return `<ellipse cx="${formatNumber(primitive.cx)}" cy="${formatNumber(primitive.cy)}" rx="${formatNumber(primitive.rx)}" ry="${formatNumber(primitive.ry)}" fill="${colors[primitive.fill]}"/>`;
  }
  if (primitive.type === "circle") {
    return `<circle cx="${formatNumber(primitive.cx)}" cy="${formatNumber(primitive.cy)}" r="${formatNumber(primitive.r)}" fill="${colors[primitive.fill]}"/>`;
  }
  if (primitive.type === "polygon") {
    const points = primitive.points.map(([x, y]) => `${formatNumber(x)},${formatNumber(y)}`).join(" ");
    return `<polygon points="${points}" fill="${colors[primitive.fill]}"/>`;
  }
  return `<line x1="${formatNumber(primitive.x1)}" y1="${formatNumber(primitive.y1)}" x2="${formatNumber(primitive.x2)}" y2="${formatNumber(primitive.y2)}" stroke="${colors[primitive.stroke]}" stroke-width="${formatNumber(primitive.strokeWidth)}"/>`;
}

function renderSvg(vector) {
  assertValidVector(vector);
  const viewBox = vector.viewBox.map(formatNumber).join(" ");
  const shapes = vector.primitives.map((primitive) => svgPrimitive(primitive, vector.colors)).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="${vector.id}-title">\n  <title id="${vector.id}-title">${vector.id} logo</title>\n  ${shapes}\n</svg>\n`;
}

function hexToken(value) {
  return [...value].map((character) => character.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

function tikzColorName(vectorId, colorName) {
  return `bfvI${hexToken(vectorId)}K${hexToken(colorName)}`;
}

function tikzPrimitive(primitive, vectorId, strokeScale) {
  if (primitive.type === "ellipse") {
    return `  \\fill[${tikzColorName(vectorId, primitive.fill)}] (${formatNumber(primitive.cx)},${formatNumber(primitive.cy)}) ellipse [x radius=${formatNumber(primitive.rx)},y radius=${formatNumber(primitive.ry)}];`;
  }
  if (primitive.type === "circle") {
    return `  \\fill[${tikzColorName(vectorId, primitive.fill)}] (${formatNumber(primitive.cx)},${formatNumber(primitive.cy)}) circle [radius=${formatNumber(primitive.r)}];`;
  }
  if (primitive.type === "polygon") {
    const points = primitive.points.map(([x, y]) => `(${formatNumber(x)},${formatNumber(y)})`).join(" -- ");
    return `  \\fill[${tikzColorName(vectorId, primitive.fill)}] ${points} -- cycle;`;
  }
  return `  \\draw[draw=${tikzColorName(vectorId, primitive.stroke)},line width=${formatNumber(primitive.strokeWidth * strokeScale)}cm] (${formatNumber(primitive.x1)},${formatNumber(primitive.y1)}) -- (${formatNumber(primitive.x2)},${formatNumber(primitive.y2)});`;
}

function renderTikz(vector, options = {}) {
  if (!isPlainObject(options) || Object.keys(options).some((key) => key !== "strokeScale")) {
    throw new Error("Invalid TikZ renderer options");
  }
  const strokeScale = options.strokeScale === undefined ? 1 : options.strokeScale;
  if (typeof strokeScale !== "number" || !Number.isFinite(strokeScale)
    || strokeScale <= 0 || strokeScale > MAX_TIKZ_SCALE) {
    throw new Error(`TikZ strokeScale must be greater than zero and at most ${MAX_TIKZ_SCALE}`);
  }
  assertValidVector(vector);
  const renderErrors = validateTikzRenderability(vector, { strokeScale });
  if (renderErrors.length) throw new Error(renderErrors.map((item) => item.message).join("; "));
  const colors = Object.entries(vector.colors).map(([name, hex]) => (
    `\\definecolor{${tikzColorName(vector.id, name)}}{HTML}{${hex.slice(1).toUpperCase()}}`
  ));
  const primitives = vector.primitives.map((primitive) => tikzPrimitive(primitive, vector.id, strokeScale));
  const [x, y, width, height] = vector.viewBox;
  const [renderedX, renderedY, renderedWidth, renderedHeight] = [x, y, width, height].map(roundedNumber);
  const yShift = -(renderedY * 2 + renderedHeight);
  const rectangle = `(${formatNumber(renderedX)},${formatNumber(renderedY)}) rectangle (${formatNumber(renderedX + renderedWidth)},${formatNumber(renderedY + renderedHeight)});`;
  const boundingBox = `  \\path[use as bounding box] ${rectangle}`;
  const clip = `  \\clip ${rectangle}`;
  return [...colors, `\\begin{scope}[yscale=-1,yshift=${formatNumber(yShift)}cm]`, boundingBox, clip, ...primitives, "\\end{scope}"].join("\n");
}

module.exports = {
  validateVector,
  assertValidVector,
  renderSvg,
  renderTikz,
  validateTikzRenderability,
  validateLogoVectorRenderability,
  tikzScaleForTargetWidth,
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
};
