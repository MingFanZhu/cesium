import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const GENERATOR_VERSION = 4;
const SEED = 0x4a17c9e3;
const FILES = Object.freeze([
  { name: "shape.bin", dimensions: [128, 128, 128], channels: 4 },
  { name: "detail.bin", dimensions: [64, 64, 64], channels: 4 },
  { name: "weather.bin", dimensions: [256, 256], channels: 4 },
  { name: "turbulence.bin", dimensions: [64, 64, 64], channels: 4 },
  { name: "stbn.bin", dimensions: [128, 128, 64], channels: 1 },
]);

function hash32(value) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function latticeHash(x, y, z, salt) {
  return hash32(
    SEED ^
      Math.imul(x, 0x1f123bb5) ^
      Math.imul(y, 0x5f356495) ^
      Math.imul(z, 0x6c8e9cf5) ^
      salt,
  );
}

function fade(value) {
  return value * value * value * (value * (value * 6.0 - 15.0) + 10.0);
}

function mix(left, right, amount) {
  return left + (right - left) * amount;
}

function wrap(value, period) {
  return ((value % period) + period) % period;
}

function valueNoise3(x, y, z, period, salt) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const tz = fade(z - z0);
  const sample = (ix, iy, iz) =>
    latticeHash(wrap(ix, period), wrap(iy, period), wrap(iz, period), salt) /
    0xffffffff;
  const lower = mix(
    mix(sample(x0, y0, z0), sample(x0 + 1, y0, z0), tx),
    mix(sample(x0, y0 + 1, z0), sample(x0 + 1, y0 + 1, z0), tx),
    ty,
  );
  const upper = mix(
    mix(sample(x0, y0, z0 + 1), sample(x0 + 1, y0, z0 + 1), tx),
    mix(sample(x0, y0 + 1, z0 + 1), sample(x0 + 1, y0 + 1, z0 + 1), tx),
    ty,
  );
  return mix(lower, upper, tz);
}

function valueNoise2(x, y, period, salt) {
  return valueNoise3(x, y, 0.0, period, salt);
}

function worley3(x, y, z, period, salt) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const cellZ = Math.floor(z);
  let minimum = Number.POSITIVE_INFINITY;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ix = cellX + dx;
        const iy = cellY + dy;
        const iz = cellZ + dz;
        const base = latticeHash(
          wrap(ix, period),
          wrap(iy, period),
          wrap(iz, period),
          salt,
        );
        const fx = ix + hash32(base ^ 0x68bc21eb) / 0xffffffff;
        const fy = iy + hash32(base ^ 0x02e5be93) / 0xffffffff;
        const fz = iz + hash32(base ^ 0x967a889b) / 0xffffffff;
        const ddx = x - fx;
        const ddy = y - fy;
        const ddz = z - fz;
        minimum = Math.min(minimum, ddx * ddx + ddy * ddy + ddz * ddz);
      }
    }
  }
  return Math.min(Math.sqrt(minimum) / Math.sqrt(3.0), 1.0);
}

function byte(value) {
  return Math.round(Math.min(Math.max(value, 0.0), 1.0) * 255.0);
}

function volumeCoordinate(index, size, period) {
  return (index / (size - 1)) * period;
}

function generateShape() {
  const size = 128;
  const output = Buffer.alloc(size * size * size * 4);
  let offset = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = volumeCoordinate(x, size, 8);
        const py = volumeCoordinate(y, size, 8);
        const pz = volumeCoordinate(z, size, 8);
        const base =
          valueNoise3(px, py, pz, 8, 0x11) * 0.625 +
          valueNoise3(px * 2, py * 2, pz * 2, 16, 0x12) * 0.25 +
          valueNoise3(px * 4, py * 4, pz * 4, 32, 0x13) * 0.125;
        const worley1 = 1.0 - worley3(px, py, pz, 8, 0x21);
        const worley2 = 1.0 - worley3(px * 2, py * 2, pz * 2, 16, 0x22);
        const worley4 = 1.0 - worley3(px * 4, py * 4, pz * 4, 32, 0x23);
        output[offset++] = byte(base * 0.7 + worley1 * 0.3);
        output[offset++] = byte(worley1);
        output[offset++] = byte(worley2);
        output[offset++] = byte(worley4);
      }
    }
  }
  return output;
}

function generateDetail() {
  const size = 64;
  const output = Buffer.alloc(size * size * size * 4);
  let offset = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = volumeCoordinate(x, size, 8);
        const py = volumeCoordinate(y, size, 8);
        const pz = volumeCoordinate(z, size, 8);
        const channels = [1, 2, 4, 8].map(
          (octave, index) =>
            1.0 -
            worley3(
              px * octave,
              py * octave,
              pz * octave,
              8 * octave,
              0x31 + index,
            ),
        );
        for (const value of channels) {
          output[offset++] = byte(value);
        }
      }
    }
  }
  return output;
}

function generateWeather() {
  const size = 256;
  const uniqueSize = size - 1;
  const output = Buffer.alloc(size * size * 4);
  const channels = Array.from(
    { length: 4 },
    () => new Float64Array(uniqueSize * uniqueSize),
  );
  for (let y = 0; y < uniqueSize; y++) {
    for (let x = 0; x < uniqueSize; x++) {
      const px = volumeCoordinate(x, size, 16);
      const py = volumeCoordinate(y, size, 16);
      const macro = (salt) =>
        valueNoise2(px, py, 16, salt) * 0.62 +
        valueNoise2(px * 2, py * 2, 32, salt + 1) * 0.26 +
        valueNoise2(px * 4, py * 4, 64, salt + 2) * 0.12;
      const index = y * uniqueSize + x;
      channels[0][index] = macro(0x41);
      channels[1][index] = macro(0x51);
      channels[2][index] = macro(0x61);
      channels[3][index] = macro(0x71);
    }
  }
  const rankedChannels = channels.map((values) => {
    const indices = Array.from(values.keys()).sort(
      (left, right) => values[left] - values[right] || left - right,
    );
    const ranked = new Uint8Array(values.length);
    let start = 0;
    while (start < indices.length) {
      let end = start + 1;
      while (
        end < indices.length &&
        values[indices[end]] === values[indices[start]]
      ) {
        end++;
      }
      const midRank = (start + end - 1) * 0.5;
      const value = Math.round(
        (midRank / Math.max(indices.length - 1, 1)) * 255.0,
      );
      for (let rank = start; rank < end; rank++) {
        ranked[indices[rank]] = value;
      }
      start = end;
    }
    return ranked;
  });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const source = (y % uniqueSize) * uniqueSize + (x % uniqueSize);
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        output[offset + channel] = rankedChannels[channel][source];
      }
    }
  }
  return output;
}

function generateTurbulence() {
  const size = 64;
  const output = Buffer.alloc(size * size * size * 4);
  const scalar = (x, y, z, salt) =>
    valueNoise3(x, y, z, 8, salt) * 0.7 +
    valueNoise3(x * 2, y * 2, z * 2, 16, salt + 1) * 0.3;
  let offset = 0;
  const epsilon = 0.05;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = volumeCoordinate(x, size, 8);
        const py = volumeCoordinate(y, size, 8);
        const pz = volumeCoordinate(z, size, 8);
        const derivative = (salt, axis) => {
          const delta = [0.0, 0.0, 0.0];
          delta[axis] = epsilon;
          return (
            (scalar(px + delta[0], py + delta[1], pz + delta[2], salt) -
              scalar(px - delta[0], py - delta[1], pz - delta[2], salt)) /
            (2.0 * epsilon)
          );
        };
        const curlX = derivative(0x81, 1) - derivative(0x91, 2);
        const curlY = derivative(0x91, 0) - derivative(0x71, 2);
        const curlZ = derivative(0x71, 1) - derivative(0x81, 0);
        const magnitude = Math.hypot(curlX, curlY, curlZ);
        const scale = magnitude > 0.0 ? 0.5 / magnitude : 0.0;
        output[offset++] = byte(curlX * scale + 0.5);
        output[offset++] = byte(curlY * scale + 0.5);
        output[offset++] = byte(curlZ * scale + 0.5);
        output[offset++] = byte(Math.min(magnitude * 0.75, 1.0));
      }
    }
  }
  return output;
}

function generateStbn() {
  const width = 128;
  const height = 128;
  const depth = 64;
  const sliceSize = width * height;
  const output = Buffer.alloc(sliceSize * depth);
  const raw = (x, y, z) =>
    latticeHash(wrap(x, width), wrap(y, height), wrap(z, depth), 0xa1) /
    0xffffffff;
  for (let z = 0; z < depth; z++) {
    const ranked = new Array(sliceSize);
    let index = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const center = raw(x, y, z);
        const spatialLow =
          (raw(x - 1, y, z) +
            raw(x + 1, y, z) +
            raw(x, y - 1, z) +
            raw(x, y + 1, z)) *
          0.25;
        const temporalLow = (raw(x, y, z - 1) + raw(x, y, z + 1)) * 0.5;
        ranked[index] = {
          index,
          value: center * 2.0 - spatialLow - temporalLow,
        };
        index++;
      }
    }
    ranked.sort(
      (left, right) => left.value - right.value || left.index - right.index,
    );
    for (let rank = 0; rank < sliceSize; rank++) {
      output[z * sliceSize + ranked[rank].index] = Math.floor(
        (rank * 256) / sliceSize,
      );
    }
  }
  return output;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function createPayloads() {
  return new Map([
    ["shape.bin", generateShape()],
    ["detail.bin", generateDetail()],
    ["weather.bin", generateWeather()],
    ["turbulence.bin", generateTurbulence()],
    ["stbn.bin", generateStbn()],
  ]);
}

function createProvenance(payloads) {
  return {
    schemaVersion: 2,
    generator: "scripts/scenegis/generate-cloud-core-assets.mjs",
    generatorVersion: GENERATOR_VERSION,
    seed: `0x${SEED.toString(16).toUpperCase()}`,
    byteOrder: "little-endian raw texel order, x-fastest then y then z",
    copiedBinaries: 0,
    copiedSource: 0,
    references: {
      license: "Repository Apache-2.0; all binary texels are generator output",
      guerrilla:
        "Nubis and The Real-time Volumetric Cloudscapes of Horizon Zero Dawn",
      stbn: "Wolfe et al. 2021, Scalar Spatiotemporal Blue Noise Masks",
    },
    algorithm: {
      shape: "128-cubed periodic gradient-value and Worley base/FBM channels",
      detail:
        "64-cubed periodic high-frequency Worley erosion and ridge channels",
      weather:
        "256-squared four independent periodic empirical-CDF rank-normalized 15-kilometer macro-weather fields",
      turbulence:
        "64-cubed finite-difference curl field with encoded direction and magnitude",
      stbn: "128x128x64 deterministic spatial-temporal high-pass rank volume",
    },
    files: FILES.map((file) => {
      const payload = payloads.get(file.name);
      return {
        name: file.name,
        format: file.channels === 1 ? "R8" : "RGBA8",
        dimensions: file.dimensions,
        channels: file.channels,
        bytes: payload.length,
        sha256: sha256(payload),
      };
    }),
    totalBinaryBytes: [...payloads.values()].reduce(
      (sum, payload) => sum + payload.length,
      0,
    ),
  };
}

async function verifyDirectory(target, expectedPayloads = createPayloads()) {
  const expectedProvenance = createProvenance(expectedPayloads);
  const actualProvenance = JSON.parse(
    await fs.readFile(path.join(target, "PROVENANCE.json"), "utf8"),
  );
  assert.deepEqual(actualProvenance, expectedProvenance);
  for (const file of FILES) {
    const actual = await fs.readFile(path.join(target, file.name));
    assert.deepEqual(actual, expectedPayloads.get(file.name));
  }
  return expectedProvenance;
}

async function publish(target, publicationHooks = {}) {
  const parent = path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  const candidate = await fs.mkdtemp(
    path.join(parent, ".cloud-core-candidate-"),
  );
  const backup = `${target}.backup-${process.pid}`;
  const payloads = createPayloads();
  let movedExisting = false;
  try {
    for (const [name, payload] of payloads) {
      await fs.writeFile(path.join(candidate, name), payload, { flag: "wx" });
    }
    const provenance = `${JSON.stringify(createProvenance(payloads), null, 2)}\n`;
    await fs.writeFile(path.join(candidate, "PROVENANCE.json"), provenance, {
      flag: "wx",
    });
    await verifyDirectory(candidate, payloads);
    try {
      await fs.rename(target, backup);
      movedExisting = true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    if (movedExisting && publicationHooks.afterBackup !== undefined) {
      await publicationHooks.afterBackup({ target, candidate, backup });
    }
    await fs.rename(candidate, target);
    if (movedExisting) {
      await fs.rm(backup, { recursive: true, force: true });
    }
    return createProvenance(payloads);
  } catch (error) {
    await fs.rm(candidate, { recursive: true, force: true });
    if (movedExisting) {
      try {
        await fs.rename(backup, target);
      } catch {
        // Preserve the original publication error; the backup remains recoverable.
      }
    }
    throw error;
  }
}

function parseArguments(argv) {
  const targetIndex = argv.indexOf("--target");
  if (targetIndex < 0 || !argv[targetIndex + 1]) {
    throw new Error("--target <directory> is required.");
  }
  return {
    target: path.resolve(argv[targetIndex + 1]),
    verifyOnly: argv.includes("--verify-only"),
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const options = parseArguments(process.argv.slice(2));
  const provenance = options.verifyOnly
    ? await verifyDirectory(options.target)
    : await publish(options.target);
  process.stdout.write(
    `CloudCore assets verified: ${provenance.totalBinaryBytes} bytes\n`,
  );
}

export { FILES, createPayloads, createProvenance, publish, verifyDirectory };
