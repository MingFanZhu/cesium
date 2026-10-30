import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, URL } from "node:url";
import { getDistributionSymbols } from "./distribution-symbols.mjs";

const root = fileURLToPath(
  new URL("../../Build/SceneGIS/Documentation/", import.meta.url),
);
const metadata = JSON.parse(
  await readFile(path.join(root, "api-doclets.json"), "utf8"),
);
const index = JSON.parse(
  await readFile(path.join(root, "api-index.json"), "utf8"),
);

test(`source-derived metadata retains native, Widgets and every public SceneGIS root`, async () => {
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.namespace, "SceneGIS");
  assert.equal(metadata.version, index.version);
  const lookup = new Map(metadata.doclets.map((doclet) => [doclet.id, doclet]));
  const exports = await getDistributionSymbols();
  const documented = new Set(
    metadata.doclets
      .filter((doclet) => !doclet.memberof)
      .map((doclet) => doclet.exportName),
  );
  for (const name of exports.names) {
    if (/^SceneGIS/.test(name)) {
      assert.ok(documented.has(name), `extension ${name}`);
    }
  }
  for (const name of [
    "Scene",
    "Viewer",
    "ImageryLayer",
    "I3SLayer",
    "Panorama",
    "VERSION",
    "CesiumWidget",
    "Cesium3DTileset",
    "Cartesian3",
    "VoxelPrimitive",
  ]) {
    assert.ok(lookup.has(name), name);
  }
  assert.ok(lookup.get("Viewer").params.length);
  assert.ok(lookup.get("Scene#preRender").type.names.includes("Event"));
  assert.ok(lookup.get("Event#addEventListener").returns.length);
  assert.ok(
    metadata.doclets.some(
      (doclet) => doclet.kind === "typedef" && doclet.properties?.length,
    ),
  );
  assert.ok(metadata.doclets.some((doclet) => doclet.augments?.length));
  assert.ok(metadata.doclets.some((doclet) => doclet.isEnum));
  assert.ok(metadata.doclets.some((doclet) => doclet.isInternalConstructor));
  assert.ok(metadata.doclets.some((doclet) => doclet.performance?.length));
  assert.ok(metadata.doclets.some((doclet) => doclet.experimental?.length));
  assert.ok(metadata.doclets.some((doclet) => doclet.demo?.length));
  assert.ok(metadata.doclets.some((doclet) => doclet.optional));
  const alias = lookup.get("I3sBslExplorerViewModel");
  assert.equal(lookup.get("binarySearchComparator").exportName, undefined);
  assert.equal(alias.exportName, "I3SBuildingSceneLayerExplorerViewModel");
  assert.equal(
    alias.displayName,
    "SceneGIS.I3SBuildingSceneLayerExplorerViewModel",
  );
  assert.ok(
    lookup
      .get("Viewer")
      .examples.every((example) => !/\bCesium\./.test(example)),
  );
});

test(`doclets contain semantic fields without AST, private entries or machine paths`, () => {
  for (const doclet of metadata.doclets) {
    assert.equal(doclet.id, doclet.longname);
    assert.notEqual(doclet.access, "private", doclet.id);
    assert.equal(doclet.undocumented, undefined, doclet.id);
    assert.equal(doclet.comment, undefined);
    assert.equal(doclet.meta?.code, undefined);
    assert.equal(doclet.meta?.path, undefined);
    assert.equal(doclet.___id, undefined);
    assert.ok(doclet.displayName.startsWith("SceneGIS."));
    if (doclet.meta) {
      assert.ok(
        /^packages\/(engine|widgets)\/Source\//.test(doclet.meta.filename),
        doclet.meta.filename,
      );
    }
  }
});

test(`every metadata page and anchor exists and the search index preserves canonical identities`, async () => {
  const pages = new Map();
  const failures = [];
  assert.equal(
    new Set(index.symbols.map((symbol) => symbol.id)).size,
    index.symbols.length,
  );
  for (const symbol of index.symbols) {
    assert.ok(symbol.url, symbol.id);
    const [filename, hash] = symbol.url.split("#");
    if (!pages.has(filename)) {
      try {
        pages.set(filename, await readFile(path.join(root, filename), "utf8"));
      } catch {
        pages.set(filename, "");
      }
    }
    const page = pages.get(filename);
    if (!page || (hash && !page.includes(`id="${decodeURIComponent(hash)}"`))) {
      failures.push(`${symbol.id}: ${symbol.url}`);
    }
  }
  assert.deepEqual(failures, []);
  const viewer = pages.get("Viewer.html");
  assert.match(viewer, /SceneGIS API (?:Documentation|文档)/);
  assert.match(viewer, /SceneGIS\.Viewer/);
  assert.match(viewer, /href="Scene\.html"/);
});
