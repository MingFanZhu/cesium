export class BoundedObservationHeap {
  constructor(capacity) {
    this.capacity = capacity;
    this.length = 0;
    this.owner = new Uint32Array(capacity);
    this.ownerGeneration = new Uint32Array(capacity);
    this.neighbor = new Uint32Array(capacity);
    this.neighborGeneration = new Uint32Array(capacity);
    this.distortion = new Float64Array(capacity);
    this.stableLow = new Uint32Array(capacity);
    this.stableHigh = new Uint32Array(capacity);
    this.clusterLow = new Float64Array(capacity);
    this.clusterHigh = new Float64Array(capacity);
    this.maximumLength = 0;
    this.rebuildCount = 0;
  }

  clear(rebuild = false) {
    this.length = 0;
    if (rebuild) {
      this.rebuildCount++;
    }
  }

  #less(left, right) {
    return (
      (this.distortion[left] - this.distortion[right] ||
        this.stableLow[left] - this.stableLow[right] ||
        this.stableHigh[left] - this.stableHigh[right] ||
        this.clusterLow[left] - this.clusterLow[right] ||
        this.clusterHigh[left] - this.clusterHigh[right]) < 0
    );
  }

  #copy(target, source) {
    this.owner[target] = this.owner[source];
    this.ownerGeneration[target] = this.ownerGeneration[source];
    this.neighbor[target] = this.neighbor[source];
    this.neighborGeneration[target] = this.neighborGeneration[source];
    this.distortion[target] = this.distortion[source];
    this.stableLow[target] = this.stableLow[source];
    this.stableHigh[target] = this.stableHigh[source];
    this.clusterLow[target] = this.clusterLow[source];
    this.clusterHigh[target] = this.clusterHigh[source];
  }

  #swap(first, second) {
    const fields = [
      this.owner,
      this.ownerGeneration,
      this.neighbor,
      this.neighborGeneration,
      this.distortion,
      this.stableLow,
      this.stableHigh,
      this.clusterLow,
      this.clusterHigh,
    ];
    for (const field of fields) {
      const value = field[first];
      field[first] = field[second];
      field[second] = value;
    }
  }

  push(observation) {
    if (this.length >= this.capacity) {
      throw new Error("Proxy v2 observation heap exceeded its fixed capacity");
    }
    let index = this.length++;
    this.owner[index] = observation.owner;
    this.ownerGeneration[index] = observation.ownerGeneration;
    this.neighbor[index] = observation.neighbor;
    this.neighborGeneration[index] = observation.neighborGeneration;
    this.distortion[index] = observation.distortion;
    this.stableLow[index] = observation.stableLow;
    this.stableHigh[index] = observation.stableHigh;
    this.clusterLow[index] = observation.clusterLow;
    this.clusterHigh[index] = observation.clusterHigh;
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (!this.#less(index, parent)) {
        break;
      }
      this.#swap(index, parent);
      index = parent;
    }
    this.maximumLength = Math.max(this.maximumLength, this.length);
  }

  pop() {
    if (this.length === 0) {
      return undefined;
    }
    const result = {
      owner: this.owner[0],
      ownerGeneration: this.ownerGeneration[0],
      neighbor: this.neighbor[0],
      neighborGeneration: this.neighborGeneration[0],
      distortion: this.distortion[0],
      stableLow: this.stableLow[0],
      stableHigh: this.stableHigh[0],
      clusterLow: this.clusterLow[0],
      clusterHigh: this.clusterHigh[0],
    };
    this.length--;
    if (this.length > 0) {
      this.#copy(0, this.length);
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.length) {
          break;
        }
        let child = left;
        if (right < this.length && this.#less(right, left)) {
          child = right;
        }
        if (!this.#less(child, index)) {
          break;
        }
        this.#swap(index, child);
        index = child;
      }
    }
    return result;
  }
}
