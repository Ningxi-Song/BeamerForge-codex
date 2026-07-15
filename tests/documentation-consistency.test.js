const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getRegistry } = require('../registry/options');

const root = path.resolve(__dirname, '..');
const currentDocs = ['README.md', 'WORKFLOW.md', 'ARCHITECTURE.md'];
const canonicalStages = [
  'Welcome',
  'Direction',
  'Style',
  'Details',
  'Review',
  'Optional AI refinement',
  'Build',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertStagesInOrder(content, file) {
  let previous = -1;
  for (const stage of canonicalStages) {
    const index = content.indexOf(stage, previous + 1);
    assert.notEqual(index, -1, `${file} is missing workflow stage: ${stage}`);
    assert.ok(index > previous, `${file} has workflow stages out of order at: ${stage}`);
    previous = index;
  }
}

function localMarkdownTargets(content) {
  return [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter((target) => !/^(?:https?:|mailto:|#)/i.test(target))
    .map((target) => target.split('#')[0]);
}

function jsonBlocks(content) {
  return [...content.matchAll(/```json\s*([\s\S]*?)```/g)]
    .map((match) => JSON.parse(match[1]));
}

test('README and WORKFLOW present the canonical workflow in order', () => {
  assertStagesInOrder(read('README.md'), 'README.md');
  assertStagesInOrder(read('WORKFLOW.md'), 'WORKFLOW.md');
});

test('current-facing documentation has no legacy paths or broken local links', () => {
  const forbidden = ['templates/', 'CONTRIBUTING.md', 'elements/typography/', 'typography/sans-serif-modern', 'layout/16-9-single'];

  for (const file of currentDocs) {
    const content = read(file);
    for (const fragment of forbidden) {
      assert.equal(content.includes(fragment), false, `${file} still references ${fragment}`);
    }
    for (const target of localMarkdownTargets(content)) {
      const resolved = path.resolve(root, path.dirname(file), target);
      assert.equal(fs.existsSync(resolved), true, `${file} links to missing ${target}`);
    }
  }
});

test('documented theme JSON uses current registry identifiers', () => {
  const registry = getRegistry();
  const blocks = currentDocs.flatMap((file) => jsonBlocks(read(file)));
  assert.ok(blocks.length > 0, 'current documentation needs at least one theme JSON example');

  for (const example of blocks) {
    if (example.colors?.paletteId) assert.ok(registry.palettes[example.colors.paletteId], `unknown palette ${example.colors.paletteId}`);
    if (example.fonts?.body) assert.ok(registry.fonts[example.fonts.body], `unknown body font ${example.fonts.body}`);
    if (example.fonts?.title) assert.ok(registry.fonts[example.fonts.title], `unknown title font ${example.fonts.title}`);
    if (example.bullets?.style) assert.ok(registry.bullets[example.bullets.style], `unknown bullet ${example.bullets.style}`);
    if (example.blocks?.style) assert.ok(registry.blocks[example.blocks.style], `unknown block ${example.blocks.style}`);
    if (example.navigation?.style) assert.ok(registry.navigation[example.navigation.style], `unknown navigation ${example.navigation.style}`);
    if (example.titlePage?.layout) assert.ok(registry.titlePages[example.titlePage.layout], `unknown title page ${example.titlePage.layout}`);
  }
});

test('README retains branding and links to canonical documentation', () => {
  const readme = read('README.md');
  assert.match(readme, /assets\/branding\/beamerforge-logo\.svg/);
  assert.match(readme, /\[Workflow\]\(WORKFLOW\.md\)/);
  assert.match(readme, /\[Architecture\]\(ARCHITECTURE\.md\)/);
  assert.match(readme, /\[Design review guide\]\(GUIDE\.md\)/);
});

test('architecture names the implemented module boundaries', () => {
  const architecture = read('ARCHITECTURE.md');
  for (const modulePath of [
    'registry/options.js',
    'schema/theme-schema.js',
    'design/resolve-design.js',
    'workbench/public/',
    'workbench/server.js',
    'workbench/ai/',
    'generators/',
    'workbench/build.js',
  ]) {
    const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(architecture, new RegExp(escaped));
  }
});
