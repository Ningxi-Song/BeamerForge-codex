"use strict";

const SAFE_TOKEN = /^[A-Za-z][A-Za-z0-9-]*$/;
const SAFE_COLOR_NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
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
  const [minX, minY, maxX, maxY] = bounds;

  if (primitive.type === "ellipse") {
    const cx = finiteNumber(primitive.cx, `${path}.cx`, errors);
    const cy = finiteNumber(primitive.cy, `${path}.cy`, errors);
    const rx = finiteNumber(primitive.rx, `${path}.rx`, errors);
    const ry = finiteNumber(primitive.ry, `${path}.ry`, errors);
    if (rx && primitive.rx <= 0) errors.push(error(`${path}.rx`, "must be greater than zero"));
    if (ry && primitive.ry <= 0) errors.push(error(`${path}.ry`, "must be greater than zero"));
    if (cx && rx && primitive.rx > 0 && (!inside(primitive.cx - primitive.rx, minX, maxX) || !inside(primitive.cx + primitive.rx, minX, maxX))) {
      errors.push(error(`${path}.rx`, "must keep the ellipse inside the viewBox"));
    }
    if (cy && ry && primitive.ry > 0 && (!inside(primitive.cy - primitive.ry, minY, maxY) || !inside(primitive.cy + primitive.ry, minY, maxY))) {
      errors.push(error(`${path}.ry`, "must keep the ellipse inside the viewBox"));
    }
    validatePaint(primitive.fill, colors, `${path}.fill`, errors);
    return;
  }

  if (primitive.type === "circle") {
    const cx = finiteNumber(primitive.cx, `${path}.cx`, errors);
    const cy = finiteNumber(primitive.cy, `${path}.cy`, errors);
    const radius = finiteNumber(primitive.r, `${path}.r`, errors);
    if (radius && primitive.r <= 0) errors.push(error(`${path}.r`, "must be greater than zero"));
    if (cx && cy && radius && primitive.r > 0 && (
      !inside(primitive.cx - primitive.r, minX, maxX)
      || !inside(primitive.cx + primitive.r, minX, maxX)
      || !inside(primitive.cy - primitive.r, minY, maxY)
      || !inside(primitive.cy + primitive.r, minY, maxY)
    )) errors.push(error(`${path}.r`, "must keep the circle inside the viewBox"));
    validatePaint(primitive.fill, colors, `${path}.fill`, errors);
    return;
  }

  if (primitive.type === "polygon") {
    if (!Array.isArray(primitive.points) || primitive.points.length < 3) {
      errors.push(error(`${path}.points`, "must contain at least three coordinate pairs"));
    } else {
      primitive.points.forEach((point, pointIndex) => {
        const pointPath = `${path}.points[${pointIndex}]`;
        if (!Array.isArray(point) || point.length !== 2) {
          errors.push(error(pointPath, "must be a coordinate pair"));
          return;
        }
        point.forEach((coordinate, coordinateIndex) => {
          const coordinatePath = `${pointPath}[${coordinateIndex}]`;
          if (!finiteNumber(coordinate, coordinatePath, errors)) return;
          const minimum = coordinateIndex === 0 ? minX : minY;
          const maximum = coordinateIndex === 0 ? maxX : maxY;
          if (!inside(coordinate, minimum, maximum)) errors.push(error(coordinatePath, "must be inside the viewBox"));
        });
      });
    }
    validatePaint(primitive.fill, colors, `${path}.fill`, errors);
    return;
  }

  for (const [field, minimum, maximum] of [
    ["x1", minX, maxX], ["y1", minY, maxY], ["x2", minX, maxX], ["y2", minY, maxY]
  ]) {
    if (finiteNumber(primitive[field], `${path}.${field}`, errors) && !inside(primitive[field], minimum, maximum)) {
      errors.push(error(`${path}.${field}`, "must be inside the viewBox"));
    }
  }
  if (finiteNumber(primitive.strokeWidth, `${path}.strokeWidth`, errors) && primitive.strokeWidth <= 0) {
    errors.push(error(`${path}.strokeWidth`, "must be greater than zero"));
  }
  validatePaint(primitive.stroke, colors, `${path}.stroke`, errors);
}

function validateVector(vector) {
  const errors = [];
  if (!isPlainObject(vector)) return [error("", "must be a plain object")];
  rejectExtraFields(vector, TOP_FIELDS, "", errors);
  requireFields(vector, TOP_FIELDS, "", errors);

  if (typeof vector.id !== "string" || !SAFE_TOKEN.test(vector.id)) {
    errors.push(error("id", "must be a safe token"));
  }

  let bounds = null;
  if (!Array.isArray(vector.viewBox) || vector.viewBox.length !== 4) {
    errors.push(error("viewBox", "must contain four finite numbers"));
  } else {
    let valid = true;
    vector.viewBox.forEach((value, index) => {
      if (!finiteNumber(value, `viewBox[${index}]`, errors)) valid = false;
    });
    if (valid && (vector.viewBox[2] <= 0 || vector.viewBox[3] <= 0)) {
      errors.push(error("viewBox", "width and height must be greater than zero"));
      valid = false;
    }
    if (valid) bounds = [
      vector.viewBox[0],
      vector.viewBox[1],
      vector.viewBox[0] + vector.viewBox[2],
      vector.viewBox[1] + vector.viewBox[3]
    ];
  }

  const colors = isPlainObject(vector.colors) ? vector.colors : {};
  if (!isPlainObject(vector.colors)) {
    errors.push(error("colors", "must be a plain object"));
  } else {
    for (const name of Object.keys(colors).sort()) {
      if (!SAFE_COLOR_NAME.test(name)) errors.push(error(`colors.${name}`, "name must be a safe token"));
      if (typeof colors[name] !== "string" || !HEX_COLOR.test(colors[name])) {
        errors.push(error(`colors.${name}`, "must be a #RRGGBB color"));
      }
    }
  }

  if (!Array.isArray(vector.primitives) || vector.primitives.length === 0) {
    errors.push(error("primitives", "must be a non-empty array"));
  } else if (bounds) {
    vector.primitives.forEach((primitive, index) => validatePrimitive(primitive, index, colors, bounds, errors));
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

function number(value) {
  return Object.is(value, -0) ? "0" : String(value);
}

function svgPrimitive(primitive, colors) {
  if (primitive.type === "ellipse") {
    return `<ellipse cx="${number(primitive.cx)}" cy="${number(primitive.cy)}" rx="${number(primitive.rx)}" ry="${number(primitive.ry)}" fill="${colors[primitive.fill]}"/>`;
  }
  if (primitive.type === "circle") {
    return `<circle cx="${number(primitive.cx)}" cy="${number(primitive.cy)}" r="${number(primitive.r)}" fill="${colors[primitive.fill]}"/>`;
  }
  if (primitive.type === "polygon") {
    const points = primitive.points.map(([x, y]) => `${number(x)},${number(y)}`).join(" ");
    return `<polygon points="${points}" fill="${colors[primitive.fill]}"/>`;
  }
  return `<line x1="${number(primitive.x1)}" y1="${number(primitive.y1)}" x2="${number(primitive.x2)}" y2="${number(primitive.y2)}" stroke="${colors[primitive.stroke]}" stroke-width="${number(primitive.strokeWidth)}"/>`;
}

function renderSvg(vector) {
  assertValidVector(vector);
  const viewBox = vector.viewBox.map(number).join(" ");
  const shapes = vector.primitives.map((primitive) => svgPrimitive(primitive, vector.colors)).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="${vector.id}-title">\n  <title id="${vector.id}-title">${vector.id} logo</title>\n  ${shapes}\n</svg>\n`;
}

function pascalToken(value) {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function tikzColorName(vectorId, colorName) {
  return `bfVector${pascalToken(vectorId)}${pascalToken(colorName)}`;
}

function tikzPrimitive(primitive, vectorId) {
  if (primitive.type === "ellipse") {
    return `  \\fill[${tikzColorName(vectorId, primitive.fill)}] (${number(primitive.cx)},${number(primitive.cy)}) ellipse [x radius=${number(primitive.rx)},y radius=${number(primitive.ry)}];`;
  }
  if (primitive.type === "circle") {
    return `  \\fill[${tikzColorName(vectorId, primitive.fill)}] (${number(primitive.cx)},${number(primitive.cy)}) circle [radius=${number(primitive.r)}];`;
  }
  if (primitive.type === "polygon") {
    const points = primitive.points.map(([x, y]) => `(${number(x)},${number(y)})`).join(" -- ");
    return `  \\fill[${tikzColorName(vectorId, primitive.fill)}] ${points} -- cycle;`;
  }
  return `  \\draw[draw=${tikzColorName(vectorId, primitive.stroke)},line width=${number(primitive.strokeWidth)}cm] (${number(primitive.x1)},${number(primitive.y1)}) -- (${number(primitive.x2)},${number(primitive.y2)});`;
}

function renderTikz(vector) {
  assertValidVector(vector);
  const colors = Object.entries(vector.colors).map(([name, hex]) => (
    `\\definecolor{${tikzColorName(vector.id, name)}}{HTML}{${hex.slice(1).toUpperCase()}}`
  ));
  const yShift = -(vector.viewBox[1] * 2 + vector.viewBox[3]);
  const primitives = vector.primitives.map((primitive) => tikzPrimitive(primitive, vector.id));
  const [x, y, width, height] = vector.viewBox;
  const boundingBox = `  \\path[use as bounding box] (${number(x)},${number(y)}) rectangle (${number(x + width)},${number(y + height)});`;
  return [...colors, `\\begin{scope}[yscale=-1,yshift=${number(yShift)}cm]`, boundingBox, ...primitives, "\\end{scope}"].join("\n");
}

module.exports = { validateVector, assertValidVector, renderSvg, renderTikz };
