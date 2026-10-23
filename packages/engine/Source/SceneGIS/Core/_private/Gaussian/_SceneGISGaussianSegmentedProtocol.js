/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
export {
  decodeSegmentedHierarchyRuntimeIndex,
  SEGMENTED_VISUAL_ERROR_METRIC,
  segmentedHierarchyArtifactIdentityEquals,
  validateSegmentedHierarchyRuntimeIndex,
} from "./_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";

export {
  SEGMENTED_ACTIVE_CUT_TRANSITION,
  commitSegmentedActiveCutPlan,
  commitSegmentedConvergedActiveCutPlan,
  createSegmentedActiveCut,
  diffSegmentedActiveCutProviders,
  planSegmentedActiveCut,
  planSegmentedConvergedActiveCut,
  rebaseSegmentedConvergedActiveCutPlan,
  projectSegmentedActiveCutProviders,
} from "./_SceneGISGaussianSegmentedActiveCut.js";

export {
  abortSegmentedAssetPageBootstrapPublication,
  abortSegmentedAssetPageTransition,
  abortSegmentedPreparedPagePublication,
  commitSegmentedAssetPageBootstrap,
  commitSegmentedAssetPagePublication,
  computeSegmentedAtlasPageFootprint,
  createSegmentedAssetPagePhysicalSnapshot,
  deriveSegmentedAssetPagePhysicalReady,
  finalizeSegmentedAssetPageBootstrapPublication,
  finalizeSegmentedAssetPagePublication,
  planSegmentedConvergedAssetPageTransition,
  planSegmentedReadyConvergedActiveCut,
  planSegmentedProgressiveBridge,
  planSegmentedAssetPageBootstrap,
  planSegmentedAssetPageTransition,
  prepareSegmentedAssetPageBootstrapPublication,
  prepareSegmentedAssetPagePublication,
  prepareSegmentedConvergedAssetPagePublication,
  projectSegmentedAssetIntervals,
  projectSegmentedAssetSlots,
  validateSegmentedAssetPagePhysicalOwnership,
  validateSegmentedAssetPagePhysicalProgression,
  validateSegmentedAssetPagePhysicalSnapshot,
  validateSegmentedPreparedPagePublication,
} from "./_SceneGISGaussianSegmentedAssetPageOwnership.js";

export {
  abortSegmentedGlobalPresentationPublication,
  abortSegmentedGlobalPresentationRefresh,
  commitSegmentedGlobalPresentationPublication,
  commitSegmentedGlobalPresentationRefresh,
  composeSegmentedGlobalPresentationSlots,
  createSegmentedGlobalOrderingRefreshPlan,
  createSegmentedGlobalPresentationPlan,
  createSegmentedGlobalPresentationReceipt,
  createSegmentedGlobalShRefreshPlan,
  deriveSegmentedGlobalPresentationLayout,
  reserveSegmentedGlobalPresentation,
  validateSegmentedGlobalPresentationPlanBinding,
  validateSegmentedGlobalPresentationReservation,
} from "./_SceneGISGaussianSegmentedGlobalPresentation.js";

export { parseMacroChunkRuntimeManifest } from "./_SceneGISGaussianManifest.js";

/** @private */
const _SceneGISGaussianSegmentedProtocol = Object.freeze({});
export default _SceneGISGaussianSegmentedProtocol;
