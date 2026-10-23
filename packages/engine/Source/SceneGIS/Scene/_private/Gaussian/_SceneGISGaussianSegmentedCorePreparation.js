/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import DeveloperError from "../../../../Core/DeveloperError.js";

export const CORE_PREPARATION_WINDOW_BYTES = 8 * 1024 * 1024;
const preparedReceipts = new WeakMap();

export function createSegmentedPreparedCoreReceipt(identity, bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteOffset !== 0 ||
    bytes.byteLength !== identity.uploadBytes ||
    bytes.buffer.byteLength !== identity.uploadBytes
  ) {
    throw new DeveloperError("Segmented prepared Core backing is invalid");
  }
  const receipt = Object.freeze({});
  preparedReceipts.set(receipt, { identity, bytes });
  return receipt;
}

export function consumeSegmentedPreparedCoreReceipt(receipt, descriptor) {
  const state = preparedReceipts.get(receipt);
  const identity = state?.identity;
  if (
    !state ||
    identity.artifactIdentity !== descriptor.artifactIdentity ||
    identity.pageIndex !== descriptor.index ||
    identity.checksum !== descriptor.checksum ||
    identity.assetId !== descriptor.assetId ||
    identity.assetLocalStart !== descriptor.assetLocalStart ||
    identity.pageSplatCount !== descriptor.splatCount ||
    identity.kind !== descriptor.kind ||
    identity.semantic !== descriptor.semantic ||
    identity.layoutId !== descriptor.layoutId ||
    identity.packId !== descriptor.packId ||
    identity.offset !== descriptor.offset ||
    identity.storedBytes !== descriptor.storedBytes ||
    identity.rawBytes !== descriptor.rawBytes
  ) {
    throw new DeveloperError("Segmented prepared Core receipt is stale");
  }
  preparedReceipts.delete(receipt);
  return state.bytes;
}

export function discardSegmentedPreparedCoreReceipt(receipt) {
  preparedReceipts.delete(receipt);
}

/** @private */
const _SceneGISGaussianSegmentedCorePreparation = {
  CORE_PREPARATION_WINDOW_BYTES,
  createSegmentedPreparedCoreReceipt,
  consumeSegmentedPreparedCoreReceipt,
  discardSegmentedPreparedCoreReceipt,
};
export default _SceneGISGaussianSegmentedCorePreparation;
