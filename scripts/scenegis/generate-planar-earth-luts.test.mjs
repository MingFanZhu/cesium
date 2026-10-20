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
  integrateSingleRadiance,
  sampleMultipleSource,
  integrateSourceRadiance,
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

function referenceSingleRadiance(height, mu, sunMu, cosine, samples = 16384) {
  // Independent dense midpoint integral of the physical source, not LUT quadrature.
  const distance = Math.min(boundaryDistance(height, mu), 20000000);
  const step = distance / samples;
  const radiance = [0, 0, 0];
  const rayleigh = [5.802e-6, 1.3558e-5, 3.31e-5];
  const solar = [1.474, 1.8504, 1.91198];
  const rayleighPhase = (3 * (1 + cosine * cosine)) / (16 * Math.PI);
  const miePhase =
    (3 * (1 - 0.8 ** 2) * (1 + cosine * cosine)) /
    (8 * Math.PI * (2 + 0.8 ** 2) * (1 + 0.8 ** 2 - 1.6 * cosine) ** 1.5);
  for (let i = 0; i < samples; i++) {
    const along = (i + 0.5) * step;
    const z = height + mu * along;
    const viewT = transmittance(height, mu, along);
    const sunT = transmittance(z, sunMu);
    for (let channel = 0; channel < 3; channel++) {
      const source =
        solar[channel] *
        sunT[channel] *
        (rayleigh[channel] * Math.exp(-z / 8000) * rayleighPhase +
          3.996e-6 * Math.exp(-z / 1200) * miePhase);
      radiance[channel] += viewT[channel] * source * step;
    }
  }
  return radiance;
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

test("retains directional multiple scattering against direct angular convolution at noon and low Sun", (t) => {
  let maximumError = 0;
  const result = createMultipleSourceGrid(32, 16);
  const height = 60000 * (0.5 / 16) ** 2;
  const rayleighPhase = (nu) => (3 / (16 * Math.PI)) * (1 + nu * nu);
  const miePhase = (nu) =>
    ((3 / (8 * Math.PI)) * 0.36 * (1 + nu * nu)) /
    (2.64 * (1.64 - 1.6 * nu) ** 1.5);
  for (const sunIndex of [19, 29]) {
    const sunMu = ((2 * (sunIndex + 0.5)) / 32 - 1) ** 2;
    const views = [
      [sunMu, 0],
      [0, 0],
      [0, Math.PI],
      [-0.05, 0],
      [0.5, 0],
      [0.5, Math.PI],
    ];
    const reference = views.map(() => [0, 0, 0]);
    const groundE0 = transmittance(0, sunMu).map(
      (v, c) => v * sunMu * [1.474, 1.8504, 1.91198][c],
    );
    // Independent dense midpoint angular integration, with the actual phase
    // functions rather than their harmonic eigenvalues. Only L1 transport is
    // shared; its path quadrature has a separate dense-reference test below.
    const count = 128;
    for (let j = 0; j < count; j++) {
      const mu = -1 + (2 * (j + 0.5)) / count;
      const forward = integrateSingleRadiance(height, mu, sunMu, 1);
      const backward = integrateSingleRadiance(height, mu, sunMu, -1);
      const mie = forward.map(
        (v, c) => (v - backward[c]) / (miePhase(1) - miePhase(-1)),
      );
      const rayleigh = backward.map(
        (v, c) => (v - mie[c] * miePhase(-1)) / rayleighPhase(-1),
      );
      const groundT = mu < 0 ? transmittance(height, mu) : [0, 0, 0];
      for (let k = 0; k < count; k++) {
        const phi = (2 * Math.PI * (k + 0.5)) / count;
        const nu =
          mu * sunMu +
          Math.sqrt((1 - mu * mu) * (1 - sunMu * sunMu)) * Math.cos(phi);
        const incoming = rayleigh.map(
          (v, c) =>
            v * rayleighPhase(nu) +
            mie[c] * miePhase(nu) +
            ((groundT[c] * 0.1) / Math.PI) * groundE0[c],
        );
        for (let v = 0; v < views.length; v++) {
          const [viewMu, viewPhi] = views[v];
          const scatteringCosine =
            mu * viewMu +
            Math.sqrt((1 - mu * mu) * (1 - viewMu * viewMu)) *
              Math.cos(phi - viewPhi);
          for (let c = 0; c < 3; c++) {
            const scattering =
              [5.802e-6, 1.3558e-5, 3.31e-5][c] *
                Math.exp(-height / 8000) *
                rayleighPhase(scatteringCosine) +
              3.996e-6 * Math.exp(-height / 1200) * miePhase(scatteringCosine);
            reference[v][c] +=
              (incoming[c] * scattering * 4 * Math.PI) / (count * count);
          }
        }
      }
    }
    const actual = views.map(([mu, phi]) =>
      sampleMultipleSource(
        result.orderGrids[0],
        height,
        mu,
        sunMu,
        mu * sunMu +
          Math.sqrt((1 - mu * mu) * (1 - sunMu * sunMu)) * Math.cos(phi),
      ),
    );
    for (let v = 0; v < views.length; v++) {
      for (let c = 0; c < 3; c++) {
        const error = Math.abs(actual[v][c] / reference[v][c] - 1);
        maximumError = Math.max(maximumError, error);
        assert.ok(
          error < 0.02,
          `sun=${sunMu}, view=${views[v]}, channel=${c}: ${actual[v][c]} vs ${reference[v][c]}`,
        );
      }
    }
    assert.ok(
      actual.some((value) => Math.abs(value[0] / actual[2][0] - 1) > 0.05),
      "the source must retain directionality",
    );
  }
  t.diagnostic(
    `Maximum direct angular convolution relative error: ${maximumError}`,
  );
});

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
  const y00 = 1 / Math.sqrt(4 * Math.PI);
  const result = createMultipleSourceGrid(1, 1, {
    groundAlbedo: [0, 0, 0],
    singleRadiance: () => {
      singleCalls++;
      return seed;
    },
    sourceRadiance: (...args) => {
      sourceCalls++;
      const previous = args[4];
      return Array.from(previous.values.slice(0, 3), (value) => value * y00);
    },
  });

  assert.equal(singleCalls, 32 * 64);
  assert.equal(sourceCalls, 2 * 32 * 64);
  assert.equal(result.orderGrids.length, 3);
  for (let channel = 0; channel < 3; channel++) {
    const order2 = result.orderGrids[0].values[channel];
    const order3 = result.orderGrids[1].values[channel];
    const order4 = result.orderGrids[2].values[channel];
    const recurrence = (order2 * y00) / seed[channel];
    assert.ok(Math.abs(order3 / (order2 * recurrence) - 1) < 1e-12);
    assert.ok(Math.abs(order4 / (order3 * recurrence) - 1) < 1e-12);
    assert.equal(result.grid.values[channel], order2 + order3 + order4);
  }
});

test("includes ground-reflected sunlight in the second scattering order", () => {
  const black = createMultipleSourceGrid(2, 1, { groundAlbedo: [0, 0, 0] });
  const reflecting = createMultipleSourceGrid(2, 1);
  const height = 15000;
  const sunMu = 0.25;
  const solar = [1.474, 1.8504, 1.91198];
  const groundT = transmittance(0, sunMu);
  const meanGroundT = [0, 0, 0];
  for (let i = 0; i < 2048; i++) {
    const t = transmittance(height, -1 + (i + 0.5) / 2048);
    for (let c = 0; c < 3; c++) {
      meanGroundT[c] += t[c] / 4096;
    }
  }
  for (let c = 0; c < 3; c++) {
    const scattering =
      [5.802e-6, 1.3558e-5, 3.31e-5][c] * Math.exp(-height / 8000) +
      3.996e-6 * Math.exp(-height / 1200);
    const expected =
      (0.1 / Math.PI) *
      solar[c] *
      sunMu *
      groundT[c] *
      meanGroundT[c] *
      scattering;
    const added =
      (reflecting.orderGrids[0].values[3 * 153 + c] -
        black.orderGrids[0].values[3 * 153 + c]) /
      Math.sqrt(4 * Math.PI);
    assert.ok(expected > 0);
    assert.ok(
      Math.abs(added / expected - 1) < 0.002,
      `${added} vs ${expected}`,
    );
  }
});

test("feeds single-order ground irradiance back without repeating direct sunlight", () => {
  const result = createMultipleSourceGrid(2, 8);
  const sunMu = 0.25;
  const expected = [
    [0, 0, 0],
    [0, 0, 0],
  ];
  // Independently integrate L1 and L2 at the ground on a finer angular grid.
  // E1 must feed order 3; E2 (including the earlier ground bounce) feeds order 4.
  for (let j = 0; j < 48; j++) {
    const mu = (j + 0.5) / 48;
    for (let k = 0; k < 32; k++) {
      const cosine =
        mu * sunMu +
        Math.sqrt((1 - mu * mu) * (1 - sunMu * sunMu)) *
          Math.cos((2 * Math.PI * (k + 0.5)) / 32);
      const first = integrateSingleRadiance(0, mu, sunMu, cosine);
      const second = integrateSourceRadiance(
        0,
        mu,
        sunMu,
        cosine,
        result.orderGrids[0],
      );
      for (let c = 0; c < 3; c++) {
        expected[0][c] += (first[c] * mu * 2 * Math.PI) / (48 * 32);
        expected[1][c] += (second[c] * mu * 2 * Math.PI) / (48 * 32);
      }
    }
  }
  for (let order = 0; order < 2; order++) {
    for (let c = 0; c < 3; c++) {
      const actual = result.groundIrradianceOrders[order + 1][1][c];
      assert.ok(expected[order][c] > 0);
      // A separate uniform hemisphere integral checks both directional orders.
      assert.ok(
        Math.abs(actual / expected[order][c] - 1) < 0.02,
        `E${order + 1}/${c}: ${actual} vs ${expected[order][c]}`,
      );
    }
  }
});

test("keeps flat-slab nights dark and excludes the final ground reflection from scattering", () => {
  const result = createMultipleSourceGrid(4, 4);
  for (const order of result.orderGrids) {
    for (let y = 0; y < order.height; y++) {
      for (let x = 0; x < order.width / 2; x++) {
        assertVectorClose(
          Array.from(
            order.values.slice((y * 4 + x) * 459, (y * 4 + x + 1) * 459),
          ),
          Array(459).fill(0),
        );
      }
    }
  }
  for (const sunMu of [-0.1, -1]) {
    assertVectorClose(
      integrateTotalRadiance(600, 0.2, sunMu, 0.5, result.grid),
      [0, 0, 0],
    );
    assertVectorClose(computeIrradiance(0, sunMu, result.grid), [0, 0, 0]);
  }
  // A zero-length atmospheric path has no radiance even with a lit ground.
  assertVectorClose(
    integrateTotalRadiance(0, -1, 0.5, 0.5, result.grid),
    [0, 0, 0],
  );
  const black = createMultipleSourceGrid(4, 4, { groundAlbedo: [0, 0, 0] });
  const lit = computeIrradiance(0, 0.5, result.grid);
  const unlit = computeIrradiance(0, 0.5, black.grid);
  for (let c = 0; c < 3; c++) {
    assert.ok(lit[c] > unlit[c]);
  }
});

test("composes true-boundary horizontal and shallow segments through analytic transmittance", () => {
  const zeroMultiple = {
    width: 1,
    height: 1,
    degree: 0,
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
      (value, channel) =>
        value - segmentT[channel] * horizontalBoundary[channel],
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

test("converges to the horizontal scattering limit from both sides", () => {
  const horizontal = integrateSingleRadiance(600, 0, 0.89, 0.2);
  for (const mu of [-1e-5, 1e-5]) {
    assertVectorClose(
      integrateSingleRadiance(600, mu, 0.89, 0.2),
      horizontal,
      0.00005,
    );
  }
});

test("matches independent dense single-scattering integrals across optical depths", () => {
  for (const [height, mu] of [
    [600, -0.001],
    [600, 0.001],
    [600, 0.1],
    [30000, -0.05],
    [59000, -0.005],
  ]) {
    const expected = referenceSingleRadiance(height, mu, 0.89, 0.2);
    const refined = referenceSingleRadiance(height, mu, 0.89, 0.2, 32768);
    assertVectorClose(expected, refined, 0.00001);
    const actual = integrateSingleRadiance(height, mu, 0.89, 0.2);
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(
        Math.abs(actual[channel] / refined[channel] - 1) < 0.02,
        `${height}/${mu} channel ${channel}: ${actual[channel]} vs ${refined[channel]}`,
      );
    }
  }
});

test("computes direct plus cosine-weighted diffuse irradiance reference values", () => {
  const zeroMultiple = {
    width: 1,
    height: 1,
    degree: 0,
    values: new Float64Array(3),
  };
  assertVectorClose(
    computeIrradiance(60000, 1, zeroMultiple),
    [1.474, 1.8504, 1.91198],
  );
  assertVectorClose(computeIrradiance(60000, -1, zeroMultiple), [0, 0, 0]);
  const expected = transmittance(0, 1).map(
    (value, channel) => value * [1.474, 1.8504, 1.91198][channel],
  );
  for (let zenith = 0; zenith < 12; zenith++) {
    const mu = (zenith + 0.5) / 12;
    const incoming = referenceSingleRadiance(0, mu, 1, mu);
    for (let channel = 0; channel < 3; channel++) {
      expected[channel] += incoming[channel] * mu * ((2 * Math.PI) / 12);
    }
  }
  assertVectorClose(computeIrradiance(0, 1, zeroMultiple), expected, 0.003);
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
