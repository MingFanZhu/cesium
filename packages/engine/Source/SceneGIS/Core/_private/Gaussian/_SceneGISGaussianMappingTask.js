/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import DeveloperError from "../../../../Core/DeveloperError.js";

const INVALID_INDEX = 0xffffffff;

function requireIdentity(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new DeveloperError(`Segmented Mapping ${label} is invalid`);
  }
}

function requireSafe(value, label, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new DeveloperError(`Segmented Mapping ${label} is invalid`);
  }
  return value;
}

function requireUint32Array(value, length, label) {
  if (!(value instanceof Uint32Array) || value.length !== length) {
    throw new DeveloperError(`Segmented Mapping ${label} is invalid`);
  }
  return value;
}

export function buildGaussianSegmentedMapping(
  parameters,
  transferableObjects = [],
) {
  requireIdentity(parameters?.artifactIdentity, "artifact identity");
  requireIdentity(parameters?.contentIdentity, "content identity");
  const contentGeneration = requireSafe(
    parameters.contentGeneration,
    "content generation",
    true,
  );
  const mappingGeneration = requireSafe(
    parameters.mappingGeneration,
    "mapping generation",
    true,
  );
  const selectedSplatCount = requireSafe(
    parameters.selectedSplatCount,
    "selected splat count",
    true,
  );
  const mappingElementCount = requireSafe(
    parameters.mappingElementCount,
    "mapping element count",
    true,
  );
  const fragmentCount = requireSafe(
    parameters.fragmentCount,
    "fragment count",
    true,
  );
  const slotCount = requireSafe(parameters.slotCount, "slot count", true);
  if (
    mappingElementCount % 4 !== 0 ||
    mappingElementCount < selectedSplatCount * 4
  ) {
    throw new DeveloperError("Segmented Mapping byte coverage is invalid");
  }
  const fragmentCorePageIds = requireUint32Array(
    parameters.fragmentCorePageIds,
    fragmentCount,
    "Core Page ids",
  );
  const fragmentShPageIds = requireUint32Array(
    parameters.fragmentShPageIds,
    fragmentCount,
    "SH Page ids",
  );
  const fragmentPageLocalStarts = requireUint32Array(
    parameters.fragmentPageLocalStarts,
    fragmentCount,
    "Page-local starts",
  );
  const fragmentCounts = requireUint32Array(
    parameters.fragmentCounts,
    fragmentCount,
    "fragment counts",
  );
  const fragmentPresentationStarts = requireUint32Array(
    parameters.fragmentPresentationStarts,
    fragmentCount,
    "presentation starts",
  );
  const fragmentSlotIds = requireUint32Array(
    parameters.fragmentSlotIds,
    fragmentCount,
    "slot ids",
  );
  const fragmentShDenseStarts = requireUint32Array(
    parameters.fragmentShDenseStarts,
    fragmentCount,
    "SH dense starts",
  );
  const fragmentCorePackedAddresses = requireUint32Array(
    parameters.fragmentCorePackedAddresses,
    fragmentCount,
    "Core packed addresses",
  );
  const fragmentCorePageSplatCounts = requireUint32Array(
    parameters.fragmentCorePageSplatCounts,
    fragmentCount,
    "Core Page counts",
  );
  const fragmentShPackedAddresses = requireUint32Array(
    parameters.fragmentShPackedAddresses,
    fragmentCount,
    "SH packed addresses",
  );
  const fragmentShPageSplatCounts = requireUint32Array(
    parameters.fragmentShPageSplatCounts,
    fragmentCount,
    "SH Page counts",
  );
  const slotCoverageNodeIds = requireUint32Array(
    parameters.slotCoverageNodeIds,
    slotCount,
    "coverage Node ids",
  );

  const mapping = new Uint32Array(mappingElementCount);
  mapping.fill(INVALID_INDEX);
  let cursor = 0;
  for (let fragment = 0; fragment < fragmentCount; fragment++) {
    const count = fragmentCounts[fragment];
    const destination = fragmentPresentationStarts[fragment];
    const sourceStart = fragmentPageLocalStarts[fragment];
    const slot = fragmentSlotIds[fragment];
    const coreAddress = fragmentCorePackedAddresses[fragment];
    const coreCount = fragmentCorePageSplatCounts[fragment];
    const shPageId = fragmentShPageIds[fragment];
    const shDenseStart = fragmentShDenseStarts[fragment];
    const shAddress = fragmentShPackedAddresses[fragment];
    const shCount = fragmentShPageSplatCounts[fragment];
    const hasSh = shDenseStart !== INVALID_INDEX;
    if (
      fragmentCorePageIds[fragment] === INVALID_INDEX ||
      count < 1 ||
      destination !== cursor ||
      slot >= slotCount ||
      sourceStart + count > coreCount ||
      (coreAddress & 0xffff) + sourceStart + count > 0x10000 ||
      (hasSh &&
        (shPageId === INVALID_INDEX ||
          sourceStart + count > shCount ||
          (shAddress & 0xffff) + sourceStart + count > 0x10000)) ||
      (!hasSh && shPageId !== INVALID_INDEX)
    ) {
      throw new DeveloperError(
        "Segmented Mapping fragment authority is invalid",
      );
    }
    const coverageNode = slotCoverageNodeIds[slot];
    for (let local = 0; local < count; local++) {
      const target = (destination + local) * 4;
      mapping[target] = coreAddress + sourceStart + local;
      mapping[target + 1] = hasSh
        ? shAddress + sourceStart + local
        : INVALID_INDEX;
      mapping[target + 2] = slot;
      mapping[target + 3] = coverageNode;
    }
    cursor += count;
  }
  if (cursor !== selectedSplatCount) {
    throw new DeveloperError(
      "Segmented Mapping destination coverage is incomplete",
    );
  }
  transferableObjects.push(mapping.buffer);
  return {
    artifactIdentity: parameters.artifactIdentity,
    contentIdentity: parameters.contentIdentity,
    contentGeneration,
    mappingGeneration,
    selectedSplatCount,
    mappingElementCount,
    writtenCount: cursor,
    mapping,
  };
}

export default buildGaussianSegmentedMapping;
