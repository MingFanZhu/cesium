function contains(parent, tile) {
  if (parent.level > tile.level) {
    return false;
  }
  const scale = 2 ** (tile.level - parent.level);
  return (
    Math.floor(tile.x / scale) === parent.x &&
    Math.floor(tile.y / scale) === parent.y
  );
}

/**
 * Selects non-overlapping regions using already published resident tiles.
 * Inputs retain ownership of tile addresses, bounds, and publication state.
 * @private
 */
const SceneGISVectorTileRenderCover = {};

SceneGISVectorTileRenderCover.select = function (desired, residents) {
  const published = residents.filter((entry) => entry.signature !== undefined);
  const result = [];
  for (const tile of desired) {
    let ancestor;
    for (const entry of published) {
      if (
        contains(entry, tile) &&
        (ancestor === undefined || ancestor.level < entry.level)
      ) {
        ancestor = entry;
      }
    }
    if (ancestor !== undefined) {
      result.push({ entry: ancestor, region: tile });
      continue;
    }
    const descendants = published.filter((entry) => contains(tile, entry));
    descendants.sort((a, b) => a.level - b.level || a.y - b.y || a.x - b.x);
    const selected = [];
    for (const entry of descendants) {
      if (!selected.some((parent) => contains(parent, entry))) {
        selected.push(entry);
        result.push({ entry, region: entry });
      }
    }
  }
  return result;
};

export default SceneGISVectorTileRenderCover;
