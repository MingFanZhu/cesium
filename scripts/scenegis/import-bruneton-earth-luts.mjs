#!/usr/bin/env node

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

const sourceCommit = "9c6dfd0054f077f3ad4695b802e74d4c6a814440";
const files = Object.freeze({
  "transmittance.bin": {
    source: "assets/transmittance.bin",
    bytes: 131072,
    sha256: "A2A0DD1464048D92E7BFDF385A9108E8D9C3E2748684F1F64523587D5894180A",
  },
  "scattering.bin": {
    source: "assets/scattering.bin",
    bytes: 8388608,
    sha256: "82C505FE6E3B7F1995C650CC8A1478F42BD510029BF63845E9485C078AEF6617",
  },
  "irradiance.bin": {
    source: "assets/irradiance.bin",
    bytes: 8192,
    sha256: "126BD4FF0419E04C877639CAF9E3CD64A139AE511CF315A23A0C989FC47B51A5",
  },
  "LICENSE.txt": {
    source: "LICENSE",
    bytes: 4239,
    sha256: "32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B",
  },
});

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const defaultTarget = path.join(
  repositoryRoot,
  "packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth",
);

export function parseArguments(argv) {
  let sourceDirectory;
  let targetDirectory = defaultTarget;
  let verifyOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--source-dir") {
      sourceDirectory = argv[++i];
    } else if (argument === "--target-dir") {
      targetDirectory = argv[++i];
    } else if (argument === "--verify-only") {
      verifyOnly = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!verifyOnly && !sourceDirectory) {
    throw new Error("--source-dir is required unless --verify-only is used.");
  }
  return {
    sourceDirectory: sourceDirectory && path.resolve(sourceDirectory),
    targetDirectory: path.resolve(targetDirectory),
    verifyOnly,
  };
}

async function hashFile(filePath) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

async function verifyFile(filePath, expected) {
  const metadata = await stat(filePath);
  if (metadata.size !== expected.bytes) {
    throw new Error(`${filePath} has ${metadata.size} bytes; expected ${expected.bytes}.`);
  }
  const sha256 = await hashFile(filePath);
  if (sha256 !== expected.sha256) {
    throw new Error(`${filePath} has SHA-256 ${sha256}; expected ${expected.sha256}.`);
  }
}

function createProvenance() {
  return {
    schemaVersion: 1,
    preset: "earth-bruneton-2017",
    source: {
      repository: "takram-design-engineering/three-geospatial",
      commit: sourceCommit,
      package: "packages/atmosphere",
      licensePath: "packages/atmosphere/LICENSE",
    },
    format: {
      byteOrder: "little-endian",
      channels: "RGBA",
      component: "IEEE-754 binary16",
      pixelDatatype: "HALF_FLOAT",
      textures: {
        transmittance: { dimensions: [256, 64], file: "transmittance.bin" },
        scattering: { dimensions: [256, 128, 32], file: "scattering.bin", combinedSingleMieRedInAlpha: true },
        irradiance: { dimensions: [64, 16], file: "irradiance.bin" },
      },
    },
    physicalPreset: {
      bottomRadiusMeters: 6360000,
      topRadiusMeters: 6420000,
      solarIrradiance: [1.474, 1.8504, 1.91198],
      sunAngularRadiusRadians: 0.004675,
      rayleighScaleHeightMeters: 8000,
      rayleighScatteringPerMeter: [5.802e-6, 1.3558e-5, 3.31e-5],
      mieScaleHeightMeters: 1200,
      mieScatteringPerMeter: [3.996e-6, 3.996e-6, 3.996e-6],
      mieExtinctionPerMeter: [4.44e-6, 4.44e-6, 4.44e-6],
      miePhaseFunctionG: 0.8,
      ozoneLayerCenterMeters: 25000,
      ozoneLayerWidthMeters: 15000,
      absorptionExtinctionPerMeter: [6.5e-7, 1.881e-6, 8.5e-8],
      groundAlbedo: [0.1, 0.1, 0.1],
    },
    files: Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        name,
        { bytes: value.bytes, sha256: value.sha256 },
      ]),
    ),
  };
}

export async function verifyTarget(targetDirectory) {
  for (const [name, expected] of Object.entries(files)) {
    await verifyFile(path.join(targetDirectory, name), expected);
  }
  const provenance = JSON.parse(
    await readFile(path.join(targetDirectory, "provenance.json"), "utf8"),
  );
  if (!isDeepStrictEqual(provenance, createProvenance())) {
    throw new Error(
      "provenance.json does not exactly match the approved combined RGBA16F manifest.",
    );
  }
}

export async function importAssets(sourceDirectory, targetDirectory) {
  for (const expected of Object.values(files)) {
    await verifyFile(path.join(sourceDirectory, expected.source), expected);
  }

  const parent = path.dirname(targetDirectory);
  await mkdir(parent, { recursive: true });
  const candidate = await mkdtemp(path.join(parent, ".bruneton-earth-candidate-"));
  const backup = `${targetDirectory}.previous`;
  let movedExisting = false;
  try {
    for (const [name, expected] of Object.entries(files)) {
      await copyFile(path.join(sourceDirectory, expected.source), path.join(candidate, name));
    }
    await writeFile(
      path.join(candidate, "provenance.json"),
      `${JSON.stringify(createProvenance(), undefined, 2)}\n`,
      "utf8",
    );
    await verifyTarget(candidate);

    try {
      await access(targetDirectory);
      await rm(backup, { recursive: true, force: true });
      await rename(targetDirectory, backup);
      movedExisting = true;
    } catch {
      // The target does not exist on first import.
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
}

const isMain =
  definedProcessEntry() === path.resolve(fileURLToPath(import.meta.url));

function definedProcessEntry() {
  return process.argv[1] ? path.resolve(process.argv[1]) : undefined;
}

if (isMain) {
  const options = parseArguments(process.argv.slice(2));
  if (options.verifyOnly) {
    await verifyTarget(options.targetDirectory);
  } else {
    await importAssets(options.sourceDirectory, options.targetDirectory);
  }
  process.stdout.write(
    `Verified Bruneton Earth LUT delivery at ${options.targetDirectory}.\n`,
  );
}
