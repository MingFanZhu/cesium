import TerrainQuery from "./_SceneGISPlanarTerrainQuery.js";

/** Captures the published planar terrain cover for vector anchors, without requesting tiles. @private */
function updateVectorTerrain(layer) {
  if (!layer._ground) {
    layer._terrain = undefined;
    return;
  }
  const world = layer._world;
  const surface = world._surface;
  const snapshot = surface._terrainQuerySnapshot;
  const count = surface._terrainQuerySnapshotCount;
  const previous = layer._terrain;
  if (
    previous?.provider === world.terrainProvider &&
    previous.entries.length === count &&
    previous.entries.every(
      (entry, i) =>
        entry.key === snapshot[i].key &&
        entry.mesh === snapshot[i].mesh &&
        entry.revision === snapshot[i].revision,
    )
  ) {
    return;
  }
  const entries = snapshot.slice(0, count).map((entry) => ({
    tile: entry.tile,
    mesh: entry.mesh,
    key: entry.key,
    revision: entry.revision,
  }));
  const levels = new Map();
  for (const entry of entries) {
    const tile = entry.tile;
    let tiles = levels.get(tile.level);
    if (!tiles) {
      levels.set(tile.level, (tiles = new Map()));
    }
    tiles.set(`${tile.x}/${tile.y}`, entry);
  }
  const ordered = [...levels].sort((a, b) => b[0] - a[0]);
  const extent = world.coordinateSystem.extent;
  const state = {
    provider: world.terrainProvider,
    revision: (previous?.revision ?? 0) + 1,
    entries,
    height(x, y) {
      for (const [level, tiles] of ordered) {
        const n = 2 ** level;
        const tx = Math.min(
          n - 1,
          Math.floor(((x - extent.minimumX) / extent.width) * n),
        );
        const ty = Math.min(
          n - 1,
          Math.floor(((extent.maximumY - y) / extent.height) * n),
        );
        const entry = tiles.get(`${tx}/${ty}`);
        if (entry) {
          return TerrainQuery.getHeight(entry.tile, entry, x, y) ?? 0;
        }
      }
      // The surface draws its zero-height plane while terrain has no published mesh.
      return 0;
    },
  };
  layer._terrain = state;
}
export default updateVectorTerrain;
