import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const SOURCE_COMMIT = "b012ad06d858fc035d88aacfd73f092f93c994e4";
const SOURCE_FILES = Object.freeze({
  "shape.bin": {
    path: "packages/clouds/assets/shape.bin",
    sha256: "EF65CF6156894720C00BF572C49E3E254F8899C4B5158246E5A35A1922E2519C",
  },
  "shape_detail.bin": {
    path: "packages/clouds/assets/shape_detail.bin",
    sha256: "C09112199C6E0281B74FF5283C11C2943AE082650B9B67978CF5D59ED2956E4F",
  },
  "local_weather.png": {
    path: "packages/clouds/assets/local_weather.png",
    sha256: "B84DAEF855DC5EEBCC9B174FE832BA75A98E44B846DDE201BCE354417CC08031",
  },
  "turbulence.png": {
    path: "packages/clouds/assets/turbulence.png",
    sha256: "EC2B1B0AF4A6A6104102B21E58BEB300B0A3D334C0281D84FDE8C91D322910F9",
  },
  "stbn.bin": {
    path: "packages/core/assets/stbn.bin",
    sha256: "51F52F21E5578384585050390821A0A486DCB81E11A716FA7B92FBB6515BA852",
  },
});
const OUTPUT_FILES = Object.freeze([
  {
    name: "globe-shape.bin",
    format: "R8",
    dimensions: [128, 128, 128],
    source: "shape.bin",
  },
  {
    name: "globe-detail.bin",
    format: "R8",
    dimensions: [32, 32, 32],
    source: "shape_detail.bin",
  },
  {
    name: "globe-weather.bin",
    format: "RGBA8",
    dimensions: [512, 512],
    source: "local_weather.png",
  },
  {
    name: "globe-turbulence.bin",
    format: "RGBA8",
    dimensions: [128, 128],
    source: "turbulence.png",
  },
  {
    name: "globe-stbn.bin",
    format: "R8",
    dimensions: [128, 128, 64],
    source: "stbn.bin",
  },
]);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodeRgba8Png(buffer, expectedWidth, expectedHeight) {
  assert.deepEqual(
    buffer.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  let offset = 8;
  let width;
  let height;
  const compressed = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "local weather PNG must be 8-bit");
      assert.equal(data[9], 6, "local weather PNG must be RGBA");
      assert.equal(data[10], 0, "unsupported PNG compression");
      assert.equal(data[11], 0, "unsupported PNG filter method");
      assert.equal(data[12], 0, "interlaced PNG is unsupported");
    } else if (type === "IDAT") {
      compressed.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  assert.equal(width, expectedWidth);
  assert.equal(height, expectedHeight);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const filtered = zlib.inflateSync(Buffer.concat(compressed));
  assert.equal(filtered.length, (stride + 1) * height);
  const rows = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = filtered[inputOffset++];
    const rowOffset = y * stride;
    const previousOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const value = filtered[inputOffset++];
      const left = x >= bytesPerPixel ? rows[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? rows[previousOffset + x] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? rows[previousOffset + x - bytesPerPixel]
          : 0;
      let predictor = 0;
      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = above;
      } else if (filter === 3) {
        predictor = Math.floor((left + above) * 0.5);
      } else if (filter === 4) {
        predictor = paeth(left, above, upperLeft);
      } else {
        assert.equal(filter, 0, `unsupported PNG row filter ${filter}`);
      }
      rows[rowOffset + x] = (value + predictor) & 0xff;
    }
  }

  // Three.js TextureLoader uploads image assets with flipY=true. Store the
  // already-flipped rows so Cesium's explicit array upload with flipY=false
  // addresses the exact same local-weather texels.
  const output = Buffer.alloc(rows.length);
  for (let y = 0; y < height; y++) {
    rows.copy(output, (height - 1 - y) * stride, y * stride, (y + 1) * stride);
  }
  return output;
}

function createProvenance(payloads) {
  return {
    schemaVersion: 1,
    source: {
      repository:
        "https://github.com/takram-design-engineering/three-geospatial",
      commit: SOURCE_COMMIT,
      packages: ["packages/clouds", "packages/core"],
      license: "MIT",
      copyright: "Copyright (c) 2024 Shota Matsuda",
      files: Object.entries(SOURCE_FILES).map(([name, source]) => ({
        name,
        path: source.path,
        sha256: source.sha256,
      })),
    },
    importer: "scripts/scenegis/import-three-geospatial-cloud-assets.mjs",
    byteOrder: "raw texel order, x-fastest then y then z",
    outputs: OUTPUT_FILES.map((file) => {
      const payload = payloads.get(file.name);
      return {
        name: file.name,
        source: file.source,
        format: file.format,
        dimensions: file.dimensions,
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

async function readSourcePayloads(sourceRoot) {
  const sourcePayloads = new Map();
  for (const [name, source] of Object.entries(SOURCE_FILES)) {
    const payload = await fs.readFile(path.join(sourceRoot, source.path));
    assert.equal(
      sha256(payload),
      source.sha256,
      `${name} source hash mismatch`,
    );
    sourcePayloads.set(name, payload);
  }
  return new Map([
    ["globe-shape.bin", sourcePayloads.get("shape.bin")],
    ["globe-detail.bin", sourcePayloads.get("shape_detail.bin")],
    [
      "globe-weather.bin",
      decodeRgba8Png(sourcePayloads.get("local_weather.png"), 512, 512),
    ],
    [
      "globe-turbulence.bin",
      decodeRgba8Png(sourcePayloads.get("turbulence.png"), 128, 128),
    ],
    ["globe-stbn.bin", sourcePayloads.get("stbn.bin")],
  ]);
}

async function verifyDirectory(target) {
  const provenance = JSON.parse(
    await fs.readFile(
      path.join(target, "GLOBE_REFERENCE_PROVENANCE.json"),
      "utf8",
    ),
  );
  assert.equal(provenance.source.commit, SOURCE_COMMIT);
  assert.deepEqual(
    provenance.source.files,
    Object.entries(SOURCE_FILES).map(([name, source]) => ({
      name,
      path: source.path,
      sha256: source.sha256,
    })),
  );
  const payloads = new Map();
  for (const file of OUTPUT_FILES) {
    const payload = await fs.readFile(path.join(target, file.name));
    const record = provenance.outputs.find((entry) => entry.name === file.name);
    assert.ok(record, `${file.name} provenance is missing`);
    assert.equal(payload.length, record.bytes);
    assert.equal(sha256(payload), record.sha256);
    payloads.set(file.name, payload);
  }
  assert.deepEqual(provenance, createProvenance(payloads));
  return provenance;
}

async function importAssets(sourceRoot, target) {
  const payloads = await readSourcePayloads(sourceRoot);
  await fs.mkdir(target, { recursive: true });
  const temporaryPaths = [];
  try {
    for (const [name, payload] of payloads) {
      const temporary = path.join(target, `.${name}.${process.pid}.tmp`);
      temporaryPaths.push(temporary);
      await fs.writeFile(temporary, payload, { flag: "wx" });
    }
    const provenance = `${JSON.stringify(createProvenance(payloads), null, 2)}\n`;
    const provenanceTemporary = path.join(
      target,
      `.GLOBE_REFERENCE_PROVENANCE.json.${process.pid}.tmp`,
    );
    temporaryPaths.push(provenanceTemporary);
    await fs.writeFile(provenanceTemporary, provenance, { flag: "wx" });
    for (const [name] of payloads) {
      await fs.rename(
        path.join(target, `.${name}.${process.pid}.tmp`),
        path.join(target, name),
      );
    }
    await fs.rename(
      provenanceTemporary,
      path.join(target, "GLOBE_REFERENCE_PROVENANCE.json"),
    );
    return verifyDirectory(target);
  } finally {
    await Promise.all(
      temporaryPaths.map((temporary) => fs.rm(temporary, { force: true })),
    );
  }
}

function parseArguments(argv) {
  const targetIndex = argv.indexOf("--target");
  if (targetIndex < 0 || !argv[targetIndex + 1]) {
    throw new Error("--target <directory> is required.");
  }
  const sourceIndex = argv.indexOf("--source");
  const verifyOnly = argv.includes("--verify-only");
  if (!verifyOnly && (sourceIndex < 0 || !argv[sourceIndex + 1])) {
    throw new Error("--source <three-geospatial checkout> is required.");
  }
  return {
    source: sourceIndex >= 0 ? path.resolve(argv[sourceIndex + 1]) : undefined,
    target: path.resolve(argv[targetIndex + 1]),
    verifyOnly,
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const options = parseArguments(process.argv.slice(2));
  const provenance = options.verifyOnly
    ? await verifyDirectory(options.target)
    : await importAssets(options.source, options.target);
  process.stdout.write(
    `Globe reference cloud assets verified: ${provenance.totalBinaryBytes} bytes\n`,
  );
}

export {
  OUTPUT_FILES,
  SOURCE_COMMIT,
  SOURCE_FILES,
  decodeRgba8Png,
  importAssets,
  verifyDirectory,
};
