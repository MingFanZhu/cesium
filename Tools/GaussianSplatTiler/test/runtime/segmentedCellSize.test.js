import assert from "node:assert/strict";
import test from "node:test";
import { crc32WithZeroedRanges } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsCrc32.js";
import { planSparseFixedGrid3dHierarchy } from "../../src/hierarchy/sparseHierarchy.js";
import {
  decodeSegmentedHierarchyIndex,
  decodeSparseHierarchyIndexSkeleton,
  encodeSegmentedHierarchyIndex,
  encodeSparseHierarchyIndexSkeleton,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyIndex.js";
import {
  decodeSegmentedHierarchyRuntimeIndex,
  validateSegmentedHierarchyRuntimeIndex,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";
import { createRealA4RuntimeFixture } from "./segmentedHierarchyFixture.js";

function skeletonOptions(cellSizeMeters) {
  return {
    hierarchy: planSparseFixedGrid3dHierarchy({
      tileX: Int32Array.of(-2, 1),
      tileY: Int32Array.of(3, 0),
      tileZ: Int32Array.of(0, 1),
      physicalPartCount: Uint32Array.of(1, 1),
    }),
    fixedGridOrigin: [100, -200, 5],
    cellSizeMeters,
    sourceSha256: new Uint8Array(32),
    policySha256: new Uint8Array(32),
  };
}

test("MCI4 preserves configurable anisotropic cell sizes in its existing header", () => {
  for (const sizes of [
    [10, 10, 20],
    [5, 12.5, 30],
    [0.125, 2, 8],
  ]) {
    const options = skeletonOptions(sizes);
    const bytes = encodeSparseHierarchyIndexSkeleton(options);
    const decoded = decodeSparseHierarchyIndexSkeleton(bytes);
    assert.equal(decoded.version, 4);
    assert.deepEqual(decoded.header.cellSizeMeters, sizes);
    assert.deepEqual(decoded.header.fixedGridOrigin, options.fixedGridOrigin);
  }
});

test("MCI4 rejects nonpositive or malformed cell sizes on encode and decode", () => {
  for (const sizes of [
    [],
    [1, 2],
    [1, 2, 3, 4],
    [0, 2, 3],
    [-1, 2, 3],
    [NaN, 2, 3],
    [Infinity, 2, 3],
    [1, -Infinity, 3],
    [true, 2, 3],
    ["1", 2, 3],
  ]) {
    assert.throws(
      () => encodeSparseHierarchyIndexSkeleton(skeletonOptions(sizes)),
      /cellSizeMeters/,
    );
  }
  const original = encodeSparseHierarchyIndexSkeleton(
    skeletonOptions([5, 12.5, 30]),
  );
  for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
    const bytes = Uint8Array.from(original);
    const view = new DataView(bytes.buffer);
    view.setFloat64(120, invalid, true);
    view.setUint32(24, crc32WithZeroedRanges(bytes, [[24, 4]]), true);
    assert.throws(
      () => decodeSparseHierarchyIndexSkeleton(bytes),
      /cellSizeMeters/,
    );
  }
});

test("segmented runtime uses encoded axis sizes for node and leaf cell bounds", async () => {
  const fixture = await createRealA4RuntimeFixture();
  try {
    const decoded = decodeSegmentedHierarchyIndex(fixture.bytes);
    const sizes = [5, 12.5, 30];
    const origin = [100, -200, 5];
    const bytes = encodeSegmentedHierarchyIndex({
      header: {
        ...decoded.header,
        cellSizeMeters: sizes,
        fixedGridOrigin: origin,
      },
      sections: decoded.sections.map((section) => ({
        kind: section.kind,
        componentType: section.componentType,
        componentCount: section.componentCount,
        required: section.required,
        data: section.data,
      })),
    });
    const index = decodeSegmentedHierarchyRuntimeIndex(bytes);
    assert.equal(validateSegmentedHierarchyRuntimeIndex(index), index);
    assert.deepEqual(index.cellSizeMeters, sizes);
    const rootMin = decoded.header.rootTileOrigin.map(
      (tile, axis) => origin[axis] + tile * sizes[axis],
    );
    assert.deepEqual(
      [...index.readNodeCellBounds(0, new Float64Array(6))],
      rootMin.concat(
        rootMin.map((value, axis) => value + index.rootSizeTiles * sizes[axis]),
      ),
    );
    for (let leaf = 0; leaf < index.leafCount; leaf++) {
      const topology = index.readLeafTopology(leaf, new Float64Array(5));
      const low = sizes.map(
        (size, axis) => origin[axis] + topology[axis] * size,
      );
      assert.deepEqual(
        [...index.readNodeCellBounds(topology[3], new Float64Array(6))],
        low.concat(low.map((value, axis) => value + sizes[axis])),
      );
    }
    assert.ok(Object.isFrozen(index.cellSizeMeters));
    assert.throws(() => {
      index.cellSizeMeters[0] = 99;
    }, TypeError);
    assert.throws(
      () =>
        validateSegmentedHierarchyRuntimeIndex({
          ...index,
          cellSizeMeters: [10, 10, 20],
        }),
      /branded SCALE-1B Runtime Index/,
    );
  } finally {
    await fixture.cleanup();
  }
});
