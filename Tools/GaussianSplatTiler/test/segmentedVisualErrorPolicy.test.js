import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { crc32WithZeroedRanges } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsCrc32.js";
import {
  buildSegmentedGaussianScene,
  validateSegmentedGaussianScene,
} from "../src/segmentedBuilder.js";
import {
  G2_PRODUCT_POLICY_LINES,
  LEGACY_NODE_DOMAIN_PRODUCT_POLICY_SHA256_HEX,
  canonicalManifestBytes,
  g2ProductPolicySha256,
} from "../src/hierarchy/segmentedHierarchyProductArtifact.js";
import {
  DYADIC_VISUAL_ERROR_METHOD,
  VISUAL_ERROR_BIN_COUNT,
  VISUAL_ERROR_METHOD,
} from "../src/hierarchy/visualErrorHistogram.js";

test("segmented visual-error policy: distinguishes the dyadic producer from the exact restored legacy producer", () => {
  const newLine = `${DYADIC_VISUAL_ERROR_METHOD}/${VISUAL_ERROR_BIN_COUNT}/p95-p99`;
  assert.equal(
    G2_PRODUCT_POLICY_LINES.filter((line) => line === newLine).length,
    1,
  );
  const legacyLines = G2_PRODUCT_POLICY_LINES.map((line) =>
    line === newLine
      ? `${VISUAL_ERROR_METHOD}/${VISUAL_ERROR_BIN_COUNT}/p95-p99`
      : line,
  );
  const legacyHash = createHash("sha256")
    .update(legacyLines.join("\n"))
    .digest("hex");
  assert.equal(legacyHash, LEGACY_NODE_DOMAIN_PRODUCT_POLICY_SHA256_HEX);
  assert.notEqual(g2ProductPolicySha256().toString("hex"), legacyHash);
});

test("segmented visual-error policy: public validation accepts only known identities, preserves exact caller checks and validates Pack bytes", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "segmented-error-policy-"));
  const output = path.join(parent, "scene");
  try {
    const fixture = fileURLToPath(
      new URL("./t1a-tree-product-v1.ply", import.meta.url),
    );
    const built = await buildSegmentedGaussianScene(fixture, output, {
      fixedGridOrigin: [0, 0, 0],
      workers: 1,
      batchSize: 8,
      maxPackBytes: 1024 * 1024,
    });
    const current = g2ProductPolicySha256();
    const legacy = Buffer.from(
      LEGACY_NODE_DOMAIN_PRODUCT_POLICY_SHA256_HEX,
      "hex",
    );
    const unknown = new Uint8Array(32).fill(0xa5);
    assert.deepEqual(
      Buffer.from(built.readback.decoded.header.policySha256),
      current,
    );
    const original = await readFile(path.join(output, "scene.mci"));
    const validate = (expectedPolicySha256) =>
      validateSegmentedGaussianScene(output, { expectedPolicySha256 });

    assert.deepEqual(
      Buffer.from((await validate()).decoded.header.policySha256),
      current,
    );
    await validate(current);
    await assert.rejects(validate(legacy), /policy identity mismatch/);

    // Change only this valid tiny fixture's policy field and recompute its CRC
    // and manifest. This exercises legacy identity acceptance, not old fitting.
    async function writePolicy(policy) {
      const bytes = Buffer.from(original);
      bytes.set(policy, 176);
      const checksum = crc32WithZeroedRanges(bytes, [[24, 4]]);
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
        24,
        checksum,
        true,
      );
      await writeFile(path.join(output, "scene.mci"), bytes);
      await writeFile(
        path.join(output, "scene.mcl.json"),
        canonicalManifestBytes(bytes, checksum),
      );
    }
    await writePolicy(legacy);
    assert.deepEqual(
      Buffer.from((await validate()).decoded.header.policySha256),
      legacy,
    );
    await validate(legacy);
    // Formal readback already supplies the new producer identity, so accepting
    // legacy products by default cannot weaken that strict build check.
    await assert.rejects(validate(current), /policy identity mismatch/);
    await assert.rejects(validate(unknown), /caller policy identity mismatch/);
    await assert.rejects(
      validate(new Uint8Array(31)),
      /caller policy identity mismatch/,
    );
    await assert.rejects(
      validate(Array.from(current)),
      /caller policy identity mismatch/,
    );

    await writePolicy(unknown);
    await assert.rejects(
      validate(),
      /Unsupported segmented product policy identity/,
    );
    await assert.rejects(validate(unknown), /caller policy identity mismatch/);
    await assert.rejects(validate(current), /policy identity mismatch/);

    await writePolicy(legacy);
    const firstPack = built.readback.packs[0];
    const packPath = path.join(output, "packs", firstPack.fileName);
    const pack = await readFile(packPath);
    pack[pack.length - 1] ^= 1;
    await writeFile(packPath, pack);
    await assert.rejects(validate(), /whole-file CRC mismatch/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
