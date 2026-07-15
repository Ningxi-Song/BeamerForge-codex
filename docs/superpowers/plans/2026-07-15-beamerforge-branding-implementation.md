# BeamerForge Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved transparent BeamerForge logo variants and replace the README opening with the approved centered cover and AI-era LaTeX introduction.

**Architecture:** Store self-contained, font-free SVG assets under `assets/branding/` and reference the light-background master directly from `README.md`. Add a focused Node test that treats the SVG structure, palette, transparency, README reference, and approved introduction as a branding contract.

**Tech Stack:** SVG 1.1-compatible XML, GitHub-flavored Markdown with safe HTML alignment, Node.js 20 built-in test runner.

---

## File Structure

- Create `assets/branding/beamerforge-logo.svg`: primary transparent slate-and-blue mark for light backgrounds.
- Create `assets/branding/beamerforge-logo-dark.svg`: transparent high-contrast variant for dark backgrounds.
- Create `assets/branding/beamerforge-logo-monochrome.svg`: single-color fallback.
- Create `assets/branding/README.md`: usage guidance, palette values, and minimum-size rule.
- Create `tests/branding-assets.test.js`: static branding contract tests.
- Modify `README.md`: centered logo cover, project name, tagline, and approved introduction.

### Task 1: Lock the SVG branding contract

**Files:**
- Create: `tests/branding-assets.test.js`

- [ ] **Step 1: Write the failing SVG asset tests**

Create `tests/branding-assets.test.js` with:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/branding-assets.test.js
```

Expected: three failures reporting that the SVG files are missing.

- [ ] **Step 3: Commit the failing contract test**

```powershell
git add tests/branding-assets.test.js
git commit -m "test: define BeamerForge branding contract"
```

### Task 2: Create the production SVG variants

**Files:**
- Create: `assets/branding/beamerforge-logo.svg`
- Create: `assets/branding/beamerforge-logo-dark.svg`
- Create: `assets/branding/beamerforge-logo-monochrome.svg`

- [ ] **Step 1: Create the primary light-background SVG**

Create `assets/branding/beamerforge-logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-labelledby="title desc">
  <title id="title">BeamerForge</title>
  <desc id="desc">A presentation screen paired with a forging hammer.</desc>
  <g fill="none" stroke="#303B48" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="24" y="40" width="76" height="52" rx="2"/>
    <path d="M62 96v20M42 120h40"/>
  </g>
  <path d="m90 28 22 14-15 23" fill="none" stroke="#5F8FBF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M92 124h36l-10 14H82z" fill="#5F8FBF"/>
</svg>
```

- [ ] **Step 2: Create the dark-background SVG**

Create `assets/branding/beamerforge-logo-dark.svg` with the same geometry and the approved contrast-adjusted colors:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-labelledby="title desc">
  <title id="title">BeamerForge</title>
  <desc id="desc">A presentation screen paired with a forging hammer.</desc>
  <g fill="none" stroke="#D7DDE5" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="24" y="40" width="76" height="52" rx="2"/>
    <path d="M62 96v20M42 120h40"/>
  </g>
  <path d="m90 28 22 14-15 23" fill="none" stroke="#79A7D3" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M92 124h36l-10 14H82z" fill="#79A7D3"/>
</svg>
```

- [ ] **Step 3: Create the monochrome SVG**

Create `assets/branding/beamerforge-logo-monochrome.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-labelledby="title desc">
  <title id="title">BeamerForge</title>
  <desc id="desc">A presentation screen paired with a forging hammer.</desc>
  <g fill="none" stroke="#303B48" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="24" y="40" width="76" height="52" rx="2"/>
    <path d="M62 96v20M42 120h40"/>
  </g>
  <path d="m90 28 22 14-15 23" fill="none" stroke="#303B48" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M92 124h36l-10 14H82z" fill="#303B48"/>
</svg>
```

- [ ] **Step 4: Run the SVG contract test**

Run:

```powershell
node --test tests/branding-assets.test.js
```

Expected: three passing tests.

- [ ] **Step 5: Commit the SVG assets**

```powershell
git add assets/branding/beamerforge-logo.svg assets/branding/beamerforge-logo-dark.svg assets/branding/beamerforge-logo-monochrome.svg
git commit -m "feat: add BeamerForge logo variants"
```

### Task 3: Add the README cover and branding usage guide

**Files:**
- Modify: `tests/branding-assets.test.js`
- Modify: `README.md:1-3`
- Create: `assets/branding/README.md`

- [ ] **Step 1: Add a failing README cover test**

Append to `tests/branding-assets.test.js`:

```js
test('README uses the approved BeamerForge cover treatment', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /<img src="assets\/branding\/beamerforge-logo\.svg" width="144"/);
  assert.match(readme, /<h1 align="center">BeamerForge<\/h1>/);
  assert.match(readme, /Craft distinctive, reproducible Beamer presentations/);
  assert.match(readme, /Turing-complete TeX language/);
  assert.match(readme, /versionable, composable, and portable/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/branding-assets.test.js
```

Expected: the three SVG tests pass and the README cover test fails because the logo reference is absent.

- [ ] **Step 3: Replace the opening of `README.md`**

Replace the current `# Beamer Design System` heading and its following description with:

```markdown
<p align="center">
  <img src="assets/branding/beamerforge-logo.svg" width="144" alt="BeamerForge logo">
</p>

<h1 align="center">BeamerForge</h1>

<p align="center">
  Craft distinctive, reproducible Beamer presentations with a visual design catalog and an AI-guided workflow.
</p>

BeamerForge turns presentation design into a structured, inspectable workflow. In the AI era, LaTeX's foundation in the Turing-complete TeX language is a genuine advantage: models can generate and transform plain-text source, humans can review every change, and mature compilers produce reproducible PDFs. Unlike opaque slide binaries, Beamer projects are versionable, composable, and portable. BeamerForge adds curated visual language and a guided path—from vibe to direction, palette, details, and complete template—so AI can design deliberately instead of improvising from scratch.
```

Leave the existing `## How It Works` section and all subsequent content in place.

- [ ] **Step 4: Create the branding usage guide**

Create `assets/branding/README.md`:

````markdown
# BeamerForge Branding

Use `beamerforge-logo.svg` on light backgrounds and `beamerforge-logo-dark.svg` on dark backgrounds. Use `beamerforge-logo-monochrome.svg` where only one color is available.

The master mark uses slate `#303B48` and academic blue `#5F8FBF`. Keep the SVG background transparent and display the mark at 32 × 32 pixels or larger.

```markdown
<img src="assets/branding/beamerforge-logo.svg" width="144" alt="BeamerForge logo">
```

Do not place the mark inside a badge, recolor individual parts, add text inside the SVG, or distort its aspect ratio.
````

When writing the nested Markdown example, use a four-backtick outer fence so the three-backtick example remains valid.

- [ ] **Step 5: Run the focused branding tests**

Run:

```powershell
node --test tests/branding-assets.test.js
```

Expected: four passing tests.

- [ ] **Step 6: Commit the README cover and usage guide**

```powershell
git add README.md assets/branding/README.md tests/branding-assets.test.js
git commit -m "docs: add BeamerForge README cover"
```

### Task 4: Verify the integrated branding change

**Files:**
- Verify: `assets/branding/*.svg`
- Verify: `README.md`
- Verify: `tests/branding-assets.test.js`

- [ ] **Step 1: Run the focused branding tests**

Run:

```powershell
node --test tests/branding-assets.test.js
```

Expected: four tests pass with zero failures.

- [ ] **Step 2: Run the complete repository test suite**

Run:

```powershell
npm test
```

Expected: all repository tests pass with zero failures.

- [ ] **Step 3: Run syntax checks**

Run:

```powershell
npm run check
```

Expected: exit code 0 and no JavaScript syntax errors.

- [ ] **Step 4: Inspect the README cover visually**

Open the repository README preview and confirm:

- the primary SVG renders with a transparent background;
- the mark remains recognizable at 32 px and looks balanced at 144 px;
- the cover is centered;
- the existing `How It Works` content begins immediately after the approved introduction;
- no existing README sections were removed.

- [ ] **Step 5: Confirm the worktree scope**

Run:

```powershell
git status --short
```

Expected: no branding files remain uncommitted; the pre-existing unrelated `patch-staging/` directory may remain untracked and must not be added.
