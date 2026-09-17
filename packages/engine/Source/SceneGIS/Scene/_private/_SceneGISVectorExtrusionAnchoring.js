import Rectangle from "../../../Core/Rectangle.js";
import Coordinates from "../../Core/_private/_SceneGISVectorGlobeCoordinates.js";

function queryRectangle(batch) {
  let minimumX = Infinity,
    minimumY = Infinity;
  let maximumX = -Infinity,
    maximumY = -Infinity;
  for (const values of batch._resources._anchorCoordinates) {
    for (let i = 0; i < values.length; i += 2) {
      minimumX = Math.min(minimumX, values[i]);
      minimumY = Math.min(minimumY, values[i + 1]);
      maximumX = Math.max(maximumX, values[i]);
      maximumY = Math.max(maximumY, values[i + 1]);
    }
  }
  const bounds = batch._tileBounds;
  const rectangle = Coordinates.rectangle({
    minimumX: minimumX + bounds.minimumX,
    maximumX: maximumX + bounds.minimumX,
    minimumY: minimumY + bounds.maximumY,
    maximumY: maximumY + bounds.maximumY,
  });
  if (rectangle.east - rectangle.west >= Math.PI * 2) {
    rectangle.west = -Math.PI;
    rectangle.east = Math.PI;
  } else {
    rectangle.west = Math.atan2(
      Math.sin(rectangle.west),
      Math.cos(rectangle.west),
    );
    rectangle.east = Math.atan2(
      Math.sin(rectangle.east),
      Math.cos(rectangle.east),
    );
  }
  return rectangle;
}

function updateState(batch, terrain) {
  if (batch._extrusionTerrain === terrain) {
    return;
  }
  batch._extrusionTerrain = terrain;
  const rectangle = (batch._extrusionRectangle ??= queryRectangle(batch));
  const entries = new Map();
  for (const entry of terrain.entries) {
    if (Rectangle.intersection(rectangle, entry.rectangle)) {
      entry.needed = true;
      entries.set(entry, entry.result);
    }
  }
  const previous = batch._extrusionState;
  if (
    previous?.provider === terrain.provider &&
    previous.entries.size === entries.size &&
    [...entries].every(
      ([entry, result]) =>
        previous.entries.has(entry) && previous.entries.get(entry) === result,
    )
  ) {
    return;
  }
  batch._extrusionState = {
    provider: terrain.provider,
    entries,
    // Initial Worker geometry already lies on the ellipsoid.
    applied: !previous && entries.size === 0,
  };
}

function publish(batch, state) {
  const streams = state.result.streams;
  const bytes = streams.reduce(
    (sum, stream) => sum + stream.high.byteLength + stream.low.byteLength,
    0,
  );
  const owner = batch._owner;
  const budget = owner._uploadBudget;
  if (
    budget &&
    budget.bytes > 0 &&
    (performance.now() >= budget.deadline ||
      budget.bytes + bytes > owner._maximumUploadBytesPerFrame)
  ) {
    return;
  }
  for (let i = 0; i < streams.length; i++) {
    for (const [axis, name] of ["high", "low"].entries()) {
      const stream = batch._resources._anchorBuffers[i * 2 + axis];
      const values = streams[i][name];
      let first = Infinity,
        last = 0;
      for (let j = 0; j < values.length; j++) {
        if (values[j] !== stream.values[j]) {
          first = Math.min(first, j);
          last = j + 1;
        }
      }
      if (last > first) {
        stream.buffer.copyFromArrayView(
          values.subarray(first, last),
          first * 4,
        );
      }
      stream.values = values;
    }
  }
  if (budget) {
    budget.bytes += bytes;
  }
  state.result = undefined;
  state.applied = true;
}

function update(batch, frameState) {
  const owner = batch._owner;
  const terrain = owner._terrain;
  if (!terrain) {
    return;
  }
  updateState(batch, terrain);
  const state = batch._extrusionState;
  if (state.applied || state.failed) {
    return;
  }
  if (state.result) {
    publish(batch, state);
    return;
  }
  if (
    batch._extrusionJob ||
    !owner._workers.available ||
    owner._extrusionTaskFrame === frameState.frameNumber
  ) {
    return;
  }
  if (
    [...state.entries.keys()].some((entry) => !entry.result && !entry.failed)
  ) {
    return;
  }
  const resources = batch._resources;
  // Structured clone borrows neither native terrain buffers nor live GPU streams.
  const promise = owner._workers.schedule({
    kind: "extrusion-terrain",
    entries: [...state.entries].map(([entry, result]) => ({
      rectangle: entry.rectangle,
      height: entry.height,
      result,
    })),
    streams: resources._anchorCoordinates.map((coordinates, i) => ({
      coordinates,
      data: resources._extrusionData[i],
    })),
    bounds: {
      minimumX: batch._tileBounds.minimumX,
      maximumY: batch._tileBounds.maximumY,
    },
    origin: batch._origin,
  });
  if (!promise) {
    return;
  }
  owner._extrusionTaskFrame = frameState.frameNumber;
  const job = (batch._extrusionJob = { state });
  promise.then(
    (result) => {
      if (batch._extrusionJob !== job) {
        return;
      }
      batch._extrusionJob = undefined;
      if (batch._extrusionState === state) {
        state.result = result;
      }
      owner._scene.requestRender();
    },
    (error) => {
      if (batch._extrusionJob !== job) {
        return;
      }
      batch._extrusionJob = undefined;
      if (batch._extrusionState === state) {
        state.failed = true;
        owner._errorEvent.raiseEvent({
          layer: owner,
          resource: "extrusion-terrain",
          error,
        });
      }
      owner._scene.requestRender();
    },
  );
}

function pending(batch) {
  const state = batch._extrusionState;
  return !!state && !state.applied && !state.failed;
}

function clear(batch) {
  batch._extrusionJob = undefined;
  batch._extrusionState = undefined;
  batch._extrusionTerrain = undefined;
}

/** Bounded Globe building updates; only normal render publishes Worker results. @private */
export default { update, pending, clear };
