"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_TEXT_CHARS,
  buildReferenceContext
} = require("../workbench/ai/reference-context");

test("Beamer source files become bounded, labeled text context", () => {
  const context = buildReferenceContext([
    { relativePath: "slides/main.tex", bytes: Buffer.from("\\documentclass{beamer}\u0000") },
    { relativePath: "theme.sty", bytes: Buffer.from("\\ProvidesPackage{theme}") },
    { relativePath: "talk.cls", bytes: Buffer.from("\\NeedsTeXFormat{LaTeX2e}") },
    { relativePath: "refs.bib", bytes: Buffer.from("@article{x}") }
  ], { imageInput: false });

  assert.match(context.text, /--- slides\/main\.tex ---/);
  assert.match(context.text, /--- theme\.sty ---/);
  assert.match(context.text, /--- talk\.cls ---/);
  assert.match(context.text, /--- refs\.bib ---/);
  assert.equal(context.text.includes("\u0000"), false);
  assert.deepEqual(context.images, []);
});

test("supported images become data blocks only for image-capable providers", () => {
  const context = buildReferenceContext([
    { relativePath: "mood.png", bytes: Buffer.from("png") },
    { relativePath: "photo.jpeg", bytes: Buffer.from("jpeg") },
    { relativePath: "layout.webp", bytes: Buffer.from("webp") }
  ], { imageInput: true });

  assert.deepEqual(context.images, [
    { type: "image_url", image_url: { url: "data:image/png;base64,cG5n" } },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,anBlZw==" } },
    { type: "image_url", image_url: { url: "data:image/webp;base64,d2VicA==" } }
  ]);
});

test("text-only providers reject image references", () => {
  assert.throws(
    () => buildReferenceContext([
      { relativePath: "mood.png", bytes: Buffer.from("png") }
    ], { imageInput: false }),
    (error) => error.statusCode === 400 && error.code === "image_not_supported"
  );
});

test("PDF and SVG references remain available only through Advanced handoff", () => {
  for (const relativePath of ["slides.pdf", "logo.svg"]) {
    assert.throws(
      () => buildReferenceContext([
        { relativePath, bytes: Buffer.from("reference") }
      ], { imageInput: true }),
      (error) => error.statusCode === 400 && /Advanced handoff/.test(error.message)
    );
  }
});

test("source text has a request-specific aggregate character ceiling", () => {
  assert.throws(
    () => buildReferenceContext([
      { relativePath: "one.tex", bytes: Buffer.alloc(MAX_TEXT_CHARS, 97) },
      { relativePath: "two.tex", bytes: Buffer.from("b") }
    ], {}),
    (error) => error.statusCode === 413 && /too large/.test(error.message)
  );
});

test("shared validation rejects traversal, duplicate paths, and aggregate byte overflow", () => {
  assert.throws(
    () => buildReferenceContext([
      { relativePath: "../unsafe.tex", bytes: Buffer.from("x") }
    ], {}),
    /Unsafe reference path/
  );
  assert.throws(
    () => buildReferenceContext([
      { relativePath: "A.tex", bytes: Buffer.from("x") },
      { relativePath: "a.tex", bytes: Buffer.from("y") }
    ], {}),
    /Duplicate reference path/
  );

  const sharedTwentyMiB = Buffer.alloc(20 * 1024 * 1024);
  assert.throws(
    () => buildReferenceContext(
      Array.from({ length: 6 }, (_, index) => ({
        relativePath: `image-${index}.png`,
        bytes: sharedTwentyMiB
      })),
      { imageInput: true }
    ),
    /100 MiB/
  );
});
