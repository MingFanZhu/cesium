#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

export const generatorVersion = "scene-gis-flat-atmosphere-2";
export const dimensions = Object.freeze({
  transmittance: Object.freeze([256, 64]),
  scattering: Object.freeze([256, 128, 32]),
  irradiance: Object.freeze([64, 16]),
});

const physical = Object.freeze({
  atmosphereTopMeters: 60000,
  solarIrradiance: Object.freeze([1.474, 1.8504, 1.91198]),
  sunAngularRadiusRadians: 0.004675,
  rayleighScaleHeightMeters: 8000,
  rayleighScatteringPerMeter: Object.freeze([5.802e-6, 1.3558e-5, 3.31e-5]),
  mieScaleHeightMeters: 1200,
  mieScatteringPerMeter: Object.freeze([3.996e-6, 3.996e-6, 3.996e-6]),
  mieExtinctionPerMeter: Object.freeze([4.44e-6, 4.44e-6, 4.44e-6]),
  miePhaseFunctionG: 0.8,
  ozoneLayerCenterMeters: 25000,
  ozoneLayerWidthMeters: 15000,
  absorptionExtinctionPerMeter: Object.freeze([6.5e-7, 1.881e-6, 8.5e-8]),
  groundAlbedo: Object.freeze([0.1, 0.1, 0.1]),
});

const quadrature = Object.freeze({
  viewSamples: 12,
  angularZenithSamples: 12,
  angularAzimuthSamples: 8,
  multipleScatteringOrders: Object.freeze([2, 3, 4]),
  sourceHeightSamples: 32,
  sourceSunSamples: 32,
  mediumDistanceLimitMeters: 300000,
});

export const approvedFiles = Object.freeze({
  "transmittance.bin": Object.freeze({
    bytes: 131072,
    sha256: "5CD60C76237A4C6DC20CEB54BE1726C325A6898CD1B114E69FC3496A1A9FF851",
  }),
  "scattering.bin": Object.freeze({
    bytes: 8388608,
    sha256: "873162E5730406EF0183E0B16E7F6E79537268AC1F6BC38B2F0AADED5C9D7FB9",
  }),
  "irradiance.bin": Object.freeze({
    bytes: 8192,
    sha256: "0265335BDFAB584639965B920A5F668C4906D77C290D6D6805D6F3F199CCE278",
  }),
  "LICENSE.txt": Object.freeze({
    bytes: 4239,
    sha256: "32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B",
  }),
});

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const defaultTarget = path.join(
  repositoryRoot,
  "packages/engine/Source/Assets/SceneGIS/Environment/PlanarEarth",
);
const licenseSource = path.join(
  repositoryRoot,
  "packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/LICENSE.txt",
);

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function signedSquare(value) {
  return Math.sign(value) * value * value;
}

function texelSignedSquare(index, size) {
  return signedSquare((2 * (index + 0.5)) / size - 1);
}

function texelHeight(index, size) {
  const unit = (index + 0.5) / size;
  return physical.atmosphereTopMeters * unit * unit;
}

function density(height, scaleHeight) {
  return Math.exp(-Math.max(height, 0) / scaleHeight);
}

function ozoneDensity(height) {
  return Math.max(
    1 -
      Math.abs(height - physical.ozoneLayerCenterMeters) /
        physical.ozoneLayerWidthMeters,
    0,
  );
}

function exponentialIntegral(
  startHeight,
  endHeight,
  mu,
  distance,
  scaleHeight,
) {
  if (Math.abs(mu) < 1e-8) {
    return density(startHeight, scaleHeight) * distance;
  }
  return (
    (scaleHeight *
      Math.abs(
        Math.exp(-startHeight / scaleHeight) -
          Math.exp(-endHeight / scaleHeight),
      )) /
    Math.abs(mu)
  );
}

function ozoneIntegralToTop(height) {
  const clamped = Math.min(Math.max(height, 10000), 40000);
  if (clamped < 25000) {
    const offset = clamped - 10000;
    return 15000 - (offset * offset) / 30000;
  }
  const offset = 40000 - clamped;
  return (offset * offset) / 30000;
}

function ozoneIntegral(startHeight, endHeight, mu, distance) {
  if (Math.abs(mu) < 1e-8) {
    return ozoneDensity(startHeight) * distance;
  }
  return (
    Math.abs(ozoneIntegralToTop(startHeight) - ozoneIntegralToTop(endHeight)) /
    Math.abs(mu)
  );
}

export function boundaryDistance(height, mu) {
  if (mu > 1e-8) {
    return (physical.atmosphereTopMeters - height) / mu;
  }
  if (mu < -1e-8) {
    return -height / mu;
  }
  return Number.POSITIVE_INFINITY;
}

export function opticalDepth(startHeight, mu, distance) {
  const limited = Math.max(distance, 0);
  const endHeight = Number.isFinite(limited)
    ? Math.min(
        Math.max(startHeight + mu * limited, 0),
        physical.atmosphereTopMeters,
      )
    : startHeight;
  const rayleigh = exponentialIntegral(
    startHeight,
    endHeight,
    mu,
    limited,
    physical.rayleighScaleHeightMeters,
  );
  const mie = exponentialIntegral(
    startHeight,
    endHeight,
    mu,
    limited,
    physical.mieScaleHeightMeters,
  );
  const ozone = ozoneIntegral(startHeight, endHeight, mu, limited);
  return physical.rayleighScatteringPerMeter.map(
    (value, channel) =>
      value * rayleigh +
      physical.mieExtinctionPerMeter[channel] * mie +
      physical.absorptionExtinctionPerMeter[channel] * ozone,
  );
}

export function transmittance(
  height,
  mu,
  distance = boundaryDistance(height, mu),
) {
  return opticalDepth(height, mu, distance).map((value) => Math.exp(-value));
}

function extinctionAtHeight(height) {
  const rayleigh = density(height, physical.rayleighScaleHeightMeters);
  const mie = density(height, physical.mieScaleHeightMeters);
  const ozone = ozoneDensity(height);
  return physical.rayleighScatteringPerMeter.map(
    (value, channel) =>
      value * rayleigh +
      physical.mieExtinctionPerMeter[channel] * mie +
      physical.absorptionExtinctionPerMeter[channel] * ozone,
  );
}

function rayleighPhase(cosine) {
  return 0.05968310365 * (1 + cosine * cosine);
}

function miePhase(cosine) {
  const g = physical.miePhaseFunctionG;
  const denominator = Math.max(1 + g * g - 2 * g * cosine, 1e-4);
  return (
    (0.1193662073 * (1 - g * g) * (1 + cosine * cosine)) /
    ((2 + g * g) * Math.pow(denominator, 1.5))
  );
}

function sampleGrid(grid, height, sunMu, channels = 3) {
  const heightUnit = Math.sqrt(
    Math.min(Math.max(height / physical.atmosphereTopMeters, 0), 1),
  );
  const sunUnit =
    (Math.sign(sunMu) * Math.sqrt(Math.abs(Math.min(Math.max(sunMu, -1), 1))) +
      1) /
    2;
  const x = Math.min(Math.max(sunUnit * grid.width - 0.5, 0), grid.width - 1);
  const y = Math.min(
    Math.max(heightUnit * grid.height - 0.5, 0),
    grid.height - 1,
  );
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, grid.width - 1);
  const y1 = Math.min(y0 + 1, grid.height - 1);
  const tx = x - x0;
  const ty = y - y0;
  const result = new Array(channels);
  for (let channel = 0; channel < channels; channel++) {
    const a = grid.values[(y0 * grid.width + x0) * channels + channel];
    const b = grid.values[(y0 * grid.width + x1) * channels + channel];
    const c = grid.values[(y1 * grid.width + x0) * channels + channel];
    const d = grid.values[(y1 * grid.width + x1) * channels + channel];
    result[channel] =
      (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return result;
}

function scatteringSource(height, sunMu, cosineTheta, sourceGrid, includeSingle) {
  const sunT =
    sunMu > 0
      ? transmittance(height, sunMu)
      : physical.groundAlbedo.map(() => 0);
  const rayleigh = density(height, physical.rayleighScaleHeightMeters);
  const mie = density(height, physical.mieScaleHeightMeters);
  const multiple = sourceGrid
    ? sampleGrid(sourceGrid, height, sunMu)
    : [0, 0, 0];
  return physical.solarIrradiance.map((solar, channel) => {
    const single = includeSingle
      ? solar *
        sunT[channel] *
        (physical.rayleighScatteringPerMeter[channel] *
          rayleigh *
          rayleighPhase(cosineTheta) +
          physical.mieScatteringPerMeter[channel] *
            mie *
            miePhase(cosineTheta))
      : 0;
    return single + multiple[channel];
  });
}

function integrateTransport(
  height,
  viewMu,
  sunMu,
  cosineTheta,
  sourceGrid,
  includeSingle,
) {
  const distance = boundaryDistance(height, viewMu);
  if (!(distance > 0)) {
    return [0, 0, 0];
  }
  if (!Number.isFinite(distance)) {
    const source = scatteringSource(
      height,
      sunMu,
      cosineTheta,
      sourceGrid,
      includeSingle,
    );
    const extinction = extinctionAtHeight(height);
    return source.map(
      (value, channel) => value / Math.max(extinction[channel], 1e-30),
    );
  }
  const step = distance / quadrature.viewSamples;
  const radiance = [0, 0, 0];
  for (let sample = 0; sample < quadrature.viewSamples; sample++) {
    const alongStart = sample * step;
    const along = alongStart + 0.5 * step;
    const sampleHeight = Math.min(
      Math.max(height + viewMu * along, 0),
      physical.atmosphereTopMeters,
    );
    const viewT = transmittance(height, viewMu, alongStart);
    const source = scatteringSource(
      sampleHeight,
      sunMu,
      cosineTheta,
      sourceGrid,
      includeSingle,
    );
    const extinction = extinctionAtHeight(sampleHeight);
    for (let channel = 0; channel < 3; channel++) {
      const intervalWeight =
        -Math.expm1(-extinction[channel] * step) /
        Math.max(extinction[channel], 1e-30);
      radiance[channel] += viewT[channel] * source[channel] * intervalWeight;
    }
  }
  return radiance;
}

export function integrateSingleRadiance(
  height,
  viewMu,
  sunMu,
  cosineTheta,
) {
  return integrateTransport(
    height,
    viewMu,
    sunMu,
    cosineTheta,
    undefined,
    true,
  );
}

export function integrateSourceRadiance(
  height,
  viewMu,
  sunMu,
  cosineTheta,
  sourceGrid,
) {
  return integrateTransport(
    height,
    viewMu,
    sunMu,
    cosineTheta,
    sourceGrid,
    false,
  );
}

export function integrateTotalRadiance(
  height,
  viewMu,
  sunMu,
  cosineTheta,
  sourceGrid,
) {
  return integrateTransport(
    height,
    viewMu,
    sunMu,
    cosineTheta,
    sourceGrid,
    true,
  );
}

export function createMultipleSourceGrid(width, height, hooks = {}) {
  const singleRadiance = hooks.singleRadiance ?? integrateSingleRadiance;
  const sourceRadiance = hooks.sourceRadiance ?? integrateSourceRadiance;
  let previous = {
    width,
    height,
    values: new Float64Array(width * height * 3),
  };
  const accumulated = new Float64Array(width * height * 3);
  const orderEnergy = [];
  const orderGrids = [];
  for (const order of quadrature.multipleScatteringOrders) {
    const current = new Float64Array(width * height * 3);
    let energy = 0;
    for (let y = 0; y < height; y++) {
      const sampleHeight = texelHeight(y, height);
      const rayleigh = density(
        sampleHeight,
        physical.rayleighScaleHeightMeters,
      );
      const mie = density(sampleHeight, physical.mieScaleHeightMeters);
      for (let x = 0; x < width; x++) {
        const sunMu = texelSignedSquare(x, width);
        const meanRadiance = [0, 0, 0];
        for (
          let zenith = 0;
          zenith < quadrature.angularZenithSamples;
          zenith++
        ) {
          const incomingMu =
            -1 + (2 * (zenith + 0.5)) / quadrature.angularZenithSamples;
          for (
            let azimuth = 0;
            azimuth < quadrature.angularAzimuthSamples;
            azimuth++
          ) {
            const phi =
              (2 * Math.PI * (azimuth + 0.5)) /
              quadrature.angularAzimuthSamples;
            const cosineTheta =
              incomingMu * sunMu +
              Math.sqrt(Math.max(1 - incomingMu * incomingMu, 0)) *
                Math.sqrt(Math.max(1 - sunMu * sunMu, 0)) *
                Math.cos(phi);
            const incoming =
              order === 2
                ? singleRadiance(
                    sampleHeight,
                    incomingMu,
                    sunMu,
                    cosineTheta,
                  )
                : sourceRadiance(
                    sampleHeight,
                    incomingMu,
                    sunMu,
                    cosineTheta,
                    previous,
                  );
            for (let channel = 0; channel < 3; channel++) {
              meanRadiance[channel] += incoming[channel];
            }
          }
        }
        const angularCount =
          quadrature.angularZenithSamples * quadrature.angularAzimuthSamples;
        const offset = (y * width + x) * 3;
        for (let channel = 0; channel < 3; channel++) {
          const scattering =
            physical.rayleighScatteringPerMeter[channel] * rayleigh +
            physical.mieScatteringPerMeter[channel] * mie;
          const value = Math.max(
            (meanRadiance[channel] / angularCount) * scattering,
            0,
          );
          current[offset + channel] = value;
          accumulated[offset + channel] += value;
          energy += value;
        }
      }
    }
    orderEnergy.push(energy);
    previous = { width, height, values: current };
    orderGrids.push(previous);
  }
  return {
    grid: { width, height, values: accumulated },
    orderEnergy,
    orderGrids,
  };
}

export function computeIrradiance(height, sunMu, multipleGrid) {
  const directT = sunMu > 0 ? transmittance(height, sunMu) : [0, 0, 0];
  const irradiance = directT.map(
    (value, channel) =>
      physical.solarIrradiance[channel] * Math.max(sunMu, 0) * value,
  );
  const directionWeight =
    (2 * Math.PI) /
    (quadrature.angularZenithSamples * quadrature.angularAzimuthSamples);
  for (
    let zenith = 0;
    zenith < quadrature.angularZenithSamples;
    zenith++
  ) {
    const incomingMu =
      (zenith + 0.5) / quadrature.angularZenithSamples;
    for (
      let azimuth = 0;
      azimuth < quadrature.angularAzimuthSamples;
      azimuth++
    ) {
      const phi =
        (2 * Math.PI * (azimuth + 0.5)) /
        quadrature.angularAzimuthSamples;
      const cosineTheta =
        incomingMu * sunMu +
        Math.sqrt(Math.max(1 - incomingMu * incomingMu, 0)) *
          Math.sqrt(Math.max(1 - sunMu * sunMu, 0)) *
          Math.cos(phi);
      const incoming = integrateTotalRadiance(
        height,
        incomingMu,
        sunMu,
        cosineTheta,
        multipleGrid,
      );
      for (let channel = 0; channel < 3; channel++) {
        irradiance[channel] +=
          incoming[channel] * incomingMu * directionWeight;
      }
    }
  }
  return irradiance;
}

export function numberToFloat16(value) {
  if (Number.isNaN(value)) {
    return 0x7e00;
  }
  const clamped = Math.min(Math.max(value, -65504), 65504);
  const float = new Float32Array(1);
  const integer = new Uint32Array(float.buffer);
  float[0] = clamped;
  const bits = integer[0];
  const sign = (bits >>> 16) & 0x8000;
  let exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  let mantissa = bits & 0x7fffff;
  if (exponent <= 0) {
    if (exponent < -10) {
      return sign;
    }
    mantissa = (mantissa | 0x800000) >>> (1 - exponent);
    return sign | ((mantissa + 0x1000) >>> 13);
  }
  if (exponent >= 31) {
    return sign | 0x7bff;
  }
  mantissa += 0x1000;
  if (mantissa & 0x800000) {
    mantissa = 0;
    exponent++;
    if (exponent >= 31) {
      return sign | 0x7bff;
    }
  }
  return sign | (exponent << 10) | (mantissa >>> 13);
}

function encodeRgba(values, alpha = 1) {
  const buffer = Buffer.allocUnsafe(8);
  for (let channel = 0; channel < 3; channel++) {
    buffer.writeUInt16LE(numberToFloat16(values[channel]), channel * 2);
  }
  buffer.writeUInt16LE(numberToFloat16(alpha), 6);
  return buffer;
}

export function generateAssetBuffers(options = {}) {
  const sizes = options.dimensions ?? dimensions;
  const sourceWidth = options.sourceSunSamples ?? quadrature.sourceSunSamples;
  const sourceHeight =
    options.sourceHeightSamples ?? quadrature.sourceHeightSamples;
  const multiple = createMultipleSourceGrid(sourceWidth, sourceHeight);

  const [transWidth, transHeight] = sizes.transmittance;
  const transmittanceBuffer = Buffer.alloc(transWidth * transHeight * 8);
  for (let y = 0; y < transHeight; y++) {
    const height = texelHeight(y, transHeight);
    for (let x = 0; x < transWidth; x++) {
      const mu = texelSignedSquare(x, transWidth);
      encodeRgba(transmittance(height, mu)).copy(
        transmittanceBuffer,
        (y * transWidth + x) * 8,
      );
    }
  }

  const [scatterWidth, scatterHeight, scatterDepth] = sizes.scattering;
  const scatteringBuffer = Buffer.alloc(
    scatterWidth * scatterHeight * scatterDepth * 8,
  );
  for (let z = 0; z < scatterDepth; z++) {
    const height = texelHeight(z, scatterDepth);
    for (let y = 0; y < scatterHeight; y++) {
      const viewMu = texelSignedSquare(y, scatterHeight);
      for (let x = 0; x < scatterWidth; x++) {
        const nuIndex = x % 8;
        const sunIndex = Math.floor(x / 8);
        const sunCount = Math.max(Math.floor(scatterWidth / 8), 1);
        const sunMu = texelSignedSquare(sunIndex, sunCount);
        const nu = -1 + (2 * (nuIndex + 0.5)) / 8;
        const radiance = integrateTotalRadiance(
          height,
          viewMu,
          sunMu,
          nu,
          multiple.grid,
        );
        encodeRgba(radiance, Math.max(radiance[0], 0)).copy(
          scatteringBuffer,
          ((z * scatterHeight + y) * scatterWidth + x) * 8,
        );
      }
    }
  }

  const [irrWidth, irrHeight] = sizes.irradiance;
  const irradianceBuffer = Buffer.alloc(irrWidth * irrHeight * 8);
  for (let y = 0; y < irrHeight; y++) {
    const height = texelHeight(y, irrHeight);
    for (let x = 0; x < irrWidth; x++) {
      const sunMu = texelSignedSquare(x, irrWidth);
      const irradiance = computeIrradiance(height, sunMu, multiple.grid);
      encodeRgba(irradiance).copy(irradianceBuffer, (y * irrWidth + x) * 8);
    }
  }

  return {
    files: {
      "transmittance.bin": transmittanceBuffer,
      "scattering.bin": scatteringBuffer,
      "irradiance.bin": irradianceBuffer,
    },
    orderEnergy: multiple.orderEnergy,
    orderGrids: multiple.orderGrids,
  };
}

function fileManifest(files, license) {
  return {
    "transmittance.bin": {
      bytes: files["transmittance.bin"].byteLength,
      sha256: hash(files["transmittance.bin"]),
    },
    "scattering.bin": {
      bytes: files["scattering.bin"].byteLength,
      sha256: hash(files["scattering.bin"]),
    },
    "irradiance.bin": {
      bytes: files["irradiance.bin"].byteLength,
      sha256: hash(files["irradiance.bin"]),
    },
    "LICENSE.txt": {
      bytes: license.byteLength,
      sha256: hash(license),
    },
  };
}

function createProvenance(files) {
  return {
    schemaVersion: 1,
    preset: "earth-flat-precomputed-v1",
    generator: {
      path: "scripts/scenegis/generate-planar-earth-luts.mjs",
      version: generatorVersion,
      runtimeDependencies: [],
    },
    source: {
      model: "flat-slab radiative transport",
      coefficientAuthority: "Bruneton Earth 2017 preset",
      attribution:
        "Eric Bruneton, Precomputed Atmospheric Scattering; SceneGIS flat-slab adaptation",
      licenseFile: "LICENSE.txt",
    },
    format: {
      byteOrder: "little-endian",
      channels: "RGBA",
      component: "IEEE-754 binary16",
      pixelDatatype: "HALF_FLOAT",
      textures: {
        transmittance: {
          dimensions: dimensions.transmittance,
          file: "transmittance.bin",
          mapping: "x=signedSquare(viewZenithCosine), y=squareRoot(height/top)",
        },
        scattering: {
          dimensions: dimensions.scattering,
          file: "scattering.bin",
          mapping:
            "x=32 signedSquare(sunZenithCosine) blocks by 8 linear scatteringCosine samples, y=signedSquare(viewZenithCosine), z=squareRoot(height/top)",
          alpha: "unused; stores total RGB red for deterministic RGBA packing",
        },
        irradiance: {
          dimensions: dimensions.irradiance,
          file: "irradiance.bin",
          mapping: "x=signedSquare(sunZenithCosine), y=squareRoot(height/top)",
        },
      },
    },
    transport: {
      geometry: "fixed +Z flat slab [0,60000] meters",
      segmentRule:
        "intersect untruncated geometric ray with slab, then cap only in-medium length",
      quadrature,
      multipleScatteringOrders: quadrature.multipleScatteringOrders,
      runtimeEvaluation:
        "true-boundary entry/endpoint radiance differencing with analytic segment transmittance",
      boundaryEvaluation:
        "true slab boundary; exact horizontal uses semi-infinite optical limit",
      segmentTransmittance:
        "runtime analytic Rayleigh/Mie/ozone optical depth over the capped visible segment",
      groundBoundary:
        "irradiance stores direct solar plus cosine-weighted atmospheric diffuse irradiance; fixed ground albedo is applied once at runtime and is excluded from orders 2-4",
    },
    physicalPreset: physical,
    files,
  };
}

async function verifyFile(filePath, expected) {
  const metadata = await stat(filePath);
  if (metadata.size !== expected.bytes) {
    throw new Error(
      `${filePath} has ${metadata.size} bytes; expected ${expected.bytes}.`,
    );
  }
  const contents = await readFile(filePath);
  const actualHash = hash(contents);
  if (actualHash !== expected.sha256) {
    throw new Error(
      `${filePath} has SHA-256 ${actualHash}; expected ${expected.sha256}.`,
    );
  }
}

export async function verifyTarget(targetDirectory) {
  const provenance = JSON.parse(
    await readFile(path.join(targetDirectory, "provenance.json"), "utf8"),
  );
  for (const [name, expected] of Object.entries(approvedFiles)) {
    await verifyFile(path.join(targetDirectory, name), expected);
  }
  const canonical = createProvenance(approvedFiles);
  if (!isDeepStrictEqual(provenance, canonical)) {
    throw new Error(
      "provenance.json does not exactly match the PlanarEarth generator contract.",
    );
  }
}

export async function generateTarget(targetDirectory, hooks = {}) {
  const generated = (hooks.generate ?? generateAssetBuffers)();
  const license = await readFile(licenseSource);
  const manifest = fileManifest(generated.files, license);
  if (!isDeepStrictEqual(manifest, approvedFiles)) {
    throw new Error(
      "Generated bytes do not match the approved deterministic PlanarEarth manifest.",
    );
  }
  const parent = path.dirname(targetDirectory);
  await mkdir(parent, { recursive: true });
  const candidate = await mkdtemp(
    path.join(parent, ".planar-earth-candidate-"),
  );
  const backup = `${targetDirectory}.previous`;
  let movedExisting = false;
  try {
    for (const [name, contents] of Object.entries(generated.files)) {
      await writeFile(path.join(candidate, name), contents);
    }
    await copyFile(licenseSource, path.join(candidate, "LICENSE.txt"));
    await writeFile(
      path.join(candidate, "provenance.json"),
      `${JSON.stringify(createProvenance(manifest), undefined, 2)}\n`,
      "utf8",
    );
    await verifyTarget(candidate);
    if (hooks.beforePublish) {
      await hooks.beforePublish(candidate);
    }
    let targetExists = true;
    try {
      await access(targetDirectory);
    } catch {
      targetExists = false;
    }
    if (targetExists) {
      await rm(backup, { recursive: true, force: true });
      await rename(targetDirectory, backup);
      movedExisting = true;
      if (hooks.afterBackup) {
        await hooks.afterBackup(backup);
      }
    }
    await rename(candidate, targetDirectory);
    if (movedExisting) {
      await rm(backup, { recursive: true, force: true });
    }
  } catch (error) {
    await rm(candidate, { recursive: true, force: true });
    if (movedExisting) {
      await rename(backup, targetDirectory);
    }
    throw error;
  }
  return { manifest, orderEnergy: generated.orderEnergy };
}

export function parseArguments(argv) {
  let targetDirectory = defaultTarget;
  let verifyOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--target-dir") {
      targetDirectory = path.resolve(argv[++i]);
    } else if (argument === "--verify-only") {
      verifyOnly = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return { targetDirectory, verifyOnly };
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entry === path.resolve(fileURLToPath(import.meta.url))) {
  const options = parseArguments(process.argv.slice(2));
  if (options.verifyOnly) {
    await verifyTarget(options.targetDirectory);
  } else {
    await generateTarget(options.targetDirectory);
  }
  process.stdout.write(
    `Verified Planar Earth LUT delivery at ${options.targetDirectory}.\n`,
  );
}
