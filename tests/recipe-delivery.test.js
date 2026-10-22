const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const recipes = fs.readdirSync(path.join(root, "recipes"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const sections = ["Downloads", "Preview", "Inspiration", "Best For", "Elements", "Quick Start", "File Structure", "Customization"];

for (const slug of recipes) {
  test(`${slug} provides the standard complete recipe delivery`, () => {
    const dir = path.join(root, "recipes", slug);
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    assert.deepEqual([...readme.matchAll(/^## (.+)$/gm)].slice(0, sections.length).map((m) => m[1].trim()), sections);
    assert.ok(readme.includes("[View full PDF](main.pdf)"));
    assert.ok(readme.includes("[Download full PDF](main.pdf?raw=true)"));
    assert.ok(readme.includes("[Browse source files](./)"));
    assert.match(readme, /!\[[^\]]+\]\(preview-contact-sheet\.png\)/);
    assert.ok(fs.statSync(path.join(dir, "preview-contact-sheet.png")).size > 0);
    const pdf = fs.readFileSync(path.join(dir, "main.pdf"));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const ignored = execFileSync("git", ["check-ignore", "--no-index", "--non-matching", "--verbose", `recipes/${slug}/main.pdf`], { cwd: root, encoding: "utf8" });
    assert.match(ignored, /!.*main\.pdf/, "The published PDF must be exempt from build-output ignores");
    const index = fs.readFileSync(path.join(root, "README.md"), "utf8");
    assert.ok(index.includes(`(recipes/${slug}/main.pdf?raw=true)`), "Index must link directly to each full PDF");
  });
}
