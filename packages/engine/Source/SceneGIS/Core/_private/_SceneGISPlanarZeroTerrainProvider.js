import DeveloperError from "../../../Core/DeveloperError.js";
import Event from "../../../Core/Event.js";
import SceneGISPlanarHeightmapTerrainData from "../SceneGISPlanarHeightmapTerrainData.js";

/** Supplies zero-height terrain in the World's canonical tile coordinates. @private */
class SceneGISPlanarZeroTerrainProvider {
  constructor(tilingScheme, maximumLevel) {
    this.tilingScheme = tilingScheme;
    this.maximumLevel = maximumLevel;
    this.minimumHeight = 0.0;
    this.maximumHeight = 0.0;
    this.errorEvent = new Event();
    this.credit = undefined;
    Object.freeze(this);
  }

  getLevelMaximumGeometricError() {
    return 0.0;
  }

  getTileDataAvailable(x, y, level) {
    const tileCount = 2 ** level;
    return (
      Number.isInteger(level) &&
      level >= 0 &&
      level <= this.maximumLevel &&
      Number.isInteger(x) &&
      x >= 0 &&
      x < tileCount &&
      Number.isInteger(y) &&
      y >= 0 &&
      y < tileCount
    );
  }

  loadTileDataAvailability() {
    return undefined;
  }

  requestTileGeometry(x, y, level) {
    if (!this.getTileDataAvailable(x, y, level)) {
      throw new DeveloperError(
        "The requested planar terrain tile is out of range.",
      );
    }
    return Promise.resolve(
      new SceneGISPlanarHeightmapTerrainData({
        buffer: new Uint8Array(4),
        width: 2,
        height: 2,
        childTileMask: level < this.maximumLevel ? 15 : 0,
      }),
    );
  }
}

export default SceneGISPlanarZeroTerrainProvider;
