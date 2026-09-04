import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SOURCE_PATH,
  importAsset,
  verifyDirectory,
} from "./import-three-geospatial-moon-asset.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const delivery = path.join(
  repositoryRoot,
  "packages/engine/Source/Assets/SceneGIS/Environment/Moon",
);

test("verifies the pinned Moon asset and provenance", async () => {
  const provenance = await verifyDirectory(delivery);
  assert.equal(provenance.source.license, "MIT");
  assert.equal(provenance.source.credit, "NASA");
});

test("imports the exact source and rejects corrupt bytes", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "scenegis-moon-import-"),
  );
  try {
    const source = path.join(temporaryRoot, "source");
    const sourceAsset = path.join(source, SOURCE_PATH);
    const target = path.join(temporaryRoot, "target");
    await mkdir(path.dirname(sourceAsset), { recursive: true });
    await copyFile(path.join(delivery, "color_large.webp"), sourceAsset);
    await importAsset(source, target);
    await verifyDirectory(target);

    const corrupt = await readFile(sourceAsset);
    corrupt[corrupt.length - 1] ^= 0xff;
    await writeFile(sourceAsset, corrupt);
    await assert.rejects(importAsset(source, target));
    await verifyDirectory(target);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
