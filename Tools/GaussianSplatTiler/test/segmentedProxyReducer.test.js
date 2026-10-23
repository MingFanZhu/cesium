import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import nodeTest from "node:test";

import { planSparseFixedGrid3dHierarchy } from "../src/hierarchy/sparseHierarchy.js";
import { createVisualErrorHistogram } from "../src/hierarchy/visualErrorHistogram.js";
import {
  composeConstantLeafRepresentation,
  planHalfRateSegmentCount,
  planSegmentedHierarchyCounts,
  PROXY_SEED_LAYOUT_ID,
  reduceDirectChildRepresentation,
  SEGMENTED_PROXY_POLICY_ID,
} from "../src/hierarchy/segmentedProxyReducer.js";

const INVALID_INDEX = 0xffffffff;
const test = globalThis.it ?? nodeTest;

function createSeed({
  count,
  origin = [0, 0, 0],
  positionBase = 0,
  colorBase = 0,
  massBase = 1,
  representedSourceCount = BigInt(count),
  shCount = 2,
  zeroScale = false,
}) {
  const seed = {
    count,
    shCount,
    origin: new Float64Array(origin),
    position: new Float32Array(count * 3),
    scale: new Float32Array(count * 3),
    rotation: new Float32Array(count * 4),
    opacity: new Float32Array(count),
    color: new Float32Array(count * 3),
    sh: new Float32Array(count * shCount),
    errorPosition: new Float64Array(count),
    errorCovariance: new Float64Array(count),
    errorColor: new Float64Array(count),
    errorSh: new Float64Array(count),
    coverageMass: new Float64Array(count),
    representedSourceCount,
  };
  for (let index = 0; index < count; index++) {
    const offset3 = index * 3;
    const offset4 = index * 4;
    seed.position.set(
      [positionBase + index * 0.25, index * 0.125, index * 0.0625],
      offset3,
    );
    seed.scale.set(
      zeroScale
        ? [0, 0, 0]
        : [0.25 + index * 0.01, 0.2 + index * 0.01, 0.15 + index * 0.01],
      offset3,
    );
    seed.rotation.set([0, 0, 0, 1], offset4);
    seed.opacity[index] = 0.45 + index * 0.01;
    seed.color.set(
      [colorBase + index * 0.1, colorBase + 1, colorBase + 2],
      offset3,
    );
    for (let coefficient = 0; coefficient < shCount; coefficient++) {
      seed.sh[index * shCount + coefficient] =
        colorBase * 0.01 + index * 0.001 + coefficient * 0.0001;
    }
    seed.errorPosition[index] = index * 1e-7;
    seed.errorCovariance[index] = index * 2e-7;
    seed.errorColor[index] = index * 3e-7;
    seed.errorSh[index] = index * 4e-7;
    seed.coverageMass[index] = massBase + index * 0.125;
  }
  return seed;
}

function createLeafRepresentation({
  representationId,
  ownerNodeIndex,
  seed,
  logicalLevel = 6,
  geometricError = 0,
}) {
  return {
    representationId,
    ownerNodeIndex,
    mode: "CONSTANT_LEAF",
    logicalLevel,
    origin: seed.origin,
    firstSegment: INVALID_INDEX,
    segmentCount: 0,
    splatCount: seed.count,
    representedSourceCount: seed.representedSourceCount,
    geometricError,
    seed,
  };
}

test("distilled parent uses one envelope domain for all direct-child ranges", async () => {
  const children = [100, 200].map((error, ordinal) => {
    const seed = createSeed({ count: 1, shCount: 0, positionBase: ordinal });
    seed.errorPosition[0] = error;
    return createLeafRepresentation({
      representationId: ordinal,
      ownerNodeIndex: ordinal + 1,
      seed,
      geometricError: Math.sqrt(3) * error,
    });
  });
  const args = {
    representationId: 2,
    ownerNodeIndex: 0,
    firstSegmentId: 0,
    parentOrigin: [0, 0, 0],
    ownerBounds: [-10, -10, -10, 10, 10, 10],
    expectedChildNodeIndices: [1, 2],
    childRepresentations: children,
  };
  await assert.rejects(
    reduceDirectChildRepresentation(args),
    /exceeds owner-node/,
  );
  const result = await reduceDirectChildRepresentation({
    ...args,
    visualErrorDomain: "owner-envelope",
  });
  const seed = result.representation.seed;
  assert.equal(seed.count, 2);
  assert.deepEqual(Array.from(seed.errorPosition), [100, 200]);
  for (const segment of result.segments) {
    const start = segment.rangeStart,
      end = start + segment.rangeCount;
    const h = createVisualErrorHistogram({
      errorPosition: seed.errorPosition.subarray(start, end),
      errorCovariance: seed.errorCovariance.subarray(start, end),
      coverageMass: seed.coverageMass.subarray(start, end),
      ownerBounds: args.ownerBounds,
      ownerErrorUpperBound: result.representation.geometricError,
    });
    assert.equal(
      segment.coverageWeightedP95Error,
      Math.min(h.p95, segment.geometricError),
    );
    assert.equal(
      segment.coverageWeightedP99Error,
      Math.min(h.p99, segment.geometricError),
    );
  }
});

function createFourChildren() {
  return [4, 5, 6, 7].map((count, ordinal) => {
    const seed = createSeed({
      count,
      origin: [1000 + ordinal * 20, 2000 - ordinal * 3, 3000 + ordinal],
      positionBase: ordinal * 2,
      colorBase: ordinal * 10,
      massBase: ordinal + 1,
      representedSourceCount: BigInt(101 + ordinal * 100),
    });
    return createLeafRepresentation({
      representationId: 10 + ordinal,
      ownerNodeIndex: 20 + ordinal,
      seed,
      geometricError: ordinal * 0.01,
    });
  });
}

function createEightChildren() {
  return [4, 5, 6, 7, 8, 9, 10, 11].map((count, ordinal) => {
    const seed = createSeed({
      count,
      origin: [1000 + ordinal * 20, 2000 - ordinal * 3, 3000 + ordinal],
      positionBase: ordinal * 2,
      colorBase: ordinal * 0.1,
      representedSourceCount: BigInt(100 + ordinal),
    });
    return createLeafRepresentation({
      ownerNodeIndex: 20 + ordinal,
      representationId: 10 + ordinal,
      seed,
      geometricError: ordinal * 0.25,
    });
  });
}

function seedByteLength(seed) {
  return Object.values(seed)
    .filter(ArrayBuffer.isView)
    .reduce((total, value) => total + value.byteLength, 0);
}

function seedByteSignature(seed) {
  return Object.fromEntries(
    Object.entries(seed)
      .filter(([, value]) => ArrayBuffer.isView(value))
      .map(([name, value]) => [
        name,
        Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString(
          "hex",
        ),
      ]),
  );
}

test("half-rate policy proves local and whole-hierarchy count bounds", () => {
  assert.equal(
    SEGMENTED_PROXY_POLICY_ID,
    "fixed10-direct-child-proxy-v2-half-rate-min-one-v1",
  );
  assert.equal(
    PROXY_SEED_LAYOUT_ID,
    "fixed10-relative-f32-core-f64-fit-seed-v1",
  );
  assert.deepEqual(
    [1, 2, 3, 4, 0xffffffff].map(planHalfRateSegmentCount),
    [1, 1, 1, 2, 0x7fffffff],
  );
  assert.throws(() => planHalfRateSegmentCount(0));
  assert.throws(() => planHalfRateSegmentCount(1.5));
  for (const childCount of [1, 2, 3, 4, 5, 1001, 0xffffffff]) {
    const segmentCount = planHalfRateSegmentCount(childCount);
    assert.ok(childCount <= 2 * segmentCount + 1);
    assert.ok(childCount - segmentCount <= segmentCount + 1);
  }

  const hierarchy = planSparseFixedGrid3dHierarchy({
    tileX: Int32Array.of(0, 1, 0, 1, 0, 1, 0, 1),
    tileY: Int32Array.of(0, 0, 1, 1, 0, 0, 1, 1),
    tileZ: Int32Array.of(0, 0, 0, 0, 1, 1, 1, 1),
    physicalPartCount: Uint32Array.of(1, 2, 1, 1, 3, 1, 1, 2),
  });
  const leafSeedCounts = Uint32Array.of(3, 11, 5, 7, 9, 13, 17, 19);
  const proof = planSegmentedHierarchyCounts({ hierarchy, leafSeedCounts });
  assert.equal(proof.leafSeedSplats, 84n);
  assert.equal(proof.hierarchyEdges, hierarchy.edgeCount);
  assert.ok(
    proof.internalProxySplats <=
      proof.leafSeedSplats + BigInt(proof.hierarchyEdges),
  );
  assert.equal(
    proof.boundSlack,
    proof.leafSeedSplats +
      BigInt(proof.hierarchyEdges) -
      proof.internalProxySplats,
  );
  assert.ok(proof.maximumRepresentationSplats >= 13);
});

test("four direct children use independent reducers and exact Segment authority", async () => {
  const children = createFourChildren();
  const result = await reduceDirectChildRepresentation({
    representationId: 100,
    ownerNodeIndex: 19,
    firstSegmentId: 200,
    parentOrigin: [990, 1990, 2990],
    ownerBounds: [990, 1950, 2980, 1200, 2020, 3050],
    expectedChildNodeIndices: [20, 21, 22, 23],
    childRepresentations: children,
  });

  assert.equal(result.representation.mode, "INTERNAL_SEGMENTED");
  assert.equal(result.representation.segmentCount, 4);
  assert.equal(result.representation.splatCount, 10);
  assert.equal(result.representation.representedSourceCount, 1004n);
  assert.equal(result.diagnostics.policyId, SEGMENTED_PROXY_POLICY_ID);
  let cursor = 0;
  for (let ordinal = 0; ordinal < 4; ordinal++) {
    const child = children[ordinal];
    const segment = result.segments[ordinal];
    const diagnostics = result.diagnostics.childReductions[ordinal];
    const target = planHalfRateSegmentCount(child.splatCount);
    assert.equal(segment.childNodeIndex, child.ownerNodeIndex);
    assert.equal(segment.rangeStart, cursor);
    assert.equal(segment.rangeCount, target);
    assert.equal(segment.representedSourceCount, child.representedSourceCount);
    assert.ok(segment.geometricError >= child.geometricError);
    assert.equal(diagnostics.reducerInvoked, true);
    assert.equal(diagnostics.inputCount, child.splatCount);
    assert.equal(diagnostics.targetCount, target);
    assert.equal(diagnostics.mergeCount, child.splatCount - target);
    assert.equal(diagnostics.mergeLog.recordCount, diagnostics.mergeCount);
    assert.equal(diagnostics.atomCount.input, child.splatCount);
    assert.equal(diagnostics.atomCount.output, child.splatCount);
    assert.ok(
      Math.abs(
        diagnostics.coverageMass.output - diagnostics.coverageMass.input,
      ) <= diagnostics.coverageMass.tolerance,
    );
    const colors = result.representation.seed.color.subarray(
      cursor * 3,
      (cursor + target) * 3,
    );
    for (let index = 0; index < colors.length; index += 3) {
      assert.ok(colors[index] >= ordinal * 10);
      assert.ok(colors[index] < ordinal * 10 + 1);
    }
    cursor += target;
  }
  assert.equal(cursor, result.representation.splatCount);
  assert.ok(
    result.segments.every(
      (segment) =>
        result.representation.geometricError >= segment.geometricError,
    ),
  );
});

test("eight octants use independent direct-child reducers", async () => {
  const children = createEightChildren();
  const result = await reduceDirectChildRepresentation({
    representationId: 150,
    ownerNodeIndex: 19,
    firstSegmentId: 250,
    parentOrigin: [990, 1990, 2990],
    ownerBounds: [990, 1950, 2980, 1200, 2020, 3050],
    expectedChildNodeIndices: children.map((child) => child.ownerNodeIndex),
    childRepresentations: children,
  });
  assert.equal(result.representation.segmentCount, 8);
  assert.equal(result.segments.length, 8);
  assert.deepEqual(
    result.segments.map((segment) => segment.childNodeIndex),
    children.map((child) => child.ownerNodeIndex),
  );
  assert.equal(result.diagnostics.childReductions.length, 8);
});

test("Segment split is a resource-neutral range projection", async () => {
  const children = createFourChildren();
  const result = await reduceDirectChildRepresentation({
    representationId: 101,
    ownerNodeIndex: 19,
    firstSegmentId: 300,
    parentOrigin: [990, 1990, 2990],
    ownerBounds: [990, 1950, 2980, 1200, 2020, 3050],
    expectedChildNodeIndices: [20, 21, 22, 23],
    childRepresentations: children,
  });
  const representation = result.representation;
  const bytesBeforeSplit = seedByteLength(representation.seed);
  const identityBeforeSplit = representation.representationId;
  const countBeforeSplit = representation.splatCount;

  assert.equal(result.segments[0].rangeStart, 0);
  for (let index = 1; index < result.segments.length; index++) {
    assert.equal(
      result.segments[index].rangeStart,
      result.segments[index - 1].rangeStart +
        result.segments[index - 1].rangeCount,
    );
  }
  const last = result.segments.at(-1);
  assert.equal(last.rangeStart + last.rangeCount, representation.splatCount);
  assert.equal(seedByteLength(representation.seed), bytesBeforeSplit);
  assert.equal(representation.representationId, identityBeforeSplit);
  assert.equal(representation.splatCount, countBeforeSplit);
  for (const segment of result.segments) {
    assert.equal(Object.values(segment).some(ArrayBuffer.isView), false);
    assert.equal("seed" in segment, false);
  }
});

test("single-child upgrade replaces only one bounded slot", async () => {
  const children = createFourChildren();
  const result = await reduceDirectChildRepresentation({
    representationId: 102,
    ownerNodeIndex: 19,
    firstSegmentId: 400,
    parentOrigin: [990, 1990, 2990],
    ownerBounds: [990, 1950, 2980, 1200, 2020, 3050],
    expectedChildNodeIndices: [20, 21, 22, 23],
    childRepresentations: children,
  });
  const coarseSlots = result.segments.map((segment) => ({
    provider: "coarse",
    segment,
    representationId: result.representation.representationId,
  }));
  const upgradedSlots = coarseSlots.slice();
  upgradedSlots[2] = {
    provider: "child",
    representation: children[2],
    childNodeIndex: children[2].ownerNodeIndex,
  };

  assert.strictEqual(upgradedSlots[0], coarseSlots[0]);
  assert.strictEqual(upgradedSlots[1], coarseSlots[1]);
  assert.strictEqual(upgradedSlots[3], coarseSlots[3]);
  assert.notStrictEqual(upgradedSlots[2], coarseSlots[2]);
  assert.equal(
    upgradedSlots[2].representation.representedSourceCount,
    coarseSlots[2].segment.representedSourceCount,
  );
  assert.equal(
    upgradedSlots[2].childNodeIndex,
    coarseSlots[2].segment.childNodeIndex,
  );
  assert.ok(
    children[2].splatCount <= 2 * coarseSlots[2].segment.rangeCount + 1,
  );
  assert.deepEqual(Object.keys(upgradedSlots[2]).sort(), [
    "childNodeIndex",
    "provider",
    "representation",
  ]);
});

test("multi-part leaf rebases and concatenates canonical parts without reduction", () => {
  const first = createSeed({
    count: 2,
    origin: [10, 20, 30],
    positionBase: 1,
    colorBase: 2,
    massBase: 3,
    representedSourceCount: 41n,
  });
  const second = createSeed({
    count: 3,
    origin: [20, 20, 30],
    positionBase: 4,
    colorBase: 5,
    massBase: 6,
    representedSourceCount: 59n,
  });
  const representation = composeConstantLeafRepresentation({
    representationId: 500,
    ownerNodeIndex: 50,
    logicalLevel: 6,
    origin: [0, 20, 30],
    parts: [
      { partIndex: 0, seed: first },
      { partIndex: 1, seed: second },
    ],
  });

  assert.equal(representation.mode, "CONSTANT_LEAF");
  assert.equal(representation.firstSegment, INVALID_INDEX);
  assert.equal(representation.segmentCount, 0);
  assert.equal(representation.splatCount, 5);
  assert.equal(representation.representedSourceCount, 100n);
  assert.deepEqual([...representation.origin], [0, 20, 30]);
  assert.equal(representation.seed.position[0], 11);
  assert.equal(representation.seed.position[first.count * 3], 24);
  assert.equal(
    representation.seed.coverageMass.reduce((sum, value) => sum + value, 0),
    first.coverageMass.reduce((sum, value) => sum + value, 0) +
      second.coverageMass.reduce((sum, value) => sum + value, 0),
  );
  assert.throws(() =>
    composeConstantLeafRepresentation({
      representationId: 501,
      ownerNodeIndex: 50,
      logicalLevel: 6,
      origin: [0, 20, 30],
      parts: [
        { partIndex: 1, seed: second },
        { partIndex: 0, seed: first },
      ],
    }),
  );
});

test("reruns and pass-through are byte-identical while invalid authorities fail closed", async () => {
  const children = createFourChildren();
  const options = {
    representationId: 103,
    ownerNodeIndex: 19,
    firstSegmentId: 600,
    parentOrigin: [990, 1990, 2990],
    ownerBounds: [990, 1950, 2980, 1200, 2020, 3050],
    expectedChildNodeIndices: [20, 21, 22, 23],
    childRepresentations: children,
  };
  const first = await reduceDirectChildRepresentation(options);
  const second = await reduceDirectChildRepresentation(options);
  assert.deepEqual(
    seedByteSignature(first.representation.seed),
    seedByteSignature(second.representation.seed),
  );
  assert.deepEqual(first.segments, second.segments);
  assert.deepEqual(first.diagnostics, second.diagnostics);

  const singletonChildren = [0, 1].map((ordinal) => {
    const seed = createSeed({
      count: 1,
      origin: [100 + ordinal * 10, 200, 300],
      positionBase: ordinal + 0.5,
      colorBase: ordinal * 10,
      massBase: ordinal + 1,
      representedSourceCount: BigInt(10 + ordinal),
    });
    return createLeafRepresentation({
      representationId: 700 + ordinal,
      ownerNodeIndex: 70 + ordinal,
      seed,
    });
  });
  const passThrough = await reduceDirectChildRepresentation({
    representationId: 702,
    ownerNodeIndex: 69,
    firstSegmentId: 700,
    parentOrigin: [90, 200, 300],
    ownerBounds: [80, 190, 290, 140, 250, 350],
    expectedChildNodeIndices: [70, 71],
    childRepresentations: singletonChildren,
  });
  assert.equal(passThrough.representation.splatCount, 2);
  assert.deepEqual(
    passThrough.diagnostics.childReductions.map(
      ({ reducerInvoked, mergeCount }) => [reducerInvoked, mergeCount],
    ),
    [
      [false, 0],
      [false, 0],
    ],
  );
  assert.equal(passThrough.representation.seed.position[0], 10.5);
  assert.equal(passThrough.representation.seed.position[3], 21.5);

  const badArraySeed = { ...children[0].seed, color: new Float32Array(1) };
  await assert.rejects(() =>
    reduceDirectChildRepresentation({
      ...options,
      childRepresentations: [
        { ...children[0], seed: badArraySeed },
        ...children.slice(1),
      ],
    }),
  );
  await assert.rejects(() =>
    reduceDirectChildRepresentation({ ...options, parentOrigin: [0, NaN, 0] }),
  );
  const overflowSeed = {
    ...children[0].seed,
    representedSourceCount: 1n << 64n,
  };
  await assert.rejects(() =>
    reduceDirectChildRepresentation({
      ...options,
      childRepresentations: [
        {
          ...children[0],
          representedSourceCount: 1n << 64n,
          seed: overflowSeed,
        },
        ...children.slice(1),
      ],
    }),
  );
  await assert.rejects(() =>
    reduceDirectChildRepresentation({
      ...options,
      expectedChildNodeIndices: [20, 22, 21, 23],
    }),
  );

  const massOverflowChildren = [80, 81].map((ownerNodeIndex, ordinal) => {
    const seed = createSeed({ count: 2, representedSourceCount: 2n });
    seed.coverageMass.fill(Number.MAX_VALUE);
    return createLeafRepresentation({
      representationId: 800 + ordinal,
      ownerNodeIndex,
      seed,
    });
  });
  await assert.rejects(() =>
    reduceDirectChildRepresentation({
      representationId: 802,
      ownerNodeIndex: 79,
      firstSegmentId: 800,
      parentOrigin: [0, 0, 0],
      ownerBounds: [-1, -1, -1, 2, 2, 2],
      expectedChildNodeIndices: [80, 81],
      childRepresentations: massOverflowChildren,
    }),
  );

  const largeFiniteMassChildren = [90, 91].map((ownerNodeIndex, ordinal) => {
    const seed = createSeed({
      count: 2,
      representedSourceCount: 2n,
    });
    seed.coverageMass.fill(1e307);
    return createLeafRepresentation({
      representationId: 900 + ordinal,
      ownerNodeIndex,
      seed,
    });
  });
  await assert.rejects(
    () =>
      reduceDirectChildRepresentation({
        representationId: 902,
        ownerNodeIndex: 89,
        firstSegmentId: 900,
        parentOrigin: [0, 0, 0],
        ownerBounds: [-1, -1, -1, 2, 2, 2],
        expectedChildNodeIndices: [90, 91],
        childRepresentations: largeFiniteMassChildren,
      }),
    /no finite live edge/,
  );
});
