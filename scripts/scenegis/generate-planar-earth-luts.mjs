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

import {
  coefficientCount,
  cosineBasis,
  relativeAzimuth,
  phaseEigenvalues,
  gaussLegendre,
  evaluateCoefficients,
} from "./planar-scattering-harmonics.mjs";

export const generatorVersion = "scene-gis-flat-atmosphere-5";
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
  viewSamples: 24,
  viewParameter: "per-channel absorbed transmittance",
  minimumViewTransmittance: 2 ** -24,
  angularZenithSamples: 32,
  angularRule: "Gauss-Legendre split at the horizon, periodic azimuth",
  harmonicDegree: 16,
  angularAzimuthSamples: 64,
  multipleScatteringOrders: Object.freeze([2, 3, 4]),
  sourceHeightSamples: 32,
  sourceSunSamples: 32,
});

const hemisphereNodes = gaussLegendre(
  quadrature.angularZenithSamples / 2,
  0,
  1,
);

export const approvedFiles = Object.freeze({
  "transmittance.bin": Object.freeze({
    bytes: 131072,
    sha256: "5CD60C76237A4C6DC20CEB54BE1726C325A6898CD1B114E69FC3496A1A9FF851",
  }),
  "scattering.bin": Object.freeze({
    bytes: 8388608,
    sha256: "172FD773426B5223A9490B8B7D008FC6B7ADEF2A2AF82A216AE431F1CC5FC7E1",
  }),
  "irradiance.bin": Object.freeze({
    bytes: 8192,
    sha256: "7634B9DCD8132387FDA3C5F660C211B195D6CABCC72B82532487DA57C0E473BC",
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

function createTransportSamples(height, viewMu) {
  const boundary = boundaryDistance(height, viewMu);
  if (!(boundary > 0) || !Number.isFinite(boundary)) {
    return [];
  }
  const boundaryDepth = opticalDepth(height, viewMu, boundary);
  function distanceAtDepth(depth, channel) {
    let near = 0;
    let far = boundary;
    for (let iteration = 0; iteration < 48; iteration++) {
      const middle = (near + far) * 0.5;
      if (opticalDepth(height, viewMu, middle)[channel] < depth) {
        near = middle;
      } else {
        far = middle;
      }
    }
    return (near + far) * 0.5;
  }
  const samples = [];
  for (let channel = 0; channel < 3; channel++) {
    // L = integral(source / extinction d(1 - T)); resolve each color's path.
    const depthLimit = Math.min(
      boundaryDepth[channel],
      -Math.log(quadrature.minimumViewTransmittance),
    );
    const absorbed = -Math.expm1(-depthLimit);
    for (let index = 0; index < quadrature.viewSamples; index++) {
      const along = distanceAtDepth(
        -Math.log1p((-absorbed * (index + 0.5)) / quadrature.viewSamples),
        channel,
      );
      const sampleHeight = height + viewMu * along;
      samples.push({
        height: sampleHeight,
        channel,
        weight:
          absorbed /
          (quadrature.viewSamples * extinctionAtHeight(sampleHeight)[channel]),
      });
    }
  }
  return samples;
}

// Integrate direction-independent coefficients once per height/view/Sun path.
// In a flat atmosphere the view and Sun angles are constant along the path.
function integrateTransportCoefficients(
  height,
  viewMu,
  sunMu,
  sourceGrid,
  includeSingle,
  samples,
) {
  const degree = sourceGrid?.degree ?? 0;
  const result = {
    degree,
    rayleigh: [0, 0, 0],
    mie: [0, 0, 0],
    multiple: new Float64Array(3 * coefficientCount(degree)),
  };
  const distance = boundaryDistance(height, viewMu);
  if (!(distance > 0)) {
    return result;
  }
  const path = Number.isFinite(distance)
    ? (samples ?? createTransportSamples(height, viewMu))
    : extinctionAtHeight(height).map((extinction, channel) => ({
        height,
        channel,
        weight: 1 / extinction,
      }));
  for (const sample of path) {
    const c = sample.channel;
    if (includeSingle && sunMu > 0) {
      const solar =
        physical.solarIrradiance[c] *
        transmittance(sample.height, sunMu)[c] *
        sample.weight;
      result.rayleigh[c] +=
        solar *
        physical.rayleighScatteringPerMeter[c] *
        density(sample.height, physical.rayleighScaleHeightMeters);
      result.mie[c] +=
        solar *
        physical.mieScatteringPerMeter[c] *
        density(sample.height, physical.mieScaleHeightMeters);
    }
    if (sourceGrid) {
      const source = sampleGrid(
        sourceGrid,
        sample.height,
        sunMu,
        result.multiple.length,
      );
      for (let i = c; i < source.length; i += 3) {
        result.multiple[i] += source[i] * sample.weight;
      }
    }
  }
  return result;
}

function evaluateTransport(transport, viewMu, sunMu, nu, basis) {
  const multiple = evaluateCoefficients(
    transport.multiple,
    basis ??
      cosineBasis(transport.degree, viewMu, relativeAzimuth(viewMu, sunMu, nu)),
  );
  return multiple.map(
    (value, c) =>
      value +
      transport.rayleigh[c] * rayleighPhase(nu) +
      transport.mie[c] * miePhase(nu),
  );
}

function integrateTransport(
  height,
  viewMu,
  sunMu,
  cosineTheta,
  sourceGrid,
  includeSingle,
  samples,
) {
  return evaluateTransport(
    integrateTransportCoefficients(
      height,
      viewMu,
      sunMu,
      sourceGrid,
      includeSingle,
      samples,
    ),
    viewMu,
    sunMu,
    cosineTheta,
  );
}

export function sampleMultipleSource(grid, height, viewMu, sunMu, nu) {
  return evaluateCoefficients(
    sampleGrid(grid, height, sunMu, coefficientCount(grid.degree) * 3),
    cosineBasis(grid.degree, viewMu, relativeAzimuth(viewMu, sunMu, nu)),
  );
}

export function integrateSingleRadiance(
  height,
  viewMu,
  sunMu,
  cosineTheta,
  samples,
) {
  return integrateTransport(
    height,
    viewMu,
    sunMu,
    cosineTheta,
    undefined,
    true,
    samples,
  );
}

export function integrateSourceRadiance(
  height,
  viewMu,
  sunMu,
  cosineTheta,
  sourceGrid,
  samples,
) {
  return integrateTransport(
    height,
    viewMu,
    sunMu,
    cosineTheta,
    sourceGrid,
    false,
    samples,
  );
}

export function integrateTotalRadiance(
  height,
  viewMu,
  sunMu,
  cosineTheta,
  sourceGrid,
  samples,
) {
  return integrateTransport(
    height,
    viewMu,
    sunMu,
    cosineTheta,
    sourceGrid,
    true,
    samples,
  );
}

export function createMultipleSourceGrid(width, height, options = {}) {
  const degree = options.harmonicDegree ?? quadrature.harmonicDegree;
  const channels = coefficientCount(degree) * 3;
  const zenithCount =
    options.angularZenithSamples ?? quadrature.angularZenithSamples;
  const azimuthCount =
    options.angularAzimuthSamples ?? quadrature.angularAzimuthSamples;
  const directions = [
    ...gaussLegendre(zenithCount / 2, -1, 0),
    ...gaussLegendre(zenithCount / 2, 0, 1),
  ].map((node) => ({
    ...node,
    azimuths: Array.from(Array(azimuthCount).keys(), (k) => {
      const phi = (2 * Math.PI * (k + 0.5)) / azimuthCount;
      return { phi, basis: cosineBasis(degree, node.mu, phi) };
    }),
  }));
  const groundAlbedo = options.groundAlbedo ?? physical.groundAlbedo;
  const paths = Array.from(Array(height).keys(), (y) =>
    directions.map(({ mu }) =>
      createTransportSamples(texelHeight(y, height), mu),
    ),
  );
  const makeGrid = () => ({
    width,
    height,
    degree,
    values: new Float64Array(width * height * channels),
  });
  let previous = makeGrid();
  const accumulated = makeGrid();
  const orderEnergy = [];
  const orderGrids = [];
  const groundIrradianceOrders = [];
  const groundPaths = hemisphereNodes.map(({ mu }) =>
    createTransportSamples(0, mu),
  );
  let groundIrradiance = Array.from(Array(width).keys(), (x) =>
    directIrradiance(0, texelSignedSquare(x, width)),
  );
  for (const order of quadrature.multipleScatteringOrders) {
    // A ground reflection is one event: order n receives ground irradiance n-2.
    groundIrradianceOrders.push(groundIrradiance);
    const current = makeGrid();
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
        const moments = new Float64Array(channels);
        for (let j = 0; j < directions.length; j++) {
          const { mu, weight, azimuths } = directions[j];
          const groundT = mu < 0 ? transmittance(sampleHeight, mu) : [0, 0, 0];
          const transport = integrateTransportCoefficients(
            sampleHeight,
            mu,
            sunMu,
            order === 2 ? undefined : previous,
            order === 2,
            paths[y][j],
          );
          for (const { phi, basis } of azimuths) {
            const nu =
              mu * sunMu +
              Math.sqrt((1 - mu * mu) * (1 - sunMu * sunMu)) * Math.cos(phi);
            const incoming =
              order === 2 && options.singleRadiance
                ? options.singleRadiance(
                    sampleHeight,
                    mu,
                    sunMu,
                    nu,
                    paths[y][j],
                  )
                : order > 2 && options.sourceRadiance
                  ? options.sourceRadiance(
                      sampleHeight,
                      mu,
                      sunMu,
                      nu,
                      previous,
                      paths[y][j],
                    )
                  : evaluateTransport(
                      transport,
                      mu,
                      sunMu,
                      nu,
                      order === 2 ? undefined : basis,
                    );
            for (let c = 0; c < 3; c++) {
              const value =
                ((incoming[c] +
                  (groundT[c] * groundAlbedo[c] * groundIrradiance[x][c]) /
                    Math.PI) *
                  weight *
                  2 *
                  Math.PI) /
                azimuthCount;
              for (let k = 0; k < basis.length; k++) {
                moments[3 * k + c] += value * basis[k];
              }
            }
          }
        }
        const offset = (y * width + x) * channels;
        for (let l = 0; l <= degree; l++) {
          const phase = phaseEigenvalues(l, physical.miePhaseFunctionG);
          for (let m = 0; m <= l; m++) {
            for (let c = 0; c < 3; c++) {
              const k = 3 * ((l * (l + 1)) / 2 + m) + c;
              const value =
                moments[k] *
                (physical.rayleighScatteringPerMeter[c] *
                  rayleigh *
                  phase.rayleigh +
                  physical.mieScatteringPerMeter[c] * mie * phase.mie);
              current.values[offset + k] = value;
              accumulated.values[offset + k] += value;
              // The zeroth moment alone measures angular mean energy.
              if (l === 0) {
                energy += value / Math.sqrt(4 * Math.PI);
              }
            }
          }
        }
      }
    }
    orderEnergy.push(energy);
    if (order < quadrature.multipleScatteringOrders.at(-1)) {
      groundIrradiance = [];
      for (let x = 0; x < width; x++) {
        groundIrradiance.push(
          diffuseIrradiance(
            0,
            texelSignedSquare(x, width),
            order === 2 ? undefined : previous,
            groundPaths,
            order === 2,
          ),
        );
      }
    }
    previous = current;
    orderGrids.push(current);
  }
  return { grid: accumulated, orderEnergy, orderGrids, groundIrradianceOrders };
}

function directIrradiance(height, sunMu) {
  const directT = sunMu > 0 ? transmittance(height, sunMu) : [0, 0, 0];
  return directT.map(
    (value, channel) =>
      physical.solarIrradiance[channel] * Math.max(sunMu, 0) * value,
  );
}

function diffuseIrradiance(height, sunMu, multipleGrid, paths, includeSingle) {
  const irradiance = [0, 0, 0];
  for (let j = 0; j < hemisphereNodes.length; j++) {
    const { mu, weight } = hemisphereNodes[j];
    const transport = integrateTransportCoefficients(
      height,
      mu,
      sunMu,
      multipleGrid,
      includeSingle,
      paths?.[j],
    );
    for (let k = 0; k < quadrature.angularAzimuthSamples; k++) {
      const phi = (2 * Math.PI * (k + 0.5)) / quadrature.angularAzimuthSamples;
      const nu =
        mu * sunMu +
        Math.sqrt((1 - mu * mu) * (1 - sunMu * sunMu)) * Math.cos(phi);
      const incoming = evaluateTransport(
        transport,
        mu,
        sunMu,
        nu,
        cosineBasis(transport.degree, mu, phi),
      );
      for (let c = 0; c < 3; c++) {
        irradiance[c] +=
          (incoming[c] * mu * weight * 2 * Math.PI) /
          quadrature.angularAzimuthSamples;
      }
    }
  }
  return irradiance;
}

export function computeIrradiance(height, sunMu, multipleGrid, paths) {
  const direct = directIrradiance(height, sunMu);
  const diffuse = diffuseIrradiance(height, sunMu, multipleGrid, paths, true);
  return direct.map((value, channel) => value + diffuse[channel]);
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
  const multiple = createMultipleSourceGrid(sourceWidth, sourceHeight, {
    ...options,
    groundAlbedo: options.groundAlbedo,
  });

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
      const samples = createTransportSamples(height, viewMu);
      const sunCount = Math.max(Math.floor(scatterWidth / 8), 1);
      for (let sunIndex = 0; sunIndex < sunCount; sunIndex++) {
        const sunMu = texelSignedSquare(sunIndex, sunCount);
        const transport = integrateTransportCoefficients(
          height,
          viewMu,
          sunMu,
          multiple.grid,
          true,
          samples,
        );
        for (let nuIndex = 0; nuIndex < 8; nuIndex++) {
          const x = sunIndex * 8 + nuIndex;
          const nu = -1 + (2 * (nuIndex + 0.5)) / 8;
          const radiance = evaluateTransport(transport, viewMu, sunMu, nu);
          encodeRgba(radiance, Math.max(radiance[0], 0)).copy(
            scatteringBuffer,
            ((z * scatterHeight + y) * scatterWidth + x) * 8,
          );
        }
      }
    }
  }

  const [irrWidth, irrHeight] = sizes.irradiance;
  const irradianceBuffer = Buffer.alloc(irrWidth * irrHeight * 8);
  for (let y = 0; y < irrHeight; y++) {
    const height = texelHeight(y, irrHeight);
    const paths = hemisphereNodes.map(({ mu }) =>
      createTransportSamples(height, mu),
    );
    for (let x = 0; x < irrWidth; x++) {
      const sunMu = texelSignedSquare(x, irrWidth);
      const irradiance = computeIrradiance(height, sunMu, multiple.grid, paths);
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
        "intersect untruncated geometric ray with slab and retain the complete visible segment",
      quadrature,
      scatteringDensity:
        "real cosine spherical harmonics; separate normalized Rayleigh and Cornette-Shanks Mie phase convolution; direction-resolved orders 2-4",
      multipleScatteringOrders: quadrature.multipleScatteringOrders,
      runtimeEvaluation:
        "true-boundary entry/endpoint radiance differencing with analytic segment transmittance",
      boundaryEvaluation:
        "optical-depth quadrature to the true slab boundary or binary16 transmittance floor; exact horizontal uses semi-infinite optical limit",
      segmentTransmittance:
        "runtime analytic Rayleigh/Mie/ozone optical depth over the complete visible segment",
      groundBoundary:
        "order n includes transmittance-to-ground times Lambert albedo/pi times ground irradiance of order n-2 (direct for n=2, cosine-weighted single-order atmospheric diffuse thereafter); scattering stores atmospheric paths only, and the final visible ground reflection is applied once at runtime",
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
