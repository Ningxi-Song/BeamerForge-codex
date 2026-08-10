const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkbenchServer } = require("../workbench/server");

function temporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function withServer(t) {
  const rootDir = temporaryDirectory("beamerforge-server-");
  const publicDir = path.join(rootDir, "public");
  const recipesDir = path.join(rootDir, "recipes");
  fs.mkdirSync(publicDir);
  fs.mkdirSync(recipesDir);
  fs.writeFileSync(path.join(publicDir, "index.html"), "<!doctype html><main id=\"catalog\"></main>", "utf8");
  fs.writeFileSync(path.join(publicDir, "app.js"), "fetch('/api/recipes');", "utf8");
  fs.writeFileSync(path.join(publicDir, "styles.css"), "body { color: black; }", "utf8");
  const recipeDir = path.join(recipesDir, "demo");
  fs.mkdirSync(recipeDir);
  fs.writeFileSync(path.join(recipeDir, "README.md"), "# Demo\n\nAn introduction.", "utf8");
  fs.writeFileSync(path.join(recipeDir, "main.pdf"), "%PDF-demo", "utf8");
  fs.writeFileSync(path.join(recipeDir, "page01.png"), "png-demo", "utf8");
  const server = createWorkbenchServer({ rootDir, publicDir, recipesDir });
  const port = await listen(server);
  t.after(() => close(server));
  return `http://127.0.0.1:${port}`;
}

test("serves the catalog shell and recipe APIs", async (t) => {
  const baseUrl = await withServer(t);
  const index = await fetch(`${baseUrl}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /id="catalog"/);

  const list = await fetch(`${baseUrl}/api/recipes`);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), [{
    slug: "demo",
    title: "Demo",
    readme: "# Demo\n\nAn introduction.",
    pdf: "main.pdf",
    images: ["page01.png"]
  }]);

  const detail = await fetch(`${baseUrl}/api/recipes/demo`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).title, "Demo");
});

test("serves recipe previews and rejects missing or unsafe paths", async (t) => {
  const baseUrl = await withServer(t);
  const pdf = await fetch(`${baseUrl}/recipes/demo/main.pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");

  const image = await fetch(`${baseUrl}/recipes/demo/page01.png`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal(await image.text(), "png-demo");

  assert.equal((await fetch(`${baseUrl}/api/recipes/missing`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/recipes/demo/../package.json`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/recipes/demo/README.md`)).status, 404);
});

test("does not expose authoring or write APIs", async (t) => {
  const baseUrl = await withServer(t);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await fetch(`${baseUrl}/api/theme`, { method });
    assert.ok([404, 405].includes(response.status), `${method} unexpectedly enabled`);
  }
  assert.equal((await fetch(`${baseUrl}/api/compile`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/unknown`)).status, 404);
});
