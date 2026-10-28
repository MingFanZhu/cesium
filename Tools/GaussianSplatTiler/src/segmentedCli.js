#!/usr/bin/env node
import process from "node:process";
import {
  buildSegmentedGaussianScene,
  inspectSegmentedGaussianScene,
  validateSegmentedGaussianScene,
} from "./segmentedBuilder.js";

const OPTION_NAMES = new Set([
  "output",
  "workers",
  "batch-size",
  "temporary-directory",
  "maximum-chunk-splats",
  "fixed-grid-origin",
  "tile-size",
  "max-pack-bytes",
  "coordinate-system",
  "local-origin",
  "local-to-fixed",
  "meters-per-unit",
]);

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const options = {};
  for (let index = 0; index < rest.length; index++) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    if (!OPTION_NAMES.has(name)) {
      throw new Error(`Unknown option --${name}`);
    }
    const optionValue = rest[++index];
    if (optionValue === undefined || optionValue.startsWith("--")) {
      throw new Error(`Option --${name} requires a value`);
    }
    options[name] = optionValue;
  }
  return { command, positional, options };
}

function integer(value, name) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return result;
}

function numberList(value, count, name) {
  const result = value.split(",").map(Number);
  if (result.length !== count || !result.every(Number.isFinite)) {
    throw new Error(`${name} requires ${count} finite comma-separated values`);
  }
  return result;
}

function byteSize(value, name) {
  const match = /^(\d+(?:\.\d+)?)(B|KiB|MiB|GiB)?$/i.exec(value);
  if (!match) {
    throw new Error(`${name} is not a byte size`);
  }
  const scale = { b: 1, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 }[
    (match[2] ?? "B").toLowerCase()
  ];
  const result = Number(match[1]) * scale;
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new Error(`${name} must be a positive safe byte size`);
  }
  return result;
}

function tileSize(value) {
  const result = numberList(value, 3, "tile-size");
  if (!result.every((size) => size > 0)) {
    throw new Error(
      "tile-size requires three positive finite dimensions in metres",
    );
  }
  return result;
}

function buildOptions(options) {
  if (options["fixed-grid-origin"] === undefined) {
    throw new Error("build requires --fixed-grid-origin <x,y,z>");
  }
  const result = {
    batchSize: integer(options["batch-size"] ?? "16384", "batch-size"),
    maximumChunkSplats: integer(
      options["maximum-chunk-splats"] ?? "400000",
      "maximum-chunk-splats",
    ),
    fixedGridOrigin: numberList(
      options["fixed-grid-origin"],
      3,
      "fixed-grid-origin",
    ),
    maxPackBytes: byteSize(
      options["max-pack-bytes"] ?? "512MiB",
      "max-pack-bytes",
    ),
    coordinateSystem: options["coordinate-system"] ?? "local",
    localOrigin: numberList(
      options["local-origin"] ?? "0,0,0",
      3,
      "local-origin",
    ),
    localToFixed: numberList(
      options["local-to-fixed"] ?? "1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1",
      16,
      "local-to-fixed",
    ),
    metersPerUnit: Number(options["meters-per-unit"] ?? "1"),
  };
  if (options.workers !== undefined) {
    result.workers = integer(options.workers, "workers");
  }
  if (options["tile-size"] !== undefined) {
    result.cellSizeMeters = tileSize(options["tile-size"]);
  }
  if (options["temporary-directory"] !== undefined) {
    result.temporaryDirectory = options["temporary-directory"];
  }
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseArguments(argv);
  let result;
  if (parsed.command === "build") {
    if (parsed.positional.length !== 1 || !parsed.options.output) {
      throw new Error("build requires <input.ply> --output <directory>");
    }
    let lastProgress = 0;
    result = await buildSegmentedGaussianScene(
      parsed.positional[0],
      parsed.options.output,
      {
        ...buildOptions(parsed.options),
        onProgress(event) {
          if (Date.now() - lastProgress >= 2000) {
            console.error(JSON.stringify(event));
            lastProgress = Date.now();
          }
        },
      },
    );
  } else if (parsed.command === "inspect") {
    if (parsed.positional.length !== 1) {
      throw new Error("inspect requires <directory>");
    }
    result = await inspectSegmentedGaussianScene(parsed.positional[0]);
  } else if (parsed.command === "validate") {
    if (parsed.positional.length !== 1) {
      throw new Error("validate requires <directory>");
    }
    result = await validateSegmentedGaussianScene(parsed.positional[0]);
  } else {
    throw new Error("Expected build, inspect, or validate command");
  }
  console.log(JSON.stringify(result.report ?? result, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
