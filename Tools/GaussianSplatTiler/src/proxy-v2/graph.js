import {
  createMortonCubeBounds,
  morton3d16,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSpatialMorton.js";
import { stableSortMorton } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSpatialRadixSort.js";
import { emptyBounds, extendPoint } from "../bounds.js";
import { PROXY_V2_PAIR_NEIGHBOR_WINDOW } from "./constants.js";

const LOCAL_MORTON_AXIS_MAX = 1023;

function completeNeighborEdgeCount(count) {
  const window = Math.min(
    PROXY_V2_PAIR_NEIGHBOR_WINDOW,
    Math.max(0, count - 1),
  );
  return window * count - (window * (window + 1)) / 2;
}

function quantize(value, minimum, maximum) {
  const extent = maximum - minimum;
  if (!(extent > 0)) {
    return 0;
  }
  return Math.round(
    Math.max(0, Math.min(1, (value - minimum) / extent)) *
      LOCAL_MORTON_AXIS_MAX,
  );
}

export function proxyV2MortonOrder(data) {
  const bounds = emptyBounds();
  for (let index = 0; index < data.count; index++) {
    const offset = index * 3;
    extendPoint(
      bounds,
      data.position[offset],
      data.position[offset + 1],
      data.position[offset + 2],
    );
  }
  const cube = createMortonCubeBounds(bounds);
  const keys = new BigUint64Array(data.count);
  const order = new Uint32Array(data.count);
  for (let index = 0; index < data.count; index++) {
    const offset = index * 3;
    keys[index] = morton3d16(
      quantize(data.position[offset], cube[0], cube[3]),
      quantize(data.position[offset + 1], cube[1], cube[4]),
      quantize(data.position[offset + 2], cube[2], cube[5]),
    );
    order[index] = index;
  }
  stableSortMorton(keys, order);
  let runStart = 0;
  while (runStart < order.length) {
    let runEnd = runStart + 1;
    while (runEnd < order.length && keys[runEnd] === keys[runStart]) {
      runEnd++;
    }
    if (runEnd - runStart > 1) {
      const run = [...order.subarray(runStart, runEnd)].sort(
        (left, right) => data.stableId[left] - data.stableId[right],
      );
      order.set(run, runStart);
    }
    runStart = runEnd;
  }
  return order;
}

export class ContractibleMorton16Graph {
  constructor(data, active) {
    const order = proxyV2MortonOrder(data);
    const edgeCount = completeNeighborEdgeCount(order.length);
    this.order = order;
    this.active = active;
    this.head = new Int32Array(data.count);
    this.head.fill(-1);
    this.first = new Uint32Array(edgeCount);
    this.second = new Uint32Array(edgeCount);
    this.nextFirst = new Int32Array(edgeCount);
    this.nextSecond = new Int32Array(edgeCount);
    this.alive = new Uint8Array(edgeCount);
    this.neighborMark = new Uint32Array(data.count);
    this.neighborEdge = new Int32Array(data.count);
    this.neighborPosition = new Int32Array(data.count);
    this.edgeScratch = new Int32Array(data.count);
    this.markGeneration = 0;
    let edge = 0;
    for (let position = 0; position < order.length; position++) {
      const limit = Math.min(
        order.length,
        position + 1 + PROXY_V2_PAIR_NEIGHBOR_WINDOW,
      );
      for (let next = position + 1; next < limit; next++) {
        const first = order[position];
        const second = order[next];
        this.first[edge] = first;
        this.second[edge] = second;
        this.nextFirst[edge] = this.head[first];
        this.nextSecond[edge] = this.head[second];
        this.head[first] = edge;
        this.head[second] = edge;
        this.alive[edge] = 1;
        edge++;
      }
    }
    if (edge !== edgeCount) {
      throw new Error("Proxy v2 initial Morton16 edge count mismatch");
    }
    this.initialEdgeCount = edgeCount;
    this.liveEdgeCount = edgeCount;
    this.maximumLiveEdgeCount = edgeCount;
  }

  other(edge, slot) {
    if (this.first[edge] === slot) {
      return this.second[edge];
    }
    if (this.second[edge] === slot) {
      return this.first[edge];
    }
    return -1;
  }

  next(edge, slot) {
    if (this.first[edge] === slot) {
      return this.nextFirst[edge];
    }
    if (this.second[edge] === slot) {
      return this.nextSecond[edge];
    }
    return -1;
  }

  forEachNeighbor(slot, callback) {
    let edge = this.head[slot];
    while (edge !== -1) {
      const next = this.next(edge, slot);
      if (this.alive[edge]) {
        const other = this.other(edge, slot);
        if (other >= 0 && this.active[other]) {
          callback(other, edge);
        }
      }
      edge = next;
    }
  }

  collectNeighbors(slot) {
    let count = 0;
    this.forEachNeighbor(slot, (neighbor) => {
      this.edgeScratch[count++] = neighbor;
    });
    return count;
  }

  #retire(edge) {
    if (this.alive[edge]) {
      this.alive[edge] = 0;
      this.liveEdgeCount--;
    }
  }

  contract(owner, retired) {
    this.markGeneration++;
    if (this.markGeneration === 0xffffffff) {
      this.neighborMark.fill(0);
      this.markGeneration = 1;
    }
    const mark = this.markGeneration;
    let keptCount = 0;
    const collect = (slot) => {
      let edge = this.head[slot];
      while (edge !== -1) {
        const next = this.next(edge, slot);
        if (this.alive[edge]) {
          const other = this.other(edge, slot);
          if (other === owner || other === retired || !this.active[other]) {
            this.#retire(edge);
          } else if (other >= 0) {
            if (this.neighborMark[other] !== mark) {
              this.neighborMark[other] = mark;
              this.neighborEdge[other] = edge;
              this.neighborPosition[other] = keptCount;
              this.edgeScratch[keptCount++] = edge;
            } else {
              const previous = this.neighborEdge[other];
              if (edge < previous) {
                this.#retire(previous);
                this.neighborEdge[other] = edge;
                this.edgeScratch[this.neighborPosition[other]] = edge;
              } else {
                this.#retire(edge);
              }
            }
          }
        }
        edge = next;
      }
    };
    collect(owner);
    collect(retired);
    this.head[owner] = -1;
    this.head[retired] = -1;
    for (let index = 0; index < keptCount; index++) {
      const edge = this.edgeScratch[index];
      if (!this.alive[edge]) {
        continue;
      }
      if (this.first[edge] === retired) {
        this.first[edge] = owner;
      } else if (this.second[edge] === retired) {
        this.second[edge] = owner;
      }
      if (this.first[edge] === owner) {
        this.nextFirst[edge] = this.head[owner];
      } else if (this.second[edge] === owner) {
        this.nextSecond[edge] = this.head[owner];
      } else {
        throw new Error("Proxy v2 graph contraction lost its owner endpoint");
      }
      this.head[owner] = edge;
    }
    if (this.liveEdgeCount < 0 || this.liveEdgeCount > this.initialEdgeCount) {
      throw new Error("Proxy v2 live edge bound violation");
    }
    this.maximumLiveEdgeCount = Math.max(
      this.maximumLiveEdgeCount,
      this.liveEdgeCount,
    );
    return this.collectNeighbors(owner);
  }

  validateConnected(activeCount) {
    if (activeCount <= 1) {
      return true;
    }
    let start = -1;
    for (let slot = 0; slot < this.active.length; slot++) {
      if (this.active[slot]) {
        start = slot;
        break;
      }
    }
    const visited = new Uint8Array(this.active.length);
    const queue = new Uint32Array(activeCount);
    let read = 0;
    let write = 0;
    queue[write++] = start;
    visited[start] = 1;
    while (read < write) {
      const slot = queue[read++];
      const neighborCount = this.collectNeighbors(slot);
      for (let index = 0; index < neighborCount; index++) {
        const neighbor = this.edgeScratch[index];
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          queue[write++] = neighbor;
        }
      }
    }
    return write === activeCount;
  }
}
