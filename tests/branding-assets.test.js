const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const brandingDir = path.join(root, 'assets', 'branding');
const variants = [
  {
    file: 'beamerforge-logo.svg',
    colors: ['#303B48', '#5F8FBF'],
  },
  {
    file: 'beamerforge-logo-dark.svg',
    colors: ['#D7DDE5', '#79A7D3'],
  },
  {
    file: 'beamerforge-logo-monochrome.svg',
    colors: ['#303B48'],
  },
];

for (const variant of variants) {
  test(`${variant.file} is a transparent, font-free SVG`, () => {
    const filePath = path.join(brandingDir, variant.file);
    assert.equal(fs.existsSync(filePath), true, `${variant.file} is missing`);

    const svg = fs.readFileSync(filePath, 'utf8');
    assert.match(svg, /<svg[^>]+viewBox="0 0 160 160"/);
    assert.doesNotMatch(svg, /<text\b|<style\b|font-family/i);
    assert.doesNotMatch(
      svg,
      /<rect[^>]+(?:width="160"[^>]+height="160"|width="100%")/i,
      'the logo must not contain a canvas-sized background rectangle',
    );

    for (const color of variant.colors) {
      assert.match(svg.toUpperCase(), new RegExp(color.toUpperCase()));
    }
  });
}

test('README uses the approved BeamerForge cover treatment', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /<img src="assets\/branding\/beamerforge-logo\.svg" width="144"/);
  assert.match(readme, /<h1 align="center">BeamerForge<\/h1>/);
  assert.match(readme, /Craft distinctive, reproducible Beamer presentations/);
  assert.match(readme, /Turing-complete TeX language/);
  assert.match(readme, /versionable, composable, and portable/);
});
