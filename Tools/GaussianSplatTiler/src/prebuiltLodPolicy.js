import { createHash } from "node:crypto";

export const PREBUILT_LOD_POLICY = "segmented-prebuilt-lod-v1";
export const PREBUILT_LOD_SCHEMA = "cesium-prebuilt-gaussian-lods/v1";

export function prebuiltLodPolicySha256(cellSizeMeters) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        producer: PREBUILT_LOD_POLICY,
        cellSizeMeters: Array.from(cellSizeMeters),
        leafSlots: 7,
        overflow: "eighth-level-child-domain-or-child-passthrough",
        errors: "encoded-reference-32-cubed-support-bound-v1",
        parentErrors: "logical-child-domain-diagonal-plus-support-v1",
        coverage: "encoded-finest-reference-domain",
      }),
    )
    .digest();
}
