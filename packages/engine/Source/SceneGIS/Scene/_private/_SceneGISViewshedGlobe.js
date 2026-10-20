import Visibility from "../../../Core/Visibility.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import QuadtreeOccluders from "../../../Scene/QuadtreeOccluders.js";

function available(provider, tile) {
  const known = provider.getTileDataAvailable(tile.x, tile.y, tile.level);
  if (known !== undefined || !tile.parent?.data?.terrainData) {
    return known;
  }
  const parent = tile.parent;
  return parent.data.terrainData.isChildAvailable(
    parent.x,
    parent.y,
    tile.x,
    tile.y,
  );
}

/**
 * Stateless observer selection over the Globe's shared tile hierarchy.
 * Native selection history, render set and height-query state remain untouched.
 * @private
 */
const GlobeSelection = {
  collect(state, frame) {
    const globe = state.world;
    const tree = globe._surface;
    const provider = tree.tileProvider;
    const roots = tree._levelZeroTiles;
    if (!roots) {
      return false;
    }
    const selection = (state.globeSelection ??= {
      tiles: [],
      occluders: new QuadtreeOccluders({ ellipsoid: globe.ellipsoid }),
    });
    selection.tiles.length = 0;
    selection.occluders.ellipsoid.cameraPosition = state.camera.positionWC;
    const terrainOnly = (frame._sceneGISObserverTerrainTiles ??= new Set());
    const mainQueued = new Set([
      ...tree._tileLoadQueueHigh,
      ...tree._tileLoadQueueMedium,
      ...tree._tileLoadQueueLow,
    ]);
    let ready = true;
    const visit = (tile) => {
      const fog = frame.fog.enabled;
      frame.fog.enabled = false;
      let visibility;
      try {
        visibility = provider.computeTileVisibility(
          tile,
          frame,
          selection.occluders,
        );
      } finally {
        frame.fog.enabled = fog;
      }
      if (visibility === Visibility.NONE) {
        return;
      }
      tree._tileReplacementQueue.markTileRendered(tile);
      const data = tile.data;
      if (!data?.vertexArray || !data.mesh) {
        ready = false;
        if (tile.needsLoading && !mainQueued.has(tile)) {
          terrainOnly.add(tile);
          mainQueued.add(tile);
          tile._loadPriority = tile._distance;
          tree._tileLoadQueueMedium.push(tile);
        }
        return;
      }
      if (
        data.terrainData.wasCreatedByUpsampling() &&
        available(provider.terrainProvider, tile) !== false
      ) {
        throw new RuntimeError(
          "Required observer terrain failed and only an upsampled substitute is available.",
        );
      }
      const distance = Math.max(state.camera.frustum.near, tile._distance);
      const error =
        (provider.getLevelMaximumGeometricError(tile.level) *
          state.resolution) /
        (distance * state.camera.frustum.sseDenominator);
      // Known absent children cannot add source detail. Keep the real parent
      // mesh, rather than manufacturing progressively finer flat fill tiles.
      const children =
        error > globe.maximumScreenSpaceError ? tile.children : [];
      const refinable = children.filter(
        (child) => available(provider.terrainProvider, child) !== false,
      );
      if (refinable.length > 0) {
        // All quadrants participate in coverage; incomplete refinement is
        // loading, never a definitive green result.
        for (const child of children) {
          visit(child);
        }
      } else {
        selection.tiles.push(tile);
      }
    };
    for (const root of roots) {
      visit(root);
    }
    for (const tile of selection.tiles) {
      provider.renderSceneGISObserverTile(tile, frame);
    }
    return ready;
  },
};

export default GlobeSelection;
