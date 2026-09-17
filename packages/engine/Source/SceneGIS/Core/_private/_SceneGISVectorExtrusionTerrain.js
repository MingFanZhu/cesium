import Cartesian3 from "../../../Core/Cartesian3.js";
import EncodedCartesian3 from "../../../Core/EncodedCartesian3.js";
import Coordinates from "./_SceneGISVectorGlobeCoordinates.js";
import TerrainIndex from "./_SceneGISVectorGlobeTerrainIndex.js";

/** Resolves one Globe building batch against an immutable resident terrain snapshot. @private */
function extrusionTerrain(parameters) {
  const { streams, entries, bounds, origin } = parameters;
  const heights = new Map();
  function sample(x, y) {
    const key = `${x}/${y}`;
    let value = heights.get(key);
    if (value === undefined) {
      value = TerrainIndex.height(
        entries,
        x + bounds.minimumX,
        y + bounds.maximumY,
      );
      heights.set(key, value);
    }
    return value;
  }
  const point = new Cartesian3();
  const encoded = new EncodedCartesian3();
  return {
    streams: streams.map(({ coordinates, data }) => {
      const count = coordinates.length / 2;
      const high = new Float32Array(count * 3);
      const low = new Float32Array(count * 3);
      for (let j = 0; j < count; j++) {
        const x = coordinates[j * 2],
          y = coordinates[j * 2 + 1];
        const z = data[j * 4 + 2];
        let height = sample(data[j * 4], data[j * 4 + 1]) + z;
        if (z === 0 && data[j * 4 + 3] === 0) {
          height = Math.min(height, sample(x, y));
        }
        Coordinates.position(
          x + bounds.minimumX,
          y + bounds.maximumY,
          height,
          point,
        );
        Cartesian3.subtract(point, origin, point);
        EncodedCartesian3.fromCartesian(point, encoded);
        high[j * 3] = encoded.high.x;
        high[j * 3 + 1] = encoded.high.y;
        high[j * 3 + 2] = encoded.high.z;
        low[j * 3] = encoded.low.x;
        low[j * 3 + 1] = encoded.low.y;
        low[j * 3 + 2] = encoded.low.z;
      }
      return { high, low };
    }),
  };
}
export default extrusionTerrain;
