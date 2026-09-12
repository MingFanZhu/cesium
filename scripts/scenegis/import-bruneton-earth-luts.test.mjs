import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  importAssets,
  parseArguments,
  verifyTarget,
} from "./import-bruneton-earth-luts.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const delivery = path.join(
  repositoryRoot,
  "packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth",
);

async function createSource(root) {
  const assets = path.join(root, "assets");
  await mkdir(assets, { recursive: true });
  for (const name of [
    "transmittance.bin",
    "scattering.bin",
    "irradiance.bin",
  ]) {
    await copyFile(path.join(delivery, name), path.join(assets, name));
  }
  await copyFile(path.join(delivery, "LICENSE.txt"), path.join(root, "LICENSE"));
}

test("verifies the exact tracked delivery and combined RGBA16F provenance", async () => {
  await verifyTarget(delivery);
  const provenance = JSON.parse(
    await readFile(path.join(delivery, "provenance.json"), "utf8"),
  );
  assert.equal(provenance.format.pixelDatatype, "HALF_FLOAT");
  assert.equal(
    provenance.format.textures.scattering.combinedSingleMieRedInAlpha,
    true,
  );
  assert.deepEqual(provenance.format.textures.scattering.dimensions, [
    256, 128, 32,
  ]);
});

test("requires an explicit source and rejects unknown CLI arguments", () => {
  assert.throws(() => parseArguments([]), /--source-dir is required/);
  assert.throws(() => parseArguments(["--download"]), /Unknown argument/);
});

test("rejects any provenance manifest field tampering", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "scenegis-bruneton-manifest-"),
  );
  try {
    const source = path.join(temporaryRoot, "source");
    const target = path.join(temporaryRoot, "target");
    await createSource(source);
    await importAssets(source, target);
    const provenancePath = path.join(target, "provenance.json");
    const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
    provenance.format.textures.transmittance.dimensions[0] = 128;
    await writeFile(provenancePath, `${JSON.stringify(provenance)}\n`);
    await assert.rejects(verifyTarget(target), /does not exactly match/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("imports a verified source and rejects corruption before publication", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "scenegis-bruneton-import-"),
  );
  try {
    const source = path.join(temporaryRoot, "source");
    const target = path.join(temporaryRoot, "target");
    await createSource(source);
    await importAssets(source, target);
    await verifyTarget(target);

    const scatteringPath = path.join(source, "assets/scattering.bin");
    const scattering = await readFile(scatteringPath);
    scattering[0] ^= 0xff;
    await writeFile(scatteringPath, scattering);
    await assert.rejects(
      importAssets(source, target),
      /SHA-256 .* expected/,
    );
    await verifyTarget(target);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("keeps runtime upload in binary16 without Float32 expansion", async () => {
  const renderer = await readFile(
    path.join(
      repositoryRoot,
      "packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js",
    ),
    "utf8",
  );
  assert.match(renderer, /new Uint16Array\(buffer\)/);
  assert.match(renderer, /PixelDatatype\.HALF_FLOAT/);
  assert.doesNotMatch(renderer, /Float32Array\(buffer\)/);
});
