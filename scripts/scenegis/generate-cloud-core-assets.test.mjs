import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FILES,
  createPayloads,
  createProvenance,
  publish,
  verifyDirectory,
} from "./generate-cloud-core-assets.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const delivery = path.join(
  repositoryRoot,
  "packages/engine/Source/Assets/SceneGIS/Environment/CloudCore",
);

test("generates deterministic exact CloudCore payloads", () => {
  const first = createPayloads();
  const second = createPayloads();
  let total = 0;
  for (const file of FILES) {
    const left = first.get(file.name);
    const right = second.get(file.name);
    const expectedBytes =
      file.dimensions.reduce((product, value) => product * value, 1) *
      file.channels;
    assert.equal(left.length, expectedBytes);
    assert.deepEqual(left, right);
    total += left.length;
  }
  assert.equal(total, 11796480);
  assert.equal(createProvenance(first).totalBinaryBytes, total);
});

test("keeps volume faces tileable and every channel nonconstant", () => {
  const payloads = createPayloads();
  for (const file of FILES.filter(
    (value) => value.dimensions.length === 3 && value.channels === 4,
  )) {
    const [width, height, depth] = file.dimensions;
    const data = payloads.get(file.name);
    for (let channel = 0; channel < file.channels; channel++) {
      const values = new Set();
      for (let index = channel; index < data.length; index += file.channels) {
        values.add(data[index]);
      }
      assert.ok(
        values.size > 1 || (channel === 3 && file.name === "weather.bin"),
      );
      for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
          const first = (z * height + y) * width * file.channels + channel;
          const last =
            ((z * height + y) * width + width - 1) * file.channels + channel;
          assert.equal(data[first], data[last], `${file.name} x face`);
        }
      }
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          const first = (z * height * width + x) * file.channels + channel;
          const last =
            ((z * height + height - 1) * width + x) * file.channels + channel;
          assert.equal(data[first], data[last], `${file.name} y face`);
        }
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const first = (y * width + x) * file.channels + channel;
          const last =
            (((depth - 1) * height + y) * width + x) * file.channels + channel;
          assert.equal(data[first], data[last], `${file.name} z face`);
        }
      }
    }
  }
});

test("keeps maximum-thickness detail periodic across the R tile boundary", () => {
  const data = createPayloads().get("detail.bin");
  const width = 64;
  const height = 64;
  const depth = 64;

  function sample(x, y, normalizedZ, repeat) {
    const coordinate = repeat
      ? normalizedZ - Math.floor(normalizedZ)
      : Math.max(0.0, Math.min(normalizedZ, 1.0));
    const z = Math.round(coordinate * (depth - 1));
    return data[((z * height + y) * width + x) * 4];
  }

  let nonFrozen = 0;
  for (let y = 1; y < height - 1; y += 5) {
    for (let x = 1; x < width - 1; x += 5) {
      const base = sample(x, y, 0.6, true);
      assert.equal(sample(x, y, 1.6, true), base);
      nonFrozen += Number(sample(x, y, 1.6, false) !== base);
    }
  }
  assert.ok(nonFrozen > 0);
});

test("rank-normalizes every periodic weather channel and representative window", () => {
  const data = createPayloads().get("weather.bin");
  const size = 256;
  const uniqueSize = size - 1;
  for (let channel = 0; channel < 4; channel++) {
    const histogram = new Uint32Array(256);
    let activeColumns = 0;
    for (let y = 0; y < uniqueSize; y++) {
      for (let x = 0; x < uniqueSize; x++) {
        const value = data[(y * size + x) * 4 + channel];
        histogram[value]++;
        activeColumns += Number(value / 255.0 > 0.55);
      }
    }
    const nonempty = Array.from(histogram).filter((value) => value > 0);
    assert.ok(nonempty.length >= 250, `${channel} bins=${nonempty.length}`);
    for (const quantile of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      let below = 0;
      for (let value = 0; value <= Math.round(quantile * 255); value++) {
        below += histogram[value];
      }
      assert.ok(
        Math.abs(below / (uniqueSize * uniqueSize) - quantile) <= 0.01,
        `${channel} CDF ${quantile}`,
      );
    }
    const occupancy = activeColumns / (uniqueSize * uniqueSize);
    assert.ok(
      Math.abs(occupancy - 0.45) <= 0.01,
      `${channel} occupancy=${occupancy}`,
    );
    const windowOccupancies = [];
    for (const originY of [0, 64, 128, 192]) {
      for (const originX of [0, 64, 128, 192]) {
        let active = 0;
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 64; x++) {
            const sampleX = (originX + x) % uniqueSize;
            const sampleY = (originY + y) % uniqueSize;
            active += Number(
              data[(sampleY * size + sampleX) * 4 + channel] / 255.0 > 0.55,
            );
          }
        }
        windowOccupancies.push(active / (64 * 64));
      }
    }
    const windowMean =
      windowOccupancies.reduce((sum, value) => sum + value, 0.0) /
      windowOccupancies.length;
    assert.ok(Math.abs(windowMean - occupancy) <= 0.03, `${channel} windows`);
    assert.ok(new Set(windowOccupancies).size >= 8, `${channel} diversity`);
    assert.ok(
      Math.max(...windowOccupancies) - Math.min(...windowOccupancies) >= 0.1,
      `${channel} window range`,
    );
    for (let index = 0; index < size; index++) {
      assert.equal(
        data[(index * size + 0) * 4 + channel],
        data[(index * size + size - 1) * 4 + channel],
      );
      assert.equal(
        data[(0 * size + index) * 4 + channel],
        data[((size - 1) * size + index) * 4 + channel],
      );
    }
  }
});

test("STBN packing is uniform and suppresses low spatial-temporal energy", () => {
  const data = createPayloads().get("stbn.bin");
  const histogram = new Uint32Array(256);
  for (const value of data) {
    histogram[value]++;
  }
  assert.equal(Math.min(...histogram), 4096);
  assert.equal(Math.max(...histogram), 4096);

  let sumLeft = 0;
  let sumRight = 0;
  let sumLeftSquared = 0;
  let sumRightSquared = 0;
  let sumProduct = 0;
  let count = 0;
  for (let z = 0; z < 64; z++) {
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 127; x++) {
        const index = (z * 128 + y) * 128 + x;
        const left = data[index];
        const right = data[index + 1];
        sumLeft += left;
        sumRight += right;
        sumLeftSquared += left * left;
        sumRightSquared += right * right;
        sumProduct += left * right;
        count++;
      }
    }
  }
  const spatialCorrelation =
    (count * sumProduct - sumLeft * sumRight) /
    Math.sqrt(
      (count * sumLeftSquared - sumLeft * sumLeft) *
        (count * sumRightSquared - sumRight * sumRight),
    );
  assert.ok(spatialCorrelation < -0.05, `${spatialCorrelation}`);

  sumLeft = 0;
  sumRight = 0;
  sumLeftSquared = 0;
  sumRightSquared = 0;
  sumProduct = 0;
  count = 0;
  for (let z = 0; z < 63; z++) {
    for (let index = 0; index < 128 * 128; index++) {
      const left = data[z * 128 * 128 + index];
      const right = data[(z + 1) * 128 * 128 + index];
      sumLeft += left;
      sumRight += right;
      sumLeftSquared += left * left;
      sumRightSquared += right * right;
      sumProduct += left * right;
      count++;
    }
  }
  const temporalCorrelation =
    (count * sumProduct - sumLeft * sumRight) /
    Math.sqrt(
      (count * sumLeftSquared - sumLeft * sumLeft) *
        (count * sumRightSquared - sumRight * sumRight),
    );
  assert.ok(temporalCorrelation < -0.05, `${temporalCorrelation}`);
});

test("separates macro shape, detail, weather, and turbulence frequency bands", () => {
  const payloads = createPayloads();
  const statistics = function (name) {
    const data = payloads.get(name);
    const file = FILES.find((candidate) => candidate.name === name);
    const width = file.dimensions[0];
    const height = file.dimensions[1];
    const depth = file.dimensions[2] ?? 1;
    const channels = file.channels;
    let sum = 0.0;
    let sumSquared = 0.0;
    let gradient = 0.0;
    let count = 0;
    let gradientCount = 0;
    for (let index = 0; index < data.length; index += channels) {
      const value = data[index] / 255.0;
      sum += value;
      sumSquared += value * value;
      count++;
    }
    for (let z = 0; z < depth; z++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width - 1; x++) {
          const left = ((z * height + y) * width + x) * channels;
          gradient += Math.abs(data[left + channels] - data[left]) / 255.0;
          gradientCount++;
        }
      }
    }
    const mean = sum / count;
    return {
      mean,
      deviation: Math.sqrt(sumSquared / count - mean * mean),
      gradient: gradient / gradientCount,
    };
  };
  const shape = statistics("shape.bin");
  const detail = statistics("detail.bin");
  const weather = statistics("weather.bin");
  const turbulence = statistics("turbulence.bin");
  for (const statistic of [shape, detail, weather, turbulence]) {
    assert.ok(statistic.mean > 0.1 && statistic.mean < 0.9);
    assert.ok(statistic.deviation > 0.05);
  }
  assert.ok(detail.gradient > shape.gradient * 2.0);
  assert.ok(weather.gradient > detail.gradient);
  assert.ok(weather.gradient < detail.gradient * 1.1);
  assert.ok(turbulence.gradient > weather.gradient * 2.0);
});

test("matches frozen generator-version reference texels", () => {
  const payloads = createPayloads();
  const expected = new Map([
    ["shape.bin", [141, 175, 173, 160, 202, 194]],
    ["detail.bin", [187, 167, 218, 169, 141, 133]],
    ["weather.bin", [95, 185, 224, 111, 95, 62]],
    ["turbulence.bin", [102, 239, 233, 131, 215, 4]],
    ["stbn.bin", [51, 170, 86, 29, 87, 242]],
  ]);
  for (const file of FILES) {
    const data = payloads.get(file.name);
    const indices = [
      0,
      1,
      17,
      257,
      Math.floor(data.length / 2),
      data.length - 1,
    ];
    const actual = indices.map((index) => data[index]);
    assert.deepEqual(actual, expected.get(file.name), file.name);
  }
});

test("publishes atomically and rejects tampered payload or provenance", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cloud-core-test-"));
  const target = path.join(root, "CloudCore");
  try {
    await publish(target);
    await verifyDirectory(target);
    const shapePath = path.join(target, "shape.bin");
    const shape = await fs.readFile(shapePath);
    shape[17] ^= 0xff;
    await fs.writeFile(shapePath, shape);
    await assert.rejects(verifyDirectory(target));
    await publish(target);
    const provenancePath = path.join(target, "PROVENANCE.json");
    const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
    provenance.algorithm.shape = "tampered";
    await fs.writeFile(provenancePath, JSON.stringify(provenance));
    await assert.rejects(verifyDirectory(target));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("restores the exact target after publication fails between backup and swap", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cloud-core-rollback-"));
  const target = path.join(root, "CloudCore");
  try {
    await publish(target);
    const names = [...FILES.map((file) => file.name), "PROVENANCE.json"];
    const before = new Map();
    for (const name of names) {
      before.set(name, await fs.readFile(path.join(target, name)));
    }

    let injected = false;
    await assert.rejects(
      publish(target, {
        afterBackup({ candidate, backup }) {
          injected = true;
          return Promise.reject(
            new Error(`injected after ${candidate} replaced by ${backup}`),
          );
        },
      }),
      /injected after/,
    );
    assert.equal(injected, true);
    await verifyDirectory(target);
    for (const name of names) {
      assert.deepEqual(
        await fs.readFile(path.join(target, name)),
        before.get(name),
      );
    }
    assert.deepEqual(await fs.readdir(root), ["CloudCore"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("tracked delivery byte-matches a full separate-target regeneration", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cloud-core-full-"));
  const target = path.join(root, "CloudCore");
  try {
    await publish(target);
    await verifyDirectory(target);
    await verifyDirectory(delivery);
    for (const file of [
      ...FILES.map((value) => value.name),
      "PROVENANCE.json",
    ]) {
      assert.deepEqual(
        await fs.readFile(path.join(target, file)),
        await fs.readFile(path.join(delivery, file)),
        file,
      );
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
