import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  approvedFiles,
  boundaryDistance,
  computeIrradiance,
  createMultipleSourceGrid,
  generateAssetBuffers,
  generateTarget,
  integrateTotalRadiance,
  transmittance,
  verifyTarget,
} from "./generate-planar-earth-luts.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const delivery = path.join(
  repositoryRoot,
  "packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth",
);

function decodeFloat16(bits) {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) {
    return sign * Math.pow(2, -14) * (fraction / 1024);
  }
  if (exponent === 31) {
    return fraction === 0 ? sign * Infinity : Number.NaN;
  }
  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

function assertVectorClose(actual, expected, tolerance = 1e-12) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tolerance,
      `${actual[i]} differs from ${expected[i]} at channel ${i}`,
    );
  }
}

async function trackedBuffers() {
  return {
    files: {
      "transmittance.bin": await readFile(
        path.join(delivery, "transmittance.bin"),
      ),
      "scattering.bin": await readFile(path.join(delivery, "scattering.bin")),
      "irradiance.bin": await readFile(path.join(delivery, "irradiance.bin")),
    },
    orderEnergy: [1, 1, 1],
  };
}

test("generates deterministic packed finite energy with orders 2 through 4", () => {
  const options = {
    dimensions: {
      transmittance: [16, 8],
      scattering: [16, 8, 4],
      irradiance: [8, 4],
    },
    sourceSunSamples: 4,
    sourceHeightSamples: 4,
  };
  const first = generateAssetBuffers(options);
  const second = generateAssetBuffers(options);
  for (const name of Object.keys(first.files)) {
    assert.deepEqual(first.files[name], second.files[name], name);
  }
  assert.equal(first.orderEnergy.length, 3);
  assert.equal(
    first.orderEnergy.every((value) => value > 0),
    true,
  );
  for (const buffer of Object.values(first.files)) {
    let positive = 0;
    for (let offset = 0; offset < buffer.length; offset += 2) {
      const value = decodeFloat16(buffer.readUInt16LE(offset));
      assert.equal(Number.isFinite(value), true);
      assert.equal(value >= 0, true);
      positive += value > 0 ? 1 : 0;
    }
    assert.equal(positive > 0, true);
  }
});

test("isolates the single seed and each multiple-scattering recurrence order", () => {
  let singleCalls = 0;
  let sourceCalls = 0;
  const seed = [1, 2, 3];
  const result = createMultipleSourceGrid(1, 1, {
    singleRadiance: () => {
      singleCalls++;
      return seed;
    },
    sourceRadiance: (...args) => {
      sourceCalls++;
      const previous = args[4];
      return Array.from(previous.values);
    },
  });

  assert.equal(singleCalls, 12 * 8);
  assert.equal(sourceCalls, 2 * 12 * 8);
  assert.equal(result.orderGrids.length, 3);
  for (let channel = 0; channel < 3; channel++) {
    const order2 = result.orderGrids[0].values[channel];
    const order3 = result.orderGrids[1].values[channel];
    const order4 = result.orderGrids[2].values[channel];
    const recurrence = order2 / seed[channel];
    assert.ok(Math.abs(order3 - order2 * recurrence) < 1e-24);
    assert.ok(Math.abs(order4 - order3 * recurrence) < 1e-30);
    assert.equal(
      result.grid.values[channel],
      order2 + order3 + order4,
    );
  }
});

test("composes true-boundary horizontal and shallow segments through analytic transmittance", () => {
  const zeroMultiple = {
    width: 1,
    height: 1,
    values: new Float64Array(3),
  };
  const distances = [50000, 150000, 300000];
  const horizontalBoundary = integrateTotalRadiance(
    1000,
    0,
    0.5,
    0.2,
    zeroMultiple,
  );
  assert.equal(boundaryDistance(1000, 0), Number.POSITIVE_INFINITY);
  let previousEnergy = 0;
  for (const distance of distances) {
    const segmentT = transmittance(1000, 0, distance);
    const segment = horizontalBoundary.map(
      (value, channel) => value - segmentT[channel] * horizontalBoundary[channel],
    );
    const energy = segment.reduce((sum, value) => sum + value, 0);
    assert.ok(energy > previousEnergy);
    previousEnergy = energy;
  }

  const shallowMu = 0.05;
  assert.equal(boundaryDistance(30000, shallowMu), 600000);
  const shallowBoundary = integrateTotalRadiance(
    30000,
    shallowMu,
    0.5,
    0.2,
    zeroMultiple,
  );
  previousEnergy = 0;
  for (const distance of distances) {
    const endpointHeight = 30000 + shallowMu * distance;
    const endpointBoundary = integrateTotalRadiance(
      endpointHeight,
      shallowMu,
      0.5,
      0.2,
      zeroMultiple,
    );
    const segmentT = transmittance(30000, shallowMu, distance);
    const segment = shallowBoundary.map(
      (value, channel) => value - segmentT[channel] * endpointBoundary[channel],
    );
    const energy = segment.reduce((sum, value) => sum + value, 0);
    assert.ok(energy > previousEnergy);
    previousEnergy = energy;
  }
});

test("computes direct plus cosine-weighted diffuse irradiance reference values", () => {
  const zeroMultiple = {
    width: 1,
    height: 1,
    values: new Float64Array(3),
  };
  assertVectorClose(
    computeIrradiance(60000, 1, zeroMultiple),
    [1.474, 1.8504, 1.91198],
  );
  assertVectorClose(computeIrradiance(60000, -1, zeroMultiple), [0, 0, 0]);
  assertVectorClose(
    computeIrradiance(0, 1, zeroMultiple),
    [1.418685152975808, 1.6855545473324087, 1.617489073158227],
  );
});

test("verifies the exact tracked dimensions hashes provenance and license", async () => {
  await verifyTarget(delivery);
  const provenance = JSON.parse(
    await readFile(path.join(delivery, "provenance.json"), "utf8"),
  );
  assert.deepEqual(provenance.files, approvedFiles);
  assert.deepEqual(provenance.transport.multipleScatteringOrders, [2, 3, 4]);
  assert.equal(
    provenance.transport.runtimeEvaluation,
    "true-boundary entry/endpoint radiance differencing with analytic segment transmittance",
  );
});

test(
  "regenerates the full approved asset set to a separate byte-identical target",
  { timeout: 120000 },
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "scenegis-planar-lut-full-regeneration-"),
    );
    try {
      const target = path.join(root, "PlanarEarth");
      await generateTarget(target);
      for (const name of [
        "transmittance.bin",
        "scattering.bin",
        "irradiance.bin",
        "LICENSE.txt",
        "provenance.json",
      ]) {
        assert.deepEqual(
          await readFile(path.join(target, name)),
          await readFile(path.join(delivery, name)),
          name,
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("rejects binary and canonical provenance tampering", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "scenegis-planar-lut-tamper-"),
  );
  try {
    const binaryTarget = path.join(root, "binary");
    await cp(delivery, binaryTarget, { recursive: true });
    const transmittancePath = path.join(binaryTarget, "transmittance.bin");
    const transmittance = await readFile(transmittancePath);
    transmittance[0] ^= 0xff;
    await writeFile(transmittancePath, transmittance);
    await assert.rejects(verifyTarget(binaryTarget), /SHA-256/);

    const provenanceTarget = path.join(root, "provenance");
    await cp(delivery, provenanceTarget, { recursive: true });
    const provenancePath = path.join(provenanceTarget, "provenance.json");
    const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
    provenance.format.textures.scattering.dimensions[2] = 16;
    await writeFile(provenancePath, `${JSON.stringify(provenance)}\n`);
    await assert.rejects(
      verifyTarget(provenanceTarget),
      /does not exactly match/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restores the previous target after a publication failure", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "scenegis-planar-lut-atomic-"),
  );
  try {
    const target = path.join(root, "target");
    await cp(delivery, target, { recursive: true });
    const before = await readFile(path.join(target, "provenance.json"));
    const generated = await trackedBuffers();
    await assert.rejects(
      generateTarget(target, {
        generate: () => generated,
        afterBackup: () => {
          throw new Error("injected publication failure");
        },
      }),
      /injected publication failure/,
    );
    assert.deepEqual(
      await readFile(path.join(target, "provenance.json")),
      before,
    );
    await verifyTarget(target);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps both Planar and Globe runtime upload in binary16", async () => {
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
