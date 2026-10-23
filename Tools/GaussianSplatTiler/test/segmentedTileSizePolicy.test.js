import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  G2_PRODUCT_POLICY_LINES,
  LEGACY_NODE_DOMAIN_PRODUCT_POLICY_SHA256_HEX,
  g2ProductPolicySha256,
  resolveG2ProductPolicySha256,
} from "../src/hierarchy/segmentedHierarchyProductArtifact.js";

test("segmented grid policy preserves default identity and distinguishes custom dimensions", () => {
  const original = createHash("sha256")
    .update(G2_PRODUCT_POLICY_LINES.join("\n"))
    .digest();
  assert.deepEqual(g2ProductPolicySha256(), original);
  assert.deepEqual(g2ProductPolicySha256([10, 10, 20]), original);
  const custom = g2ProductPolicySha256([5, 5, 10]);
  assert.notDeepEqual(custom, original);
  assert.notDeepEqual(custom, g2ProductPolicySha256([5, 10, 5]));
  assert.notDeepEqual(custom, g2ProductPolicySha256([5, 5, 10.5]));
  assert.deepEqual(custom, g2ProductPolicySha256([5, 5, 10]));
  for (const invalid of [
    [5, 5],
    [5, 5, 0],
    [5, 5, -1],
    [5, 5, NaN],
    [5, 5, Infinity],
    [5, 5, "10"],
    new Array(3),
  ]) {
    assert.throws(() => g2ProductPolicySha256(invalid), /positive finite/);
  }
});

test("segmented policy resolver binds the permitted identity to the artifact grid", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "segmented-grid-policy-"),
  );
  const standard = g2ProductPolicySha256();
  const custom = g2ProductPolicySha256([5, 5, 10]);
  const other = g2ProductPolicySha256([5, 10, 5]);
  const legacy = Buffer.from(
    LEGACY_NODE_DOMAIN_PRODUCT_POLICY_SHA256_HEX,
    "hex",
  );
  // The resolver only probes this bounded header region; full product/CRC/Pack
  // validation is covered by public builder and CLI product tests.
  async function writeProbe(cellSizeMeters, policy) {
    const bytes = Buffer.alloc(208);
    for (let axis = 0; axis < 3; axis++) {
      bytes.writeDoubleLE(cellSizeMeters[axis], 120 + axis * 8);
    }
    bytes.set(policy, 176);
    await writeFile(path.join(directory, "scene.mci"), bytes);
  }
  try {
    await writeProbe([5, 5, 10], custom);
    assert.deepEqual(
      Buffer.from(await resolveG2ProductPolicySha256(directory)),
      custom,
    );
    assert.deepEqual(
      Buffer.from(await resolveG2ProductPolicySha256(directory, custom)),
      custom,
    );
    for (const wrong of [standard, other, legacy]) {
      await assert.rejects(
        resolveG2ProductPolicySha256(directory, wrong),
        /caller policy identity mismatch/,
      );
      await writeProbe([5, 5, 10], wrong);
      await assert.rejects(
        resolveG2ProductPolicySha256(directory),
        /Unsupported segmented product policy identity/,
      );
    }
    await writeProbe([10, 10, 20], legacy);
    assert.deepEqual(
      Buffer.from(await resolveG2ProductPolicySha256(directory)),
      legacy,
    );
    await writeProbe([10, 10, 20], custom);
    await assert.rejects(
      resolveG2ProductPolicySha256(directory),
      /Unsupported segmented product policy identity/,
    );
    await writeProbe([5, 5, 0], custom);
    await assert.rejects(
      resolveG2ProductPolicySha256(directory),
      /positive finite/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
