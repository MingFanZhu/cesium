import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Ellipsoid from "../../../Core/Ellipsoid.js";
import EllipsoidTerrainProvider from "../../../Core/EllipsoidTerrainProvider.js";
import Rectangle from "../../../Core/Rectangle.js";
import TerrainEncoding from "../../../Core/TerrainEncoding.js";
import TerrainQuantization from "../../../Core/TerrainQuantization.js";
import Matrix4 from "../../../Core/Matrix4.js";
import CesiumMath from "../../../Core/Math.js";
import VerticalExaggeration from "../../../Core/VerticalExaggeration.js";
import Coordinates from "../../Core/_private/_SceneGISVectorGlobeCoordinates.js";
import Index from "../../Core/_private/_SceneGISVectorGlobeTerrainIndex.js";

const ellipsoid = Ellipsoid.WGS84;

function queryRectangle(tile, mesh) {
  const rectangle = Rectangle.clone(tile.rectangle);
  const encoding = mesh.encoding;
  // Quantization can move the decoded edge beyond its geographic owner. Expand
  // the broad phase by one encoding cell; exact triangle queries still decide height.
  if (encoding.quantization === TerrainQuantization.BITS12) {
    const scale = Matrix4.getScale(encoding.fromScaledENU, new Cartesian3());
    const angular =
      Cartesian3.magnitude(scale) / 4095 / ellipsoid.minimumRadius;
    rectangle.south -= angular;
    rectangle.north += angular;
    const latitude = Math.max(
      Math.abs(rectangle.south),
      Math.abs(rectangle.north),
    );
    if (latitude >= Math.PI / 2) {
      rectangle.west = -Math.PI;
      rectangle.east = Math.PI;
    } else {
      const longitude = angular / Math.cos(latitude);
      rectangle.west = CesiumMath.negativePiToPi(rectangle.west - longitude);
      rectangle.east = CesiumMath.negativePiToPi(rectangle.east + longitude);
    }
  }
  return rectangle;
}

function meshRange(mesh, result = new Cartesian2()) {
  const encoding = mesh.encoding;
  result.x = VerticalExaggeration.getHeight(
    Math.min(mesh.minimumHeight, encoding.minimumHeight ?? mesh.minimumHeight),
    encoding.exaggeration,
    encoding.exaggerationRelativeHeight,
  );
  result.y = VerticalExaggeration.getHeight(
    Math.max(mesh.maximumHeight, encoding.maximumHeight ?? mesh.maximumHeight),
    encoding.exaggeration,
    encoding.exaggerationRelativeHeight,
  );
  return result;
}

function heights(layer, bounds, result) {
  result.x = 0;
  result.y = 0;
  const rectangle = bounds && Coordinates.rectangle(bounds);
  const range = new Cartesian2();
  for (const tile of layer._world._surface._tilesToRender) {
    const mesh = tile.data?.renderedMesh;
    if (
      !mesh ||
      (rectangle && !Rectangle.intersection(rectangle, tile.rectangle))
    ) {
      continue;
    }
    meshRange(mesh, range);
    result.x = Math.min(result.x, range.x);
    result.y = Math.max(result.y, range.y);
  }
  result.x -= 1;
  result.y += 1;
  return result;
}

function update(layer) {
  const provider = layer._world.terrainProvider;
  const previous = layer._terrain;
  if (previous?.provider !== provider) {
    layer._globeTerrainCache = new WeakMap();
  }
  const entries = [];
  if (!(provider instanceof EllipsoidTerrainProvider)) {
    for (const tile of layer._world._surface._tilesToRender) {
      const mesh = tile.data?.renderedMesh;
      if (!mesh) {
        continue;
      }
      const encoding = mesh.encoding;
      const key = `${encoding.exaggeration}/${encoding.exaggerationRelativeHeight}`;
      let entry = layer._globeTerrainCache.get(mesh);
      if (!entry || entry.key !== key) {
        entry = {
          mesh,
          key,
          rectangle: queryRectangle(tile, mesh),
          height: meshRange(mesh).y + 1,
          needed: false,
        };
        layer._globeTerrainCache.set(mesh, entry);
      }
      entries.push(entry);
    }
  }
  layer._globeTerrainEntries = entries;
  const revision = entries.reduce(
    (sum, entry) => sum + (entry.result ? 1 : 0),
    0,
  );
  if (
    previous?.provider === provider &&
    previous.readyCount === revision &&
    previous.entries.length === entries.length &&
    previous.entries.every((entry, i) => entry === entries[i])
  ) {
    return;
  }
  layer._terrain = {
    provider,
    ellipsoid,
    entries,
    readyCount: revision,
    revision: (previous?.revision ?? 0) + 1,
    height(x, y) {
      return Index.height(entries, x, y);
    },
  };
}

function schedule(layer) {
  for (const entry of layer._globeTerrainEntries ?? []) {
    if (
      !entry.needed ||
      entry.result ||
      entry.pending ||
      entry.failed ||
      !layer._workers.available
    ) {
      continue;
    }
    const mesh = entry.mesh;
    const vertices = mesh.vertices.slice();
    const indices = mesh.indices.slice(0, mesh.indexCountWithoutSkirts);
    const promise = layer._workers.schedule(
      {
        kind: "terrain",
        vertices,
        indices,
        encoding: TerrainEncoding.clone(mesh.encoding),
        center: mesh.center,
      },
      [vertices.buffer, indices.buffer],
    );
    if (!promise) {
      return;
    }
    entry.pending = true;
    promise.then(
      (result) => {
        if (layer.isDestroyed()) {
          return;
        }
        entry.pending = false;
        entry.result = result;
        layer._scene.requestRender();
      },
      (error) => {
        if (layer.isDestroyed()) {
          return;
        }
        entry.pending = false;
        entry.failed = true;
        layer._errorEvent.raiseEvent({
          layer,
          resource: "terrain-index",
          error,
        });
        layer._scene.requestRender();
      },
    );
    // Tile preparation and glyph jobs retain the remaining Worker slot.
    return;
  }
}

function pending(layer) {
  return (layer._globeTerrainEntries ?? []).some(
    (entry) => entry.needed && !entry.result && !entry.failed,
  );
}

/** Borrows the native published Globe mesh; owns only asynchronous CPU query data. @private */
export default { update, schedule, pending, heights };
