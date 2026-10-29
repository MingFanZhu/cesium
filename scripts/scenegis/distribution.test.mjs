import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import ts from "typescript";
import { createDistributionDeclarations } from "./build-distribution.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "Build/SceneGIS");

test("declarations preserve native signatures and expose a SceneGIS global", () => {
  const result = createDistributionDeclarations(
    'declare module "cesium" { export class Scene { destroy(): void; } }',
  );
  assert.match(result, /export as namespace SceneGIS;/);
  assert.match(result, /export class Scene/);
  assert.doesNotMatch(result, /declare module "cesium"/);
  assert.throws(() => createDistributionDeclarations("export {};"), /Expected/);
});

test("delivered public declaration values exist in the single ESM entry", async () => {
  const program = ts.createProgram([path.join(output, "SceneGIS.d.ts")], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    moduleDetection: ts.ModuleDetectionKind.Legacy,
    noEmit: true,
    strict: true,
    skipLibCheck: false,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (file) => file,
      getNewLine: () => "\n",
    }),
  );
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(path.join(output, "SceneGIS.d.ts"));
  const symbols = checker.getExportsOfModule(
    checker.getSymbolAtLocation(source),
  );
  const runtime = await import(pathToFileURL(path.join(output, "index.js")));
  const missing = symbols
    .filter((symbol) => {
      const value =
        symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol;
      return value.flags & ts.SymbolFlags.Value && !(symbol.name in runtime);
    })
    .map((symbol) => symbol.name);
  assert.deepEqual(missing, []);
  for (const name of [
    "Scene",
    "ImageryLayer",
    "I3SLayer",
    "Panorama",
    "VERSION",
    "Viewer",
    "SceneGISPlanarWorld",
    "SceneGISWindSimulation",
    "SceneGIS3DTilesVoxelizer",
  ]) {
    assert.ok(name in runtime, name);
    assert.ok(
      symbols.some((symbol) => symbol.name === name),
      `declaration ${name}`,
    );
  }
  const packageJson = JSON.parse(
    await readFile(path.join(output, "package.json"), "utf8"),
  );
  assert.equal(packageJson.exports["."].import, "./index.js");
  assert.equal(packageJson.exports["."].types, "./SceneGIS.d.ts");
});

test("isolated downstream imports and script globals compile without source workspaces", async () => {
  const fixture = path.join(root, "Build/distribution-type-consumer");
  await mkdir(fixture, { recursive: true });
  try {
    await writeFile(path.join(fixture, "package.json"), '{"type":"module"}');
    await writeFile(
      path.join(fixture, "module.ts"),
      `
import { Scene, Viewer, SceneGISPlanarWorld, VERSION, I3SLayer, Panorama } from "../SceneGIS/index.js";
const scene: Scene = null as unknown as Scene;
const world: SceneGISPlanarWorld | undefined = undefined;
const viewer: Viewer | undefined = undefined;
void [scene, world, viewer, VERSION, I3SLayer, Panorama];
`,
    );
    await writeFile(
      path.join(fixture, "global.cts"),
      `
/// <reference path="../SceneGIS/SceneGIS.d.ts" />
globalThis.SCENEGIS_BASE_URL = "/vendor/SceneGIS/";
const position = new SceneGIS.Cartesian3(1, 2, 3);
const options: SceneGIS.Viewer.ConstructorOptions = { baseLayer: false };
void [position, options, SceneGIS.VERSION];
`,
    );
    const program = ts.createProgram(
      [path.join(fixture, "module.ts"), path.join(fixture, "global.cts")],
      {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        moduleDetection: ts.ModuleDetectionKind.Legacy,
        noEmit: true,
        strict: true,
        skipLibCheck: false,
        types: [],
      },
    );
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (file) => file,
        getNewLine: () => "\n",
      }),
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
