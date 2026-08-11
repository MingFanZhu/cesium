import Lerc from "lerc";
import DeveloperError from "../../../Core/DeveloperError.js";

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

  transferableObjects.push(positions.buffer);
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
    topologyKey: `${width}/${height}/skirt`,
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
  throw new DeveloperError("The planar terrain Worker task kind is invalid.");
}

export default processSceneGISPlanarTerrainTask;
