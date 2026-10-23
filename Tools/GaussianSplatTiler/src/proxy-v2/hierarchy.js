import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

import {
  PROXY_V2_FIT_ID,
  PROXY_V2_GRAPH_ID,
  PROXY_V2_HEAP_COMPACTION_CONSTANT,
  PROXY_V2_HEAP_COMPACTION_FACTOR,
  PROXY_V2_POLICY_ID,
  PROXY_V2_PRIORITY_ID,
} from "./constants.js";
import { ContractibleMorton16Graph } from "./graph.js";
import { BoundedObservationHeap } from "./heap.js";
import { ProxyV2MergeLogDigest } from "./mergeLog.js";
import {
  combineSummarySlots,
  createL0SummaryStore,
  fitSummarySlot,
  marginalMergeDistortion,
  materializeSummarySlots,
} from "./summary.js";

function compareEdgeTuple(store, first, second, distortion, authority) {
  const stableLow = Math.min(
    store.minimumStableId[first],
    store.minimumStableId[second],
  );
  const stableHigh = Math.max(
    store.minimumStableId[first],
    store.minimumStableId[second],
  );
  const clusterLow = Math.min(store.clusterId[first], store.clusterId[second]);
  const clusterHigh = Math.max(store.clusterId[first], store.clusterId[second]);
  return (
    distortion - authority.distortion ||
    stableLow - authority.stableLow ||
    stableHigh - authority.stableHigh ||
    clusterLow - authority.clusterLow ||
    clusterHigh - authority.clusterHigh
  );
}

function setEdgeAuthority(store, first, second, distortion, authority) {
  authority.distortion = distortion;
  authority.stableLow = Math.min(
    store.minimumStableId[first],
    store.minimumStableId[second],
  );
  authority.stableHigh = Math.max(
    store.minimumStableId[first],
    store.minimumStableId[second],
  );
  authority.clusterLow = Math.min(
    store.clusterId[first],
    store.clusterId[second],
  );
  authority.clusterHigh = Math.max(
    store.clusterId[first],
    store.clusterId[second],
  );
}

function snapshotDigest(store, slots) {
  const hash = createHash("sha256");
  const bytes = Buffer.allocUnsafe(8);
  for (const slot of slots) {
    bytes.writeDoubleLE(store.clusterId[slot]);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function copyErrorAuthority(store, owner, retired, previous) {
  const proxy = store.proxy;
  const offsets = [
    ["errorPosition", 3, "position"],
    ["errorCovariance", 6, "covariance"],
    ["errorColor", 3, "color"],
    ["errorSh", store.shCount, "sh"],
  ];
  for (const [errorField, stride, valueField] of offsets) {
    let ownerDifference = 0;
    let retiredDifference = 0;
    const values = proxy[valueField];
    for (let component = 0; component < stride; component++) {
      const next = values[owner * stride + component];
      ownerDifference = Math.max(
        ownerDifference,
        Math.abs(next - previous.owner[valueField][component]),
      );
      retiredDifference = Math.max(
        retiredDifference,
        Math.abs(next - previous.retired[valueField][component]),
      );
    }
    proxy[errorField][owner] = Math.max(
      previous.owner[errorField] + ownerDifference,
      previous.retired[errorField] + retiredDifference,
    );
  }
}

function captureProxy(proxy, slot) {
  const value = {
    errorPosition: proxy.errorPosition[slot],
    errorCovariance: proxy.errorCovariance[slot],
    errorColor: proxy.errorColor[slot],
    errorSh: proxy.errorSh[slot],
  };
  for (const [field, stride] of [
    ["position", 3],
    ["covariance", 6],
    ["color", 3],
    ["sh", proxy.shCount],
  ]) {
    value[field] = [
      ...proxy[field].subarray(slot * stride, (slot + 1) * stride),
    ];
  }
  return value;
}

function ownerBeforeRetired(store, first, second) {
  return (store.minimumStableId[first] - store.minimumStableId[second] ||
    store.clusterId[first] - store.clusterId[second] ||
    first - second) <= 0
    ? [first, second]
    : [second, first];
}

export async function buildProxyV2Hierarchy(options) {
  const { source, coverageMass, targetCounts } = options;
  if (source.count <= 0) {
    throw new Error("Proxy v2 requires a non-empty finest payload");
  }
  const uniqueTargets = [...new Set(targetCounts)]
    .filter((count) => count > 0 && count < source.count)
    .sort((left, right) => right - left);
  const smallestTarget = uniqueTargets.at(-1) ?? source.count;
  const active = new Uint8Array(source.count);
  active.fill(1);
  const generation = new Uint32Array(source.count);
  generation.fill(1);
  const store = createL0SummaryStore(
    source,
    coverageMass,
    options.positionAnchor,
  );
  const graph = new ContractibleMorton16Graph(source, active);
  if (!graph.validateConnected(source.count)) {
    throw new Error("Proxy v2 initial graph is disconnected");
  }
  const bestNeighbor = new Int32Array(source.count);
  bestNeighbor.fill(-1);
  const bestDistortion = new Float64Array(source.count);
  bestDistortion.fill(Number.POSITIVE_INFINITY);
  let edgeCostEvaluationCount = 0;
  let neighborRecomputationCount = 0;
  const edgeScratch = {
    average: new Float64Array(6),
    inverse: new Float64Array(6),
  };
  const tieAuthority = {
    distortion: Number.POSITIVE_INFINITY,
    stableLow: Number.POSITIVE_INFINITY,
    stableHigh: Number.POSITIVE_INFINITY,
    clusterLow: Number.POSITIVE_INFINITY,
    clusterHigh: Number.POSITIVE_INFINITY,
  };
  const recomputeBest = (slot) => {
    neighborRecomputationCount++;
    tieAuthority.distortion = Number.POSITIVE_INFINITY;
    tieAuthority.stableLow = Number.POSITIVE_INFINITY;
    tieAuthority.stableHigh = Number.POSITIVE_INFINITY;
    tieAuthority.clusterLow = Number.POSITIVE_INFINITY;
    tieAuthority.clusterHigh = Number.POSITIVE_INFINITY;
    let selected = -1;
    graph.forEachNeighbor(slot, (neighbor) => {
      const distortion = marginalMergeDistortion(
        store,
        slot,
        neighbor,
        edgeScratch,
      );
      edgeCostEvaluationCount++;
      if (
        Number.isFinite(distortion) &&
        compareEdgeTuple(store, slot, neighbor, distortion, tieAuthority) < 0
      ) {
        selected = neighbor;
        setEdgeAuthority(store, slot, neighbor, distortion, tieAuthority);
      }
    });
    bestNeighbor[slot] = selected;
    bestDistortion[slot] = tieAuthority.distortion;
  };
  const updateBestForContractedOwner = (slot, owner, retired) => {
    const previous = bestNeighbor[slot];
    if (previous < 0 || previous === owner || previous === retired) {
      recomputeBest(slot);
      return;
    }
    setEdgeAuthority(store, slot, previous, bestDistortion[slot], tieAuthority);
    const distortion = marginalMergeDistortion(store, slot, owner, edgeScratch);
    edgeCostEvaluationCount++;
    if (
      Number.isFinite(distortion) &&
      compareEdgeTuple(store, slot, owner, distortion, tieAuthority) < 0
    ) {
      bestNeighbor[slot] = owner;
      bestDistortion[slot] = distortion;
    }
  };
  const heap = new BoundedObservationHeap(
    PROXY_V2_HEAP_COMPACTION_FACTOR * source.count +
      PROXY_V2_HEAP_COMPACTION_CONSTANT,
  );
  const pushBest = (slot) => {
    const neighbor = bestNeighbor[slot];
    if (neighbor < 0 || !Number.isFinite(bestDistortion[slot])) {
      return;
    }
    heap.push({
      owner: slot,
      ownerGeneration: generation[slot],
      neighbor,
      neighborGeneration: generation[neighbor],
      distortion: bestDistortion[slot],
      stableLow: Math.min(
        store.minimumStableId[slot],
        store.minimumStableId[neighbor],
      ),
      stableHigh: Math.max(
        store.minimumStableId[slot],
        store.minimumStableId[neighbor],
      ),
      clusterLow: Math.min(store.clusterId[slot], store.clusterId[neighbor]),
      clusterHigh: Math.max(store.clusterId[slot], store.clusterId[neighbor]),
    });
  };
  const rebuildHeap = () => {
    heap.clear(true);
    for (let slot = 0; slot < source.count; slot++) {
      if (active[slot]) {
        pushBest(slot);
      }
    }
  };
  for (let slot = 0; slot < source.count; slot++) {
    recomputeBest(slot);
    pushBest(slot);
  }
  const log = new ProxyV2MergeLogDigest();
  const snapshots = [];
  let activeCount = source.count;
  let mergeOrdinal = 0;
  let nextClusterId = source.count + 1;
  let targetIndex = 0;
  while (activeCount > smallestTarget) {
    let observation;
    do {
      observation = heap.pop();
      if (!observation) {
        throw new Error(
          "Proxy v2 has no finite live edge before the requested target",
        );
      }
    } while (
      !active[observation.owner] ||
      !active[observation.neighbor] ||
      generation[observation.owner] !== observation.ownerGeneration ||
      generation[observation.neighbor] !== observation.neighborGeneration ||
      bestNeighbor[observation.owner] !== observation.neighbor ||
      bestDistortion[observation.owner] !== observation.distortion
    );
    const [owner, retired] = ownerBeforeRetired(
      store,
      observation.owner,
      observation.neighbor,
    );
    const previous = {
      owner: captureProxy(store.proxy, owner),
      retired: captureProxy(store.proxy, retired),
    };
    const leftClusterId = store.clusterId[owner];
    const rightClusterId = store.clusterId[retired];
    const neighborCount = graph.contract(owner, retired);
    combineSummarySlots(store, owner, retired);
    store.clusterId[owner] = nextClusterId++;
    if (!Number.isSafeInteger(store.clusterId[owner])) {
      throw new Error("Proxy v2 Cluster ID overflow");
    }
    fitSummarySlot(store, owner);
    copyErrorAuthority(store, owner, retired, previous);
    active[retired] = 0;
    generation[owner]++;
    generation[retired]++;
    activeCount--;
    mergeOrdinal++;
    log.append({
      mergeOrdinal,
      parentClusterId: store.clusterId[owner],
      leftClusterId,
      rightClusterId,
      ownerSlot: owner,
      retiredSlot: retired,
      activeCountAfterMerge: activeCount,
      marginalDistortion: observation.distortion,
    });
    bestNeighbor[retired] = -1;
    bestDistortion[retired] = Number.POSITIVE_INFINITY;
    recomputeBest(owner);
    for (let index = 0; index < neighborCount; index++) {
      updateBestForContractedOwner(graph.edgeScratch[index], owner, retired);
    }
    const threshold =
      PROXY_V2_HEAP_COMPACTION_FACTOR * activeCount +
      PROXY_V2_HEAP_COMPACTION_CONSTANT;
    if (
      heap.length > threshold ||
      heap.length + neighborCount + 1 > threshold ||
      heap.length + neighborCount + 1 > heap.capacity
    ) {
      rebuildHeap();
    } else {
      pushBest(owner);
      for (let index = 0; index < neighborCount; index++) {
        pushBest(graph.edgeScratch[index]);
      }
    }
    if (
      targetIndex < uniqueTargets.length &&
      activeCount === uniqueTargets[targetIndex]
    ) {
      const slots = [];
      for (let slot = 0; slot < source.count; slot++) {
        if (active[slot]) {
          slots.push(slot);
        }
      }
      const snapshot = materializeSummarySlots(store, slots);
      const authority = {
        targetCount: activeCount,
        clusterInventorySha256: snapshotDigest(store, snapshot.slots),
        sourceCountSum: snapshot.data.sourceCount.reduce(
          (total, value) => total + value,
          0,
        ),
        coverageMassSum: snapshot.coverageMass.reduce(
          (total, value) => total + value,
          0,
        ),
      };
      if (
        snapshot.data.count !== activeCount ||
        authority.sourceCountSum !==
          source.sourceCount.reduce((a, b) => a + b, 0)
      ) {
        throw new Error("Proxy v2 snapshot partition authority mismatch");
      }
      await options.onSnapshot?.(snapshot, authority);
      snapshots.push(authority);
      targetIndex++;
    }
  }
  const mergeLog = log.close();
  return {
    policyId: PROXY_V2_POLICY_ID,
    graphId: PROXY_V2_GRAPH_ID,
    priorityId: PROXY_V2_PRIORITY_ID,
    fitId: PROXY_V2_FIT_ID,
    snapshots,
    diagnostics: {
      positionAnchor: store.positionAnchor,
      initialEdgeCount: graph.initialEdgeCount,
      maximumLiveEdgeCount: graph.maximumLiveEdgeCount,
      finalLiveEdgeCount: graph.liveEdgeCount,
      summarySlotCount: source.count,
      mergeCount: mergeOrdinal,
      edgeCostEvaluationCount,
      neighborRecomputationCount,
      heapMaximumLength: heap.maximumLength,
      heapRebuildCount: heap.rebuildCount,
      mergeLog,
      opacityClampCount: store.opacityClampCount,
      coverageMassClampDelta: store.coverageMassClampDelta,
      coverageInflationCount: store.coverageInflationCount,
      maximumCoverageInflationFactor: store.maximumCoverageInflationFactor,
    },
  };
}
