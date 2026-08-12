#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repo = path.resolve(process.cwd());
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "scenegis-package-smoke-"),
);
const publicEngine = [
  "SceneGISWorld",
  "SceneGISPlanarExtent",
  "SceneGISPlanarCoordinateSystem",
  "SceneGISPlanarTilingScheme",
  "SceneGISPlanarTerrainData",
  "SceneGISPlanarHeightmapTerrainData",
  "SceneGISPlanarQuantizedMeshTerrainData",
  "SceneGISPlanarTerrainProvider",
  "SceneGISPlanarTerrainSampler",
  "SceneGISPlanarUrlTemplateHeightmapTerrainProvider",
  "SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider",
  "SceneGISPlanarWorld",
  "SceneGISPlanarCameraController",
  "SceneGISPlanarImageryProvider",
  "SceneGISPlanarUrlTemplateImageryProvider",
  "SceneGISPlanarImageryLayer",
  "SceneGISPlanarImageryLayerCollection",
  "SceneGISPlanarPolylineGeometry",
  "SceneGISPlanarPolygonGeometry",
  "SceneGISPlanarBoxGeometry",
  "SceneGISPlanarCylinderGeometry",
  "SceneGISPlanarEllipsoidGeometry",
  "SceneGISPlanarWallGeometry",
  "SceneGISPlanarPolylineVolumeGeometry",
  "SceneGISPlanarPrimitive",
  "SceneGISPlanarGroundPrimitive",
];
const namespaceEngine = ["SceneGISPlanarTerrainSampler"];
const callableEngine = publicEngine.filter(
  (name) => !namespaceEngine.includes(name),
);
const publicWidgets = [
  "SceneGISPlanarHomeButton",
  "SceneGISPlanarHomeButtonViewModel",
];
const nonPublicSpellings = [
  "SceneGISPlanarSurface",
  "SceneGISPlanarQuadtree",
  "SceneGISPlanarTile",
  "SceneGISPlanarTileImagery",
  "SceneGISPlanarCamera",
  "SceneGISPlanarImagery",
  "SceneGISPlanarSurfaceShader",
  "SceneGISPlanarPositionResolver",
  "SceneGISPlanarAnchorVisualizer",
  "SceneGISPlanarModelVisualizer",
  "SceneGISPlanarPolylineVisualizer",
  "SceneGISPlanarPolygonVisualizer",
  "SceneGISPlanarPrimitiveOwner",
  "SceneGISPlanarEntityTransform",
  "SceneGISPlanarSolidVisualizer",
  "SceneGISPlanarAreaVisualizer",
  "SceneGISPlanarRouteVisualizer",
  "SceneGISPlanarPathSampler",
  "SceneGISPlanarPathVisualizer",
  "SceneGISPlanarGroundBounds",
  "SceneGISPlanarGroundCommands",
  "SceneGISPlanarGroundLineShader",
  "SceneGISPlanarGroundVolume",
  "SceneGISPlanarVisualizersCallback",
  "SceneGISPlanarTerrainWorker",
  "SceneGISPlanarTerrainWorkerScheduler",
  "SceneGISPlanarTerrainWorkerTasks",
];
const softPrivateContentSymbols = [
  "_SceneGISPlanarPositionResolver",
  "_SceneGISPlanarAnchorVisualizer",
  "_SceneGISPlanarModelVisualizer",
  "_SceneGISPlanarPolylineVisualizer",
  "_SceneGISPlanarPolygonVisualizer",
  "_SceneGISPlanarPrimitiveOwner",
  "_SceneGISPlanarEntityTransform",
  "_SceneGISPlanarSolidVisualizer",
  "_SceneGISPlanarAreaVisualizer",
  "_SceneGISPlanarRouteVisualizer",
  "_SceneGISPlanarPathSampler",
  "_SceneGISPlanarPathVisualizer",
  "_SceneGISPlanarGroundBounds",
  "_SceneGISPlanarGroundCommands",
  "_SceneGISPlanarGroundLineShader",
  "_SceneGISPlanarGroundVolume",
  "_SceneGISPlanarVisualizersCallback",
  "_SceneGISPlanarTerrainWorkerScheduler",
  "_SceneGISPlanarTerrainWorkerTasks",
];
const privateContentFiles = [
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPositionResolver.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarAnchorVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarModelVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPrimitiveOwner.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarEntityTransform.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarSolidVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarAreaVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarRouteVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPathSampler.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPathVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarGroundBounds.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarVisualizersCallback.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundCommands.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundLineShader.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundVolume.js",
  "package/Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerScheduler.js",
  "package/Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js",
];
const terrainWorkerSource =
  "package/Source/Workers/SceneGISPlanarTerrainWorker.js";
const terrainWorkerBuild =
  "package/Build/Workers/SceneGISPlanarTerrainWorker.js";
const terrainWorkerRelease =
  "package/Build/Cesium/Workers/SceneGISPlanarTerrainWorker.js";
const sceneGISShaderSources = [
  "PlanarGround/SceneGISPlanarGroundAreaFS",
  "PlanarGround/SceneGISPlanarGroundAreaVS",
  "PlanarGround/SceneGISPlanarGroundLineFS",
  "PlanarGround/SceneGISPlanarGroundLineVS",
  "PlanarSurface/SceneGISPlanarSurfaceFS",
  "PlanarSurface/SceneGISPlanarSurfaceGeometricLitVS",
  "PlanarSurface/SceneGISPlanarSurfaceSmoothLitVS",
  "PlanarSurface/SceneGISPlanarSurfaceUnlitVS",
];
const sceneGISShaderArchiveEntries = sceneGISShaderSources.flatMap((shader) =>
  ["glsl", "js"].map(
    (extension) => `package/Source/Shaders/SceneGIS/${shader}.${extension}`,
  ),
);

function npmCommand(args) {
  if (process.platform === "win32") {
    return {
      command: process.execPath,
      args: [
        path.join(
          path.dirname(process.execPath),
          "node_modules/npm/bin/npm-cli.js",
        ),
        ...args,
      ],
    };
  }
  return { command: "npm", args };
}

function pack(packageDirectory) {
  const before = new Set(
    fs.readdirSync(temporaryRoot).filter((file) => file.endsWith(".tgz")),
  );
  const npm = npmCommand([
    "pack",
    path.resolve(repo, packageDirectory),
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    temporaryRoot,
  ]);
  execFileSync(npm.command, npm.args, {
    cwd: temporaryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const archive = fs
    .readdirSync(temporaryRoot)
    .find((file) => file.endsWith(".tgz") && !before.has(file));
  assert.ok(archive, `npm pack output for ${packageDirectory}`);
  return path.join(temporaryRoot, archive);
}

function archiveEntries(archive) {
  return execFileSync("tar", ["-tf", archive], {
    encoding: "utf8",
  })
    .split(/\r?\n/u)
    .filter(Boolean);
}

function assertArchive(archive, required) {
  const entries = archiveEntries(archive);
  for (const file of required) {
    assert.ok(
      entries.includes(file),
      `${path.basename(archive)} contains ${file}`,
    );
  }
  assert.equal(
    entries.some(
      (file) =>
        file.endsWith(".tgz") ||
        file.includes("scenegis-package-smoke-") ||
        file.includes("node_modules/"),
    ),
    false,
    `${path.basename(archive)} excludes nested smoke/archive content`,
  );
}

function extract(archive, destination) {
  fs.mkdirSync(destination, { recursive: true });
  execFileSync(
    "tar",
    ["-xf", archive, "-C", destination, "--strip-components=1"],
    { cwd: temporaryRoot },
  );
}

function linkLocalDependencies(nodeModules) {
  const sourceRoot = path.join(repo, "node_modules");
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".bin") {
      continue;
    }
    if (entry.name.startsWith("@")) {
      const scopeTarget = path.join(nodeModules, entry.name);
      fs.mkdirSync(scopeTarget, { recursive: true });
      for (const scoped of fs.readdirSync(path.join(sourceRoot, entry.name), {
        withFileTypes: true,
      })) {
        if (
          entry.name === "@cesium" &&
          (scoped.name === "engine" || scoped.name === "widgets")
        ) {
          continue;
        }
        fs.symlinkSync(
          path.join(sourceRoot, entry.name, scoped.name),
          path.join(scopeTarget, scoped.name),
          "junction",
        );
      }
      continue;
    }
    fs.symlinkSync(
      path.join(sourceRoot, entry.name),
      path.join(nodeModules, entry.name),
      "junction",
    );
  }
}

function assertDeclarations(file, expected) {
  const declarations = fs.readFileSync(file, "utf8");
  for (const name of expected) {
    assert.match(
      declarations,
      new RegExp(
        name === "SceneGISPlanarTerrainSampler"
          ? `(?:namespace|const) ${name}\\b`
          : `(?:class|function|interface) ${name}\\b`,
        "u",
      ),
    );
  }
  for (const name of [...nonPublicSpellings, ...softPrivateContentSymbols]) {
    assert.doesNotMatch(declarations, new RegExp(`\\b${name}\\b`, "u"));
  }
  return declarations;
}

function runConsumer(file, expectSuccess = true) {
  const result = spawnSync(process.execPath, [file], {
    cwd: temporaryRoot,
    encoding: "utf8",
  });
  if (expectSuccess) {
    assert.equal(
      result.status,
      0,
      `${path.basename(file)}\n${result.stdout}\n${result.stderr}`,
    );
  } else {
    assert.notEqual(result.status, 0, "broken public entry must fail");
  }
}

function consumerSource(moduleSyntax) {
  const enginePublic = JSON.stringify([...publicEngine].sort());
  const engineCallable = JSON.stringify(callableEngine);
  const engineNamespaces = JSON.stringify(namespaceEngine);
  const widgetPublicNames = JSON.stringify([...publicWidgets].sort());
  const rootPublic = JSON.stringify([...publicEngine, ...publicWidgets].sort());
  const widgetPublic = JSON.stringify(publicWidgets);
  const privatePublicSpellings = JSON.stringify(nonPublicSpellings);
  const softPrivateSymbols = JSON.stringify(softPrivateContentSymbols);
  if (moduleSyntax === "esm") {
    return `
import assert from "node:assert/strict";
import * as engine from "@cesium/engine";
import * as widgets from "@cesium/widgets";
import * as root from "cesium";
const publicSceneGIS = (module) => Object.keys(module).filter((name) => name.startsWith("SceneGIS") && !name.startsWith("_")).sort();
assert.deepEqual(publicSceneGIS(engine), ${enginePublic});
assert.deepEqual(publicSceneGIS(widgets), ${widgetPublicNames});
assert.deepEqual(publicSceneGIS(root), ${rootPublic});
for (const name of ${engineCallable}) assert.equal(typeof engine[name], "function", name);
for (const name of ${engineNamespaces}) assert.equal(typeof engine[name], "object", name);
for (const name of ${widgetPublic}) assert.equal(typeof widgets[name], "function", name);
for (const name of ${engineCallable}) assert.equal(typeof root[name], "function", name);
for (const name of ${engineNamespaces}) assert.equal(typeof root[name], "object", name);
for (const name of ${widgetPublic}) assert.equal(typeof root[name], "function", name);
for (const name of ${privatePublicSpellings}) {
  assert.equal(engine[name], undefined, name);
  assert.equal(root[name], undefined, name);
}
for (const name of ${softPrivateSymbols}) {
  assert.notEqual(engine[name], undefined, name);
  assert.notEqual(root[name], undefined, name);
}
const coordinateSystem = new engine.SceneGISPlanarCoordinateSystem({
  extent: new engine.SceneGISPlanarExtent({
    minimumX: -1,
    minimumY: -1,
    maximumX: 1,
    maximumY: 1,
  }),
});
const world = new engine.SceneGISPlanarWorld({
  coordinateSystem,
  maximumLevel: 0,
});
const provider = {
  tilingScheme: world.tilingScheme,
  minimumLevel: 0,
  maximumLevel: 0,
  tileWidth: 1,
  tileHeight: 1,
  hasAlphaChannel: true,
  errorEvent: new engine.Event(),
  credit: undefined,
  requestImage: () => undefined,
};
const layer = new engine.SceneGISPlanarImageryLayer(provider);
assert.equal(layer.brightness, 1);
assert.equal(layer.contrast, 1);
assert.equal(layer.hue, 0);
assert.equal(layer.saturation, 1);
assert.equal(layer.gamma, 1);
assert.equal(layer.colorToAlpha, undefined);
assert.equal(layer.colorToAlphaThreshold, 0.004);
layer.brightness = 0.5;
assert.equal(layer.brightness, 0.5);
const target = new engine.Color(0.1, 0.2, 0.3, 0.9);
layer.colorToAlpha = target;
target.red = 0.9;
assert.equal(layer.colorToAlpha.red, 0.1);
const returnedTarget = layer.colorToAlpha;
returnedTarget.green = 0.9;
assert.equal(layer.colorToAlpha.green, 0.2);
layer.destroy();
assert.equal(layer.isDestroyed(), true);
const material = new engine.Material({
  fabric: {
    type: "SceneGISInstalledOwnershipProbe",
    source: "czm_material czm_getMaterial(czm_materialInput materialInput) { return czm_getDefaultMaterial(materialInput); }",
  },
});
world.material = material;
assert.equal(world.material, material);
world.material = undefined;
assert.equal(world.material, undefined);
assert.equal(material.isDestroyed(), false);
world.material = material;
assert.equal(world.material, material);
world.destroy();
assert.equal(material.isDestroyed(), false);
material.destroy();
assert.equal(material.isDestroyed(), true);
`;
  }
  return `
const assert = require("node:assert/strict");
const root = require("cesium");
const publicSceneGIS = Object.keys(root).filter((name) => name.startsWith("SceneGIS") && !name.startsWith("_")).sort();
assert.deepEqual(publicSceneGIS, ${rootPublic});
for (const name of ${engineCallable}) assert.equal(typeof root[name], "function", name);
for (const name of ${engineNamespaces}) assert.equal(typeof root[name], "object", name);
for (const name of ${widgetPublic}) assert.equal(typeof root[name], "function", name);
for (const name of ${privatePublicSpellings}) assert.equal(root[name], undefined, name);
for (const name of ${softPrivateSymbols}) assert.notEqual(root[name], undefined, name);
`;
}

function verifyDocumentation() {
  const documentation = path.join(repo, "Build/Documentation");
  for (const name of [...publicEngine, ...publicWidgets]) {
    assert.equal(
      fs.existsSync(path.join(documentation, `${name}.html`)),
      true,
      `${name} API documentation`,
    );
  }
  for (const name of [...nonPublicSpellings, ...softPrivateContentSymbols]) {
    assert.equal(
      fs.existsSync(path.join(documentation, `${name}.html`)),
      false,
    );
  }
  const layerDocumentation = fs.readFileSync(
    path.join(documentation, "SceneGISPlanarImageryLayer.html"),
    "utf8",
  );
  for (const member of [
    "brightness",
    "contrast",
    "hue",
    "saturation",
    "gamma",
    "colorToAlpha",
    "colorToAlphaThreshold",
  ]) {
    assert.match(
      layerDocumentation,
      new RegExp(`<h4 class="name" id="${member}">`, "u"),
    );
  }
  const worldDocumentation = fs.readFileSync(
    path.join(documentation, "SceneGISPlanarWorld.html"),
    "utf8",
  );
  assert.match(worldDocumentation, /<h4 class="name" id="material">/u);
}

function classDeclaration(declarations, name) {
  const start = declarations.indexOf(`export class ${name} {`);
  assert.notEqual(start, -1, `${name} declaration start`);
  const nextClass = declarations.indexOf("\nexport class ", start + 1);
  return declarations.slice(start, nextClass === -1 ? undefined : nextClass);
}

function verifyStylingDeclarations(declarations) {
  const layer = classDeclaration(declarations, "SceneGISPlanarImageryLayer");
  for (const member of [
    "brightness",
    "contrast",
    "hue",
    "saturation",
    "gamma",
    "colorToAlphaThreshold",
  ]) {
    assert.match(layer, new RegExp(`\\n\\s*${member}: number;`, "u"));
  }
  assert.match(layer, /\n\s*colorToAlpha: Color \| undefined;/u);
  const world = classDeclaration(declarations, "SceneGISPlanarWorld");
  assert.match(world, /\n\s*material: Material \| undefined;/u);
}

async function verify() {
  const engineArchive = pack("packages/engine");
  const widgetsArchive = pack("packages/widgets");
  const rootArchive = pack(".");
  assertArchive(engineArchive, [
    "package/index.js",
    "package/index.d.ts",
    terrainWorkerSource,
    terrainWorkerBuild,
    ...sceneGISShaderArchiveEntries,
    ...privateContentFiles,
  ]);
  assertArchive(widgetsArchive, ["package/index.js", "package/index.d.ts"]);
  assertArchive(rootArchive, [
    "package/package.json",
    "package/Source/Cesium.js",
    "package/Source/Cesium.d.ts",
    "package/index.cjs",
    terrainWorkerRelease,
  ]);

  const nodeModules = path.join(temporaryRoot, "node_modules");
  fs.mkdirSync(nodeModules);
  linkLocalDependencies(nodeModules);
  const engineDirectory = path.join(nodeModules, "@cesium/engine");
  const widgetsDirectory = path.join(nodeModules, "@cesium/widgets");
  const rootDirectory = path.join(nodeModules, "cesium");
  extract(engineArchive, engineDirectory);
  extract(widgetsArchive, widgetsDirectory);
  extract(rootArchive, rootDirectory);

  const esmConsumer = path.join(temporaryRoot, "consumer.mjs");
  const cjsConsumer = path.join(temporaryRoot, "consumer.cjs");
  fs.writeFileSync(esmConsumer, consumerSource("esm"));
  fs.writeFileSync(cjsConsumer, consumerSource("cjs"));
  runConsumer(esmConsumer);
  runConsumer(cjsConsumer);

  const engineDeclarations = assertDeclarations(
    path.join(engineDirectory, "index.d.ts"),
    publicEngine,
  );
  verifyStylingDeclarations(engineDeclarations);
  const widgetDeclarations = assertDeclarations(
    path.join(widgetsDirectory, "index.d.ts"),
    publicWidgets,
  );
  const rootDeclarations = assertDeclarations(
    path.join(rootDirectory, "Source/Cesium.d.ts"),
    [...publicEngine, ...publicWidgets],
  );
  verifyStylingDeclarations(rootDeclarations);
  for (const declarations of [widgetDeclarations, rootDeclarations]) {
    assert.match(declarations, /world\?: SceneGISPlanarWorld;/u);
    assert.match(
      declarations,
      /readonly planarCameraController: SceneGISPlanarCameraController \| undefined;/u,
    );
  }
  verifyDocumentation();

  const rootPackagePath = path.join(rootDirectory, "package.json");
  const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
  rootPackage.exports["."].import = "./Source/MissingSceneGIS.js";
  fs.writeFileSync(rootPackagePath, JSON.stringify(rootPackage));
  runConsumer(esmConsumer, false);
  process.stdout.write(
    "SceneGIS installed delivery passed: 8/8 GLSL, 8/8 generated shader modules, bare ESM/CJS, S2/S3 runtime properties, declarations/API, soft-private, and broken-entry fixtures.\n",
  );
}

try {
  await verify();
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
