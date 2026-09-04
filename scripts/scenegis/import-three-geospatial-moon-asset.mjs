import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SOURCE_COMMIT = "b012ad06d858fc035d88aacfd73f092f93c994e4";
const SOURCE_PATH = "storybook-webgpu/assets/moon/color_large.webp";
const SOURCE_SHA256 =
  "1709BA3B65991842CD84A8D338EF46AD942241EE056B1AC8AAD0D3776EDF7DBD";
const SOURCE_BYTES = 213446;
const SOURCE_DIMENSIONS = Object.freeze([2048, 1024]);
const OUTPUT_NAME = "color_large.webp";
const NOTICE = `NASA CGI Moon Kit color imagery

Source: https://svs.gsfc.nasa.gov/4720/
Credit: NASA
Usage: https://www.nasa.gov/nasa-brand-center/images-and-media/
`;
const LICENSE = `The MIT License (MIT)

Copyright (c) 2024 Shota Matsuda

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`;

function sha256(payload) {
  return crypto.createHash("sha256").update(payload).digest("hex").toUpperCase();
}

function readUint24LE(payload, offset) {
  return payload[offset] | (payload[offset + 1] << 8) | (payload[offset + 2] << 16);
}

function decodeWebpDimensions(payload) {
  assert.equal(payload.toString("ascii", 0, 4), "RIFF");
  assert.equal(payload.toString("ascii", 8, 12), "WEBP");
  let offset = 12;
  while (offset + 8 <= payload.length) {
    const type = payload.toString("ascii", offset, offset + 4);
    const length = payload.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === "VP8X") {
      return [readUint24LE(payload, data + 4) + 1, readUint24LE(payload, data + 7) + 1];
    }
    if (type === "VP8 ") {
      assert.deepEqual(payload.subarray(data + 3, data + 6), Buffer.from([0x9d, 0x01, 0x2a]));
      return [payload.readUInt16LE(data + 6) & 0x3fff, payload.readUInt16LE(data + 8) & 0x3fff];
    }
    if (type === "VP8L") {
      assert.equal(payload[data], 0x2f);
      const bits = payload.readUInt32LE(data + 1);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
    offset = data + length + (length & 1);
  }
  throw new Error("WebP dimensions are missing.");
}

function createProvenance(payload) {
  return {
    schemaVersion: 1,
    source: {
      repository: "https://github.com/takram-design-engineering/three-geospatial",
      commit: SOURCE_COMMIT,
      path: SOURCE_PATH,
      license: "MIT",
      copyright: "Copyright (c) 2024 Shota Matsuda",
      assetSource: "NASA CGI Moon Kit",
      assetSourceUrl: "https://svs.gsfc.nasa.gov/4720/",
      credit: "NASA",
      usageGuidelines:
        "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    },
    importer: "scripts/scenegis/import-three-geospatial-moon-asset.mjs",
    output: {
      name: OUTPUT_NAME,
      format: "WebP sRGB color",
      dimensions: SOURCE_DIMENSIONS,
      bytes: payload.length,
      sha256: sha256(payload),
    },
  };
}

async function verifyDirectory(target) {
  const payload = await fs.readFile(path.join(target, OUTPUT_NAME));
  assert.equal(payload.length, SOURCE_BYTES);
  assert.equal(sha256(payload), SOURCE_SHA256);
  assert.deepEqual(decodeWebpDimensions(payload), SOURCE_DIMENSIONS);
  const provenance = JSON.parse(
    await fs.readFile(path.join(target, "PROVENANCE.json"), "utf8"),
  );
  assert.deepEqual(provenance, createProvenance(payload));
  assert.equal(await fs.readFile(path.join(target, "NASA_NOTICE.txt"), "utf8"), NOTICE);
  assert.equal(await fs.readFile(path.join(target, "THIRD_PARTY_LICENSE.txt"), "utf8"), LICENSE);
  return provenance;
}

async function importAsset(sourceRoot, target) {
  const payload = await fs.readFile(path.join(sourceRoot, SOURCE_PATH));
  assert.equal(payload.length, SOURCE_BYTES);
  assert.equal(sha256(payload), SOURCE_SHA256);
  assert.deepEqual(decodeWebpDimensions(payload), SOURCE_DIMENSIONS);
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(target, OUTPUT_NAME), payload);
  await fs.writeFile(
    path.join(target, "PROVENANCE.json"),
    `${JSON.stringify(createProvenance(payload), null, 2)}\n`,
  );
  await fs.writeFile(path.join(target, "NASA_NOTICE.txt"), NOTICE);
  await fs.writeFile(path.join(target, "THIRD_PARTY_LICENSE.txt"), LICENSE);
  return verifyDirectory(target);
}

function parseArguments(argv) {
  const targetIndex = argv.indexOf("--target");
  assert.ok(targetIndex >= 0 && argv[targetIndex + 1], "--target is required");
  const verifyOnly = argv.includes("--verify-only");
  const sourceIndex = argv.indexOf("--source");
  assert.ok(
    verifyOnly || (sourceIndex >= 0 && argv[sourceIndex + 1]),
    "--source is required unless --verify-only is used",
  );
  return {
    source: sourceIndex >= 0 ? path.resolve(argv[sourceIndex + 1]) : undefined,
    target: path.resolve(argv[targetIndex + 1]),
    verifyOnly,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArguments(process.argv.slice(2));
  const provenance = options.verifyOnly
    ? await verifyDirectory(options.target)
    : await importAsset(options.source, options.target);
  process.stdout.write(
    `Moon asset verified: ${provenance.output.bytes} bytes, ${provenance.output.dimensions.join("x")}\n`,
  );
}

export {
  SOURCE_BYTES,
  SOURCE_COMMIT,
  SOURCE_DIMENSIONS,
  SOURCE_PATH,
  SOURCE_SHA256,
  decodeWebpDimensions,
  importAsset,
  verifyDirectory,
};
