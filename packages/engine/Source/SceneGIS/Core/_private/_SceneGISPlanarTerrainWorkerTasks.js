import Lerc from "lerc";
import DeveloperError from "../../../Core/DeveloperError.js";

const MAX_QUANTIZED = 32767;
const QUANTIZED_HEADER_BYTES = 88;

function isNumericTypedArray(value) {
  return (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    !(typeof BigInt64Array !== "undefined" && value instanceof BigInt64Array) &&
    !(typeof BigUint64Array !== "undefined" && value instanceof BigUint64Array)
  );
}

function validateDimensions(width, height) {
  if (
    !Number.isSafeInteger(width) ||
    width < 2 ||
    !Number.isSafeInteger(height) ||
    height < 2
  ) {
    throw new DeveloperError(
      "Heightmap task dimensions must be safe integers of at least two.",
    );
  }
  const sampleCount = width * height;
  if (!Number.isSafeInteger(sampleCount)) {
    throw new DeveloperError("The heightmap task sample count must be safe.");
  }
  return sampleCount;
}

function validateStructure(structure) {
  if (
    !structure ||
    !Number.isFinite(structure.heightScale) ||
    !Number.isFinite(structure.heightOffset) ||
    !Number.isSafeInteger(structure.elementsPerHeight) ||
    structure.elementsPerHeight < 1 ||
    !Number.isSafeInteger(structure.stride) ||
    structure.stride < structure.elementsPerHeight ||
    !Number.isFinite(structure.elementMultiplier) ||
    structure.elementMultiplier <= 0.0 ||
    typeof structure.isBigEndian !== "boolean"
  ) {
    throw new DeveloperError("The heightmap task structure is invalid.");
  }
}

function decodeHeight(buffer, structure, sampleIndex) {
  const offset = sampleIndex * structure.stride;
  let encodedHeight = 0.0;
  if (structure.isBigEndian) {
    for (let i = 0; i < structure.elementsPerHeight; ++i) {
      encodedHeight =
        encodedHeight * structure.elementMultiplier + buffer[offset + i];
    }
  } else {
    for (let i = structure.elementsPerHeight - 1; i >= 0; --i) {
      encodedHeight =
        encodedHeight * structure.elementMultiplier + buffer[offset + i];
    }
  }
  return encodedHeight * structure.heightScale + structure.heightOffset;
}

function validateLerc(parameters) {
  const sampleCount = validateDimensions(parameters.width, parameters.height);
  if (!(parameters.arrayBuffer instanceof ArrayBuffer)) {
    throw new DeveloperError("decodeLerc requires an ArrayBuffer payload.");
  }
  if (
    !Number.isFinite(parameters.minimumHeight) ||
    !Number.isFinite(parameters.maximumHeight) ||
    parameters.maximumHeight < parameters.minimumHeight
  ) {
    throw new DeveloperError(
      "decodeLerc global heights must be finite and ordered.",
    );
  }
  return sampleCount;
}

function decodeLerc(parameters, transferableObjects) {
  const sampleCount = validateLerc(parameters);
  const decoded = Lerc.decode(parameters.arrayBuffer);
  if (
    !decoded ||
    decoded.width !== parameters.width ||
    decoded.height !== parameters.height ||
    !Array.isArray(decoded.pixels) ||
    decoded.pixels.length !== 1 ||
    !isNumericTypedArray(decoded.pixels[0])
  ) {
    throw new DeveloperError(
      "LERC data must contain one numeric band with the configured dimensions.",
    );
  }
  const samples = decoded.pixels[0];
  if (samples.length !== sampleCount) {
    throw new DeveloperError(
      "The LERC band length must match the configured dimensions.",
    );
  }
  const mask = decoded.mask;
  if (
    mask !== null &&
    mask !== undefined &&
    (!isNumericTypedArray(mask) ||
      mask.length !== sampleCount ||
      Array.prototype.some.call(mask, (value) => value === 0))
  ) {
    throw new DeveloperError("LERC data must make every height sample valid.");
  }
  if (!Array.isArray(decoded.statistics) || decoded.statistics.length !== 1) {
    throw new DeveloperError("LERC data must contain one statistics record.");
  }
  const statistics = decoded.statistics[0];
  if (
    !statistics ||
    !Number.isFinite(statistics.minValue) ||
    !Number.isFinite(statistics.maxValue) ||
    statistics.maxValue < statistics.minValue ||
    statistics.minValue === Number.MAX_VALUE
  ) {
    throw new DeveloperError("LERC statistics must describe finite heights.");
  }
  const noDataValue = statistics.noDataValue;
  if (noDataValue !== undefined && !Number.isFinite(noDataValue)) {
    throw new DeveloperError("LERC noDataValue must be finite when defined.");
  }
  for (let i = 0; i < samples.length; ++i) {
    const value = samples[i];
    if (
      !Number.isFinite(value) ||
      value === noDataValue ||
      value < parameters.minimumHeight ||
      value > parameters.maximumHeight
    ) {
      throw new DeveloperError(
        "LERC height samples must be finite, valid, and within the configured range.",
      );
    }
  }
  transferableObjects.push(samples.buffer);
  return {
    kind: "decodeLerc",
    width: parameters.width,
    height: parameters.height,
    samples,
  };
}

function validateMeshParameters(parameters) {
  const sampleCount = validateDimensions(parameters.width, parameters.height);
  validateStructure(parameters.structure);
  const encodedElementCount = sampleCount * parameters.structure.stride;
  if (
    !Number.isSafeInteger(encodedElementCount) ||
    !isNumericTypedArray(parameters.buffer) ||
    parameters.buffer.length !== encodedElementCount
  ) {
    throw new DeveloperError(
      "createHeightmapMesh requires a complete numeric height buffer clone.",
    );
  }
  const extent = parameters.extent;
  if (
    !extent ||
    !Number.isFinite(extent.minimumX) ||
    !Number.isFinite(extent.minimumY) ||
    !Number.isFinite(extent.maximumX) ||
    !Number.isFinite(extent.maximumY) ||
    extent.maximumX <= extent.minimumX ||
    extent.maximumY <= extent.minimumY
  ) {
    throw new DeveloperError(
      "The heightmap mesh extent must be finite and ordered.",
    );
  }
  if (
    !Number.isFinite(parameters.minimumHeight) ||
    !Number.isFinite(parameters.maximumHeight) ||
    parameters.maximumHeight < parameters.minimumHeight ||
    !Number.isFinite(parameters.effectiveGeometricError) ||
    parameters.effectiveGeometricError < 0.0 ||
    !Number.isFinite(parameters.providerMinimumHeight)
  ) {
    throw new DeveloperError("The heightmap mesh metadata is invalid.");
  }
  return sampleCount;
}

function pushSkirtEdge(
  positions,
  surfaceIndices,
  offset,
  referenceHeight,
  skirtDepth,
  providerMinimumHeight,
) {
  let skirtMinimumHeight = Number.POSITIVE_INFINITY;
  for (let i = 0; i < surfaceIndices.length; ++i) {
    const sourceOffset = surfaceIndices[i] * 3;
    const edgeHeight = referenceHeight + positions[sourceOffset + 2];
    const skirtHeight = Math.max(
      edgeHeight - skirtDepth,
      providerMinimumHeight,
    );
    const relativeSkirtHeight = Math.fround(skirtHeight - referenceHeight);
    if (!Number.isFinite(relativeSkirtHeight)) {
      throw new DeveloperError(
        "Every terrain skirt position must be finite in Float32.",
      );
    }
    positions[offset++] = positions[sourceOffset];
    positions[offset++] = positions[sourceOffset + 1];
    positions[offset++] = relativeSkirtHeight;
    skirtMinimumHeight = Math.min(skirtMinimumHeight, skirtHeight);
  }
  return { offset, skirtMinimumHeight };
}

function accumulateTriangleNormal(positions, accumulated, i0, i1, i2) {
  const offset0 = i0 * 3;
  const offset1 = i1 * 3;
  const offset2 = i2 * 3;
  const ax = positions[offset1] - positions[offset0];
  const ay = positions[offset1 + 1] - positions[offset0 + 1];
  const az = positions[offset1 + 2] - positions[offset0 + 2];
  const bx = positions[offset2] - positions[offset0];
  const by = positions[offset2 + 1] - positions[offset0 + 1];
  const bz = positions[offset2 + 2] - positions[offset0 + 2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  accumulated[offset0] += nx;
  accumulated[offset0 + 1] += ny;
  accumulated[offset0 + 2] += nz;
  accumulated[offset1] += nx;
  accumulated[offset1 + 1] += ny;
  accumulated[offset1 + 2] += nz;
  accumulated[offset2] += nx;
  accumulated[offset2 + 1] += ny;
  accumulated[offset2 + 2] += nz;
}

function toSNorm(value) {
  return Math.round((Math.max(-1.0, Math.min(1.0, value)) * 0.5 + 0.5) * 255.0);
}

function octEncodeNormal(x, y, z, result, offset) {
  const length = Math.abs(x) + Math.abs(y) + Math.abs(z);
  if (!Number.isFinite(length) || length === 0.0) {
    result[offset] = 128;
    result[offset + 1] = 128;
    return;
  }
  let octX = x / length;
  let octY = y / length;
  if (z < 0.0) {
    const oldX = octX;
    octX = (1.0 - Math.abs(octY)) * (oldX < 0.0 ? -1.0 : 1.0);
    octY = (1.0 - Math.abs(oldX)) * (octY < 0.0 ? -1.0 : 1.0);
  }
  result[offset] = toSNorm(octX);
  result[offset + 1] = toSNorm(octY);
}

function createOctEncodedNormals(
  positions,
  surfaceVertexCount,
  surfaceIndices,
  width,
  height,
  skirtEdges,
) {
  const accumulated = new Float64Array(surfaceVertexCount * 3);
  if (surfaceIndices) {
    for (let i = 0; i < surfaceIndices.length; i += 3) {
      accumulateTriangleNormal(
        positions,
        accumulated,
        surfaceIndices[i],
        surfaceIndices[i + 1],
        surfaceIndices[i + 2],
      );
    }
  } else {
    for (let row = 0; row + 1 < height; ++row) {
      for (let column = 0; column + 1 < width; ++column) {
        const upperLeft = row * width + column;
        const upperRight = upperLeft + 1;
        const lowerLeft = upperLeft + width;
        const lowerRight = lowerLeft + 1;
        accumulateTriangleNormal(
          positions,
          accumulated,
          upperLeft,
          lowerLeft,
          upperRight,
        );
        accumulateTriangleNormal(
          positions,
          accumulated,
          upperRight,
          lowerLeft,
          lowerRight,
        );
      }
    }
  }

  const vertexCount = positions.length / 3;
  const encoded = new Uint8Array(vertexCount * 2);
  // This coordinate-neutral oct encoding is synchronized conceptually with
  // packages/engine/Source/Core/AttributeCompression.js at upstream
  // 6d5d8b1f0725b6f831b336463f4b11c98023427b.
  for (let i = 0; i < surfaceVertexCount; ++i) {
    const sourceOffset = i * 3;
    octEncodeNormal(
      accumulated[sourceOffset],
      accumulated[sourceOffset + 1],
      accumulated[sourceOffset + 2],
      encoded,
      i * 2,
    );
  }
  let skirtOffset = surfaceVertexCount;
  for (const edge of skirtEdges) {
    for (let i = 0; i < edge.length; ++i) {
      const sourceOffset = edge[i] * 2;
      const targetOffset = (skirtOffset + i) * 2;
      encoded[targetOffset] = encoded[sourceOffset];
      encoded[targetOffset + 1] = encoded[sourceOffset + 1];
    }
    skirtOffset += edge.length;
  }
  return encoded;
}

function createHeightmapMesh(parameters, transferableObjects) {
  const surfaceVertexCount = validateMeshParameters(parameters);
  const width = parameters.width;
  const height = parameters.height;
  const skirtVertexCount = height + width + height + width;
  const vertexCount = surfaceVertexCount + skirtVertexCount;
  if (!Number.isSafeInteger(vertexCount)) {
    throw new DeveloperError("The terrain mesh vertex count must be safe.");
  }
  const referenceHeight =
    parameters.minimumHeight * 0.5 + parameters.maximumHeight * 0.5;
  if (!Number.isFinite(referenceHeight)) {
    throw new DeveloperError("The terrain reference height must be finite.");
  }

  const positions = new Float32Array(vertexCount * 3);
  let offset = 0;
  for (let row = 0; row < height; ++row) {
    const localY = 0.5 - row / (height - 1);
    for (let column = 0; column < width; ++column) {
      const localX = column / (width - 1) - 0.5;
      const sampleIndex = row * width + column;
      const decodedHeight = decodeHeight(
        parameters.buffer,
        parameters.structure,
        sampleIndex,
      );
      const floatX = Math.fround(localX);
      const floatY = Math.fround(localY);
      const floatZ = Math.fround(decodedHeight - referenceHeight);
      if (
        !Number.isFinite(decodedHeight) ||
        decodedHeight < parameters.minimumHeight ||
        decodedHeight > parameters.maximumHeight ||
        !Number.isFinite(floatX) ||
        !Number.isFinite(floatY) ||
        !Number.isFinite(floatZ)
      ) {
        throw new DeveloperError(
          "Every terrain mesh position must be finite and within the declared range.",
        );
      }
      positions[offset++] = floatX;
      positions[offset++] = floatY;
      positions[offset++] = floatZ;
    }
  }

  const west = new Uint32Array(height);
  const south = new Uint32Array(width);
  const east = new Uint32Array(height);
  const north = new Uint32Array(width);
  for (let row = 0; row < height; ++row) {
    west[row] = (height - row - 1) * width;
    east[row] = row * width + width - 1;
  }
  for (let column = 0; column < width; ++column) {
    south[column] = (height - 1) * width + width - column - 1;
    north[column] = column;
  }
  const skirtDepth = parameters.effectiveGeometricError * 4.0;
  let skirtMinimumHeight = parameters.minimumHeight;
  for (const edge of [west, south, east, north]) {
    const result = pushSkirtEdge(
      positions,
      edge,
      offset,
      referenceHeight,
      skirtDepth,
      parameters.providerMinimumHeight,
    );
    offset = result.offset;
    skirtMinimumHeight = Math.min(
      skirtMinimumHeight,
      result.skirtMinimumHeight,
    );
  }

  const octEncodedNormals = createOctEncodedNormals(
    positions,
    surfaceVertexCount,
    undefined,
    width,
    height,
    [west, south, east, north],
  );

  transferableObjects.push(positions.buffer, octEncodedNormals.buffer);
  return {
    kind: "createHeightmapMesh",
    positions,
    width,
    height,
    surfaceVertexCount,
    skirtVertexCount,
    vertexCount,
    referenceHeight,
    minimumHeight: parameters.minimumHeight,
    maximumHeight: parameters.maximumHeight,
    skirtMinimumHeight,
    positionByteLength: positions.byteLength,
    octEncodedNormals,
    normalByteLength: octEncodedNormals.byteLength,
    topologyKey: `${width}/${height}/skirt`,
  };
}

function checkedAdd(offset, byteLength, totalLength, name) {
  const end = offset + byteLength;
  if (!Number.isSafeInteger(end) || byteLength < 0 || end > totalLength) {
    throw new DeveloperError(`${name} exceeds the quantized-mesh payload.`);
  }
  return end;
}

function decodeZigZagDelta(view, offset, count) {
  // Coordinate-neutral quantized-mesh decoding is synchronized conceptually with
  // packages/engine/Source/Core/CesiumTerrainProvider.js at upstream
  // 6d5d8b1f0725b6f831b336463f4b11c98023427b; no ellipsoid fields are reused.
  const result = new Uint16Array(count);
  let previous = 0;
  for (let i = 0; i < count; ++i) {
    const code = view.getUint16(offset + i * 2, true);
    previous += (code >> 1) ^ -(code & 1);
    if (
      !Number.isSafeInteger(previous) ||
      previous < 0 ||
      previous > MAX_QUANTIZED
    ) {
      throw new DeveloperError("Quantized vertex delta decoding is invalid.");
    }
    result[i] = previous;
  }
  return result;
}

function decodeHighWater(view, offset, count, bytesPerIndex, vertexCount) {
  const ResultType = bytesPerIndex === 2 ? Uint16Array : Uint32Array;
  const result = new ResultType(count);
  let highest = 0;
  for (let i = 0; i < count; ++i) {
    const code =
      bytesPerIndex === 2
        ? view.getUint16(offset + i * 2, true)
        : view.getUint32(offset + i * 4, true);
    if (code > highest) {
      throw new DeveloperError(
        "Quantized triangle high-water decoding is invalid.",
      );
    }
    const index = highest - code;
    if (index >= vertexCount) {
      throw new DeveloperError("A quantized triangle index is out of range.");
    }
    result[i] = index;
    if (code === 0) {
      ++highest;
    }
  }
  return result;
}

function readIndexArray(view, offset, count, bytesPerIndex, vertexCount, name) {
  const ResultType = bytesPerIndex === 2 ? Uint16Array : Uint32Array;
  const result = new ResultType(count);
  for (let i = 0; i < count; ++i) {
    const index =
      bytesPerIndex === 2
        ? view.getUint16(offset + i * 2, true)
        : view.getUint32(offset + i * 4, true);
    if (index >= vertexCount) {
      throw new DeveloperError(`${name} contains an out-of-range index.`);
    }
    result[i] = index;
  }
  return result;
}

function validateQuantizedTopology(vertices, indices, edges) {
  const vertexCount = vertices.length / 3;
  const u = vertices;
  const v = vertices.subarray(vertexCount, vertexCount * 2);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    const area =
      (u[i1] - u[i0]) * (v[i2] - v[i0]) - (v[i1] - v[i0]) * (u[i2] - u[i0]);
    if (!Number.isFinite(area) || area <= 0) {
      throw new DeveloperError(
        "Quantized surface triangles must be counter-clockwise and nondegenerate.",
      );
    }
  }
  const definitions = [
    [edges.westIndices, u, 0, "west"],
    [edges.southIndices, v, 0, "south"],
    [edges.eastIndices, u, MAX_QUANTIZED, "east"],
    [edges.northIndices, v, MAX_QUANTIZED, "north"],
  ];
  for (const [edge, coordinate, expected, name] of definitions) {
    const seen = new Set();
    for (let i = 0; i < edge.length; ++i) {
      const index = edge[i];
      if (coordinate[index] !== expected || seen.has(index)) {
        throw new DeveloperError(`The ${name} quantized edge is invalid.`);
      }
      seen.add(index);
    }
    for (let i = 0; i < vertexCount; ++i) {
      if (coordinate[i] === expected && !seen.has(i)) {
        throw new DeveloperError(`The ${name} quantized edge is incomplete.`);
      }
    }
  }
}

function decodeQuantizedMesh(parameters, transferableObjects) {
  if (!(parameters.arrayBuffer instanceof ArrayBuffer)) {
    throw new DeveloperError(
      "decodeQuantizedMesh requires an ArrayBuffer payload.",
    );
  }
  const view = new DataView(parameters.arrayBuffer);
  if (view.byteLength < QUANTIZED_HEADER_BYTES + 4) {
    throw new DeveloperError("The quantized-mesh payload is truncated.");
  }
  for (let offset = 0; offset < 24; offset += 8) {
    if (!Number.isFinite(view.getFloat64(offset, true))) {
      throw new DeveloperError(
        "Quantized-mesh ECEF header values must be finite.",
      );
    }
  }
  const quantizedMinimumHeight = view.getFloat32(24, true);
  const quantizedMaximumHeight = view.getFloat32(28, true);
  if (
    !Number.isFinite(quantizedMinimumHeight) ||
    !Number.isFinite(quantizedMaximumHeight) ||
    !Number.isFinite(quantizedMaximumHeight - quantizedMinimumHeight) ||
    quantizedMaximumHeight < quantizedMinimumHeight
  ) {
    throw new DeveloperError(
      "Quantized-mesh header heights must be finite and ordered.",
    );
  }
  for (let offset = 32; offset < QUANTIZED_HEADER_BYTES; offset += 8) {
    if (!Number.isFinite(view.getFloat64(offset, true))) {
      throw new DeveloperError(
        "Quantized-mesh skipped header values must be finite.",
      );
    }
  }
  let offset = QUANTIZED_HEADER_BYTES;
  const vertexCount = view.getUint32(offset, true);
  offset += 4;
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 3) {
    throw new DeveloperError("The quantized-mesh vertex count is invalid.");
  }
  const vertexBlockBytes = vertexCount * 3 * 2;
  offset = checkedAdd(
    offset,
    vertexBlockBytes,
    view.byteLength,
    "Quantized vertices",
  );
  const vertexStart = offset - vertexBlockBytes;
  const u = decodeZigZagDelta(view, vertexStart, vertexCount);
  const v = decodeZigZagDelta(view, vertexStart + vertexCount * 2, vertexCount);
  const h = decodeZigZagDelta(view, vertexStart + vertexCount * 4, vertexCount);
  const quantizedVertices = new Uint16Array(vertexCount * 3);
  quantizedVertices.set(u, 0);
  quantizedVertices.set(v, vertexCount);
  quantizedVertices.set(h, vertexCount * 2);

  const bytesPerIndex = vertexCount > 65536 ? 4 : 2;
  const remainder = offset % bytesPerIndex;
  if (remainder !== 0) {
    offset = checkedAdd(
      offset,
      bytesPerIndex - remainder,
      view.byteLength,
      "Index alignment",
    );
  }
  offset = checkedAdd(offset, 4, view.byteLength, "Triangle count");
  const triangleCount = view.getUint32(offset - 4, true);
  const indexCount = triangleCount * 3;
  if (!Number.isSafeInteger(indexCount) || indexCount === 0) {
    throw new DeveloperError("The quantized-mesh triangle count is invalid.");
  }
  const indexBytes = indexCount * bytesPerIndex;
  offset = checkedAdd(offset, indexBytes, view.byteLength, "Triangle indices");
  const indices = decodeHighWater(
    view,
    offset - indexBytes,
    indexCount,
    bytesPerIndex,
    vertexCount,
  );
  const edgeNames = [
    "westIndices",
    "southIndices",
    "eastIndices",
    "northIndices",
  ];
  const edges = {};
  for (const name of edgeNames) {
    offset = checkedAdd(offset, 4, view.byteLength, `${name} count`);
    const count = view.getUint32(offset - 4, true);
    const byteLength = count * bytesPerIndex;
    if (!Number.isSafeInteger(byteLength)) {
      throw new DeveloperError(`${name} byte length must be safe.`);
    }
    offset = checkedAdd(offset, byteLength, view.byteLength, name);
    edges[name] = readIndexArray(
      view,
      offset - byteLength,
      count,
      bytesPerIndex,
      vertexCount,
      name,
    );
  }
  while (offset < view.byteLength) {
    offset = checkedAdd(
      offset,
      5,
      view.byteLength,
      "Quantized extension header",
    );
    const length = view.getUint32(offset - 4, true);
    offset = checkedAdd(offset, length, view.byteLength, "Quantized extension");
  }
  validateQuantizedTopology(quantizedVertices, indices, edges);
  const arrays = [
    quantizedVertices,
    indices,
    ...edgeNames.map((name) => edges[name]),
  ];
  for (const array of arrays) {
    transferableObjects.push(array.buffer);
  }
  return {
    kind: "decodeQuantizedMesh",
    quantizedVertices,
    indices,
    ...edges,
    quantizedMinimumHeight,
    quantizedMaximumHeight,
  };
}

function validateQuantizedTask(parameters) {
  if (
    !(parameters.quantizedVertices instanceof Uint16Array) ||
    parameters.quantizedVertices.length % 3 !== 0
  ) {
    throw new DeveloperError("A complete quantized vertex clone is required.");
  }
  for (const name of [
    "indices",
    "westIndices",
    "southIndices",
    "eastIndices",
    "northIndices",
  ]) {
    if (
      !(parameters[name] instanceof Uint16Array) &&
      !(parameters[name] instanceof Uint32Array)
    ) {
      throw new DeveloperError(`A quantized ${name} clone is required.`);
    }
  }
  if (
    !Number.isFinite(parameters.quantizedMinimumHeight) ||
    !Number.isFinite(parameters.quantizedMaximumHeight) ||
    !Number.isFinite(
      parameters.quantizedMaximumHeight - parameters.quantizedMinimumHeight,
    ) ||
    parameters.quantizedMaximumHeight < parameters.quantizedMinimumHeight ||
    (parameters.kind === "createQuantizedMeshMesh" &&
      (!Number.isFinite(parameters.minimumHeight) ||
        !Number.isFinite(parameters.maximumHeight) ||
        !Number.isFinite(parameters.maximumHeight - parameters.minimumHeight) ||
        parameters.minimumHeight < parameters.quantizedMinimumHeight ||
        parameters.maximumHeight > parameters.quantizedMaximumHeight ||
        parameters.maximumHeight < parameters.minimumHeight ||
        !Number.isFinite(parameters.effectiveGeometricError) ||
        parameters.effectiveGeometricError < 0 ||
        !Number.isFinite(parameters.providerMinimumHeight) ||
        parameters.providerMinimumHeight > parameters.minimumHeight ||
        !parameters.extent ||
        !Number.isFinite(parameters.extent.minimumX) ||
        !Number.isFinite(parameters.extent.minimumY) ||
        !Number.isFinite(parameters.extent.maximumX) ||
        !Number.isFinite(parameters.extent.maximumY) ||
        !Number.isFinite(
          parameters.extent.maximumX - parameters.extent.minimumX,
        ) ||
        !Number.isFinite(
          parameters.extent.maximumY - parameters.extent.minimumY,
        ) ||
        parameters.extent.maximumX <= parameters.extent.minimumX ||
        parameters.extent.maximumY <= parameters.extent.minimumY))
  ) {
    throw new DeveloperError(
      "Quantized task heights must be finite and ordered.",
    );
  }
  validateQuantizedTopology(
    parameters.quantizedVertices,
    parameters.indices,
    parameters,
  );
  return parameters.quantizedVertices.length / 3;
}

function appendQuantizedSkirt(
  positions,
  indices,
  edge,
  surfaceVertexCount,
  offset,
  referenceHeight,
  skirtDepth,
  minimumHeight,
) {
  // Edge-skirt ownership follows the topology idea in
  // packages/engine/Source/Workers/createVerticesFromQuantizedTerrainMesh.js at
  // upstream 6d5d8b1f0725b6f831b336463f4b11c98023427b, specialized to planar XYZ.
  let skirtMinimumHeight = Number.POSITIVE_INFINITY;
  for (let i = 0; i < edge.length; ++i) {
    const source = edge[i];
    const sourceOffset = source * 3;
    const height = referenceHeight + positions[sourceOffset + 2];
    const skirtHeight = Math.max(height - skirtDepth, minimumHeight);
    positions[(surfaceVertexCount + offset + i) * 3] = positions[sourceOffset];
    positions[(surfaceVertexCount + offset + i) * 3 + 1] =
      positions[sourceOffset + 1];
    positions[(surfaceVertexCount + offset + i) * 3 + 2] = Math.fround(
      skirtHeight - referenceHeight,
    );
    skirtMinimumHeight = Math.min(skirtMinimumHeight, skirtHeight);
  }
  for (let i = 0; i + 1 < edge.length; ++i) {
    const a = edge[i];
    const b = edge[i + 1];
    const sa = surfaceVertexCount + offset + i;
    const sb = sa + 1;
    indices.push(a, sa, b, b, sa, sb);
  }
  return skirtMinimumHeight;
}

function canonicalizeQuantizedEdges(parameters, vertexCount) {
  const u = parameters.quantizedVertices;
  const v = parameters.quantizedVertices.subarray(vertexCount, vertexCount * 2);
  function sorted(edge, coordinate, descending) {
    return Array.from(edge).sort((left, right) => {
      const difference = coordinate[left] - coordinate[right];
      return (descending ? -difference : difference) || left - right;
    });
  }
  // createVerticesFromQuantizedTerrainMesh.js at upstream
  // 6d5d8b1f0725b6f831b336463f4b11c98023427b canonicalizes the four
  // input edge lists before building skirts. This planar specialization keeps
  // the same perimeter directions without mutating TerrainData-owned storage.
  return [
    sorted(parameters.westIndices, v, false),
    sorted(parameters.southIndices, u, true),
    sorted(parameters.eastIndices, v, true),
    sorted(parameters.northIndices, u, false),
  ];
}

function buildQueryGrid(vertices, indices) {
  const vertexCount = vertices.length / 3;
  const u = vertices;
  const v = vertices.subarray(vertexCount, vertexCount * 2);
  const triangleCount = indices.length / 3;
  const budget = Math.max(triangleCount, triangleCount * 8);
  let dimension = Math.min(
    32,
    Math.max(1, Math.ceil(Math.sqrt(triangleCount))),
  );
  let cells;
  let referenceCount;
  for (;;) {
    cells = Array.from({ length: dimension * dimension }, () => []);
    referenceCount = 0;
    for (let triangle = 0; triangle < triangleCount; ++triangle) {
      const i0 = indices[triangle * 3];
      const i1 = indices[triangle * 3 + 1];
      const i2 = indices[triangle * 3 + 2];
      const minX = Math.floor(
        (Math.min(u[i0], u[i1], u[i2]) / MAX_QUANTIZED) * dimension,
      );
      const maxX = Math.min(
        dimension - 1,
        Math.floor((Math.max(u[i0], u[i1], u[i2]) / MAX_QUANTIZED) * dimension),
      );
      const minY = Math.floor(
        (Math.min(v[i0], v[i1], v[i2]) / MAX_QUANTIZED) * dimension,
      );
      const maxY = Math.min(
        dimension - 1,
        Math.floor((Math.max(v[i0], v[i1], v[i2]) / MAX_QUANTIZED) * dimension),
      );
      for (let y = Math.max(0, minY); y <= maxY; ++y) {
        for (let x = Math.max(0, minX); x <= maxX; ++x) {
          cells[y * dimension + x].push(triangle);
          ++referenceCount;
        }
      }
    }
    if (referenceCount <= budget || dimension === 1) {
      break;
    }
    dimension = Math.max(1, Math.floor(dimension / 2));
  }
  const offsets = new Uint32Array(cells.length + 1);
  const triangles = new Uint32Array(referenceCount);
  let cursor = 0;
  for (let i = 0; i < cells.length; ++i) {
    offsets[i] = cursor;
    triangles.set(cells[i], cursor);
    cursor += cells[i].length;
  }
  offsets[cells.length] = cursor;
  return { dimension, offsets, triangles };
}

function createQuantizedMesh(parameters, transferableObjects) {
  const surfaceVertexCount = validateQuantizedTask(parameters);
  const heightValues = parameters.quantizedVertices.subarray(
    surfaceVertexCount * 2,
  );
  const referenceHeight =
    parameters.minimumHeight * 0.5 + parameters.maximumHeight * 0.5;
  const edgeArrays = canonicalizeQuantizedEdges(parameters, surfaceVertexCount);
  const skirtVertexCount = edgeArrays.reduce(
    (sum, edge) => sum + edge.length,
    0,
  );
  const vertexCount = surfaceVertexCount + skirtVertexCount;
  if (!Number.isSafeInteger(vertexCount)) {
    throw new DeveloperError("The quantized mesh vertex count must be safe.");
  }
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < surfaceVertexCount; ++i) {
    positions[i * 3] = Math.fround(
      parameters.quantizedVertices[i] / MAX_QUANTIZED - 0.5,
    );
    positions[i * 3 + 1] = Math.fround(
      parameters.quantizedVertices[surfaceVertexCount + i] / MAX_QUANTIZED -
        0.5,
    );
    const height =
      parameters.quantizedMinimumHeight +
      (heightValues[i] / MAX_QUANTIZED) *
        (parameters.quantizedMaximumHeight - parameters.quantizedMinimumHeight);
    positions[i * 3 + 2] = Math.fround(height - referenceHeight);
  }
  const outputIndices = Array.from(parameters.indices);
  let skirtOffset = 0;
  let skirtMinimumHeight = parameters.minimumHeight;
  const skirtDepth = parameters.effectiveGeometricError * 4.0;
  for (const edge of edgeArrays) {
    skirtMinimumHeight = Math.min(
      skirtMinimumHeight,
      appendQuantizedSkirt(
        positions,
        outputIndices,
        edge,
        surfaceVertexCount,
        skirtOffset,
        referenceHeight,
        skirtDepth,
        parameters.providerMinimumHeight,
      ),
    );
    skirtOffset += edge.length;
  }
  const octEncodedNormals = createOctEncodedNormals(
    positions,
    surfaceVertexCount,
    parameters.indices,
    undefined,
    undefined,
    edgeArrays,
  );
  const IndexType = vertexCount > 65536 ? Uint32Array : Uint16Array;
  const indices = new IndexType(outputIndices);
  const query = buildQueryGrid(
    parameters.quantizedVertices,
    parameters.indices,
  );
  for (const array of [
    positions,
    octEncodedNormals,
    indices,
    query.offsets,
    query.triangles,
  ]) {
    transferableObjects.push(array.buffer);
  }
  return {
    kind: "createQuantizedMeshMesh",
    positions,
    indices,
    surfaceVertexCount,
    skirtVertexCount,
    vertexCount,
    surfaceIndexCount: parameters.indices.length,
    indexCount: indices.length,
    referenceHeight,
    minimumHeight: parameters.minimumHeight,
    maximumHeight: parameters.maximumHeight,
    skirtMinimumHeight,
    positionByteLength: positions.byteLength,
    octEncodedNormals,
    normalByteLength: octEncodedNormals.byteLength,
    indexByteLength: indices.byteLength,
    queryGridDimension: query.dimension,
    queryGridOffsets: query.offsets,
    queryGridTriangles: query.triangles,
    topologyKey: undefined,
    ownsIndices: true,
  };
}

function clipPolygon(vertices, axis, threshold, keepGreater) {
  const result = [];
  for (let i = 0; i < vertices.length; ++i) {
    const current = vertices[i];
    const previous = vertices[(i + vertices.length - 1) % vertices.length];
    const currentInside = keepGreater
      ? current[axis] >= threshold
      : current[axis] <= threshold;
    const previousInside = keepGreater
      ? previous[axis] >= threshold
      : previous[axis] <= threshold;
    if (currentInside !== previousInside) {
      const ratio =
        (threshold - previous[axis]) / (current[axis] - previous[axis]);
      result.push([
        axis === 0
          ? threshold
          : previous[0] + ratio * (current[0] - previous[0]),
        axis === 1
          ? threshold
          : previous[1] + ratio * (current[1] - previous[1]),
        previous[2] + ratio * (current[2] - previous[2]),
      ]);
    }
    if (currentInside) {
      result.push(current);
    }
  }
  return result;
}

function validateDirectChild(source, child) {
  if (
    !source ||
    !child ||
    !Number.isSafeInteger(source.x) ||
    !Number.isSafeInteger(source.y) ||
    !Number.isSafeInteger(source.level) ||
    child.level !== source.level + 1
  ) {
    throw new DeveloperError(
      "Quantized upsample addresses must identify a direct child.",
    );
  }
  const west = source.x * 2;
  const north = source.y * 2;
  if (
    !Number.isSafeInteger(west) ||
    !Number.isSafeInteger(north) ||
    (child.x !== west && child.x !== west + 1) ||
    (child.y !== north && child.y !== north + 1)
  ) {
    throw new DeveloperError(
      "Quantized upsample addresses must identify a direct child.",
    );
  }
  return { east: child.x === west + 1, south: child.y === north + 1 };
}

function upsampleQuantizedMesh(parameters, transferableObjects) {
  // Direct-child triangle clipping is informed by
  // packages/engine/Source/Workers/upsampleQuantizedTerrainMesh.js at upstream
  // 6d5d8b1f0725b6f831b336463f4b11c98023427b, without ellipsoid or encoding code.
  const count = validateQuantizedTask(parameters);
  const quadrant = validateDirectChild(
    parameters.sourceAddress,
    parameters.childAddress,
  );
  const u = parameters.quantizedVertices;
  const v = parameters.quantizedVertices.subarray(count, count * 2);
  const h = parameters.quantizedVertices.subarray(count * 2);
  const middle = MAX_QUANTIZED * 0.5;
  const minU = quadrant.east ? middle : 0;
  const maxU = quadrant.east ? MAX_QUANTIZED : middle;
  const minV = quadrant.south ? 0 : middle;
  const maxV = quadrant.south ? middle : MAX_QUANTIZED;
  const decoded = (index) => [
    u[index],
    v[index],
    parameters.quantizedMinimumHeight +
      (h[index] / MAX_QUANTIZED) *
        (parameters.quantizedMaximumHeight - parameters.quantizedMinimumHeight),
  ];
  const polygons = [];
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < parameters.indices.length; i += 3) {
    let polygon = [
      decoded(parameters.indices[i]),
      decoded(parameters.indices[i + 1]),
      decoded(parameters.indices[i + 2]),
    ];
    polygon = clipPolygon(polygon, 0, minU, true);
    polygon = clipPolygon(polygon, 0, maxU, false);
    polygon = clipPolygon(polygon, 1, minV, true);
    polygon = clipPolygon(polygon, 1, maxV, false);
    if (polygon.length >= 3) {
      polygons.push(polygon);
      for (const vertex of polygon) {
        minimumHeight = Math.min(minimumHeight, vertex[2]);
        maximumHeight = Math.max(maximumHeight, vertex[2]);
      }
    }
  }
  if (
    polygons.length === 0 ||
    !Number.isFinite(minimumHeight) ||
    !Number.isFinite(maximumHeight)
  ) {
    throw new DeveloperError(
      "Quantized upsample produced no finite child surface.",
    );
  }
  const output = [];
  const outputIndices = [];
  const vertexMap = new Map();
  const addVertex = (vertex) => {
    const qu = Math.round(((vertex[0] - minU) / (maxU - minU)) * MAX_QUANTIZED);
    const qv = Math.round(((vertex[1] - minV) / (maxV - minV)) * MAX_QUANTIZED);
    const qh =
      maximumHeight === minimumHeight
        ? 0
        : Math.round(
            ((vertex[2] - minimumHeight) / (maximumHeight - minimumHeight)) *
              MAX_QUANTIZED,
          );
    const key = `${qu}/${qv}`;
    let index = vertexMap.get(key);
    if (index === undefined) {
      index = output.length;
      vertexMap.set(key, index);
      output.push([qu, qv, qh]);
    }
    return index;
  };
  for (const polygon of polygons) {
    const first = addVertex(polygon[0]);
    for (let i = 1; i + 1 < polygon.length; ++i) {
      const second = addVertex(polygon[i]);
      const third = addVertex(polygon[i + 1]);
      const a = output[first];
      const b = output[second];
      const c = output[third];
      const area =
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (area > 0) {
        outputIndices.push(first, second, third);
      }
    }
  }
  const vertexCount = output.length;
  const quantizedVertices = new Uint16Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; ++i) {
    quantizedVertices[i] = output[i][0];
    quantizedVertices[vertexCount + i] = output[i][1];
    quantizedVertices[vertexCount * 2 + i] = output[i][2];
  }
  const IndexType = vertexCount > 65536 ? Uint32Array : Uint16Array;
  const indices = new IndexType(outputIndices);
  const makeEdge = (axis, value, sortAxis, ascending) =>
    new IndexType(
      output
        .map((vertex, index) => (vertex[axis] === value ? index : -1))
        .filter((index) => index >= 0)
        .sort((left, right) => {
          const difference = output[left][sortAxis] - output[right][sortAxis];
          return ascending ? difference : -difference;
        }),
    );
  const westIndices = makeEdge(0, 0, 1, true);
  const southIndices = makeEdge(1, 0, 0, false);
  const eastIndices = makeEdge(0, MAX_QUANTIZED, 1, false);
  const northIndices = makeEdge(1, MAX_QUANTIZED, 0, true);
  validateQuantizedTopology(quantizedVertices, indices, {
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
  });
  for (const array of [
    quantizedVertices,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
  ]) {
    transferableObjects.push(array.buffer);
  }
  return {
    kind: "upsampleQuantizedMesh",
    quantizedVertices,
    indices,
    westIndices,
    southIndices,
    eastIndices,
    northIndices,
    quantizedMinimumHeight: minimumHeight,
    quantizedMaximumHeight: maximumHeight,
  };
}

/**
 * Executes one private SceneGIS planar terrain Worker task.
 *
 * @param {object} parameters The serializable task parameters.
 * @param {Transferable[]} transferableObjects The output transfer list.
 * @returns {object} The transferable task result.
 * @private
 */
function processSceneGISPlanarTerrainTask(parameters, transferableObjects) {
  if (!parameters || !Array.isArray(transferableObjects)) {
    throw new DeveloperError(
      "A terrain Worker task and transfer list are required.",
    );
  }
  if (parameters.kind === "decodeLerc") {
    return decodeLerc(parameters, transferableObjects);
  }
  if (parameters.kind === "createHeightmapMesh") {
    return createHeightmapMesh(parameters, transferableObjects);
  }
  if (parameters.kind === "decodeQuantizedMesh") {
    return decodeQuantizedMesh(parameters, transferableObjects);
  }
  if (parameters.kind === "createQuantizedMeshMesh") {
    return createQuantizedMesh(parameters, transferableObjects);
  }
  if (parameters.kind === "upsampleQuantizedMesh") {
    return upsampleQuantizedMesh(parameters, transferableObjects);
  }
  throw new DeveloperError("The planar terrain Worker task kind is invalid.");
}

export default processSceneGISPlanarTerrainTask;
