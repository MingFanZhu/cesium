import DeveloperError from "../../../Core/DeveloperError.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import Extent from "../SceneGISPlanarExtent.js";
import CoordinateSystem from "../SceneGISPlanarCoordinateSystem.js";
import TilingScheme from "../SceneGISPlanarTilingScheme.js";
import Coordinates from "../SceneGISVectorTileCoordinates.js";
import Tile from "../SceneGISVectorTile.js";
import Style from "../SceneGISVectorTileStyle.js";
import Geometry from "./_SceneGISVectorTileGeometry.js";
import prepareBatch from "./_SceneGISVectorBatchGeometry.js";
import prepareSymbols from "./_SceneGISVectorSymbolPreparation.js";
import Glyphs from "./_SceneGISVectorGlyphs.js";
import Layout from "./_SceneGISVectorSymbolLayout.js";
import prepareGlobeGeometry from "./_SceneGISVectorGlobeGeometry.js";
import TerrainIndex from "./_SceneGISVectorGlobeTerrainIndex.js";
import extrusionTerrain from "./_SceneGISVectorExtrusionTerrain.js";

function transfer(value, objects, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  if (ArrayBuffer.isView(value)) {
    transfer(value.buffer, objects, seen);
  } else if (value instanceof ArrayBuffer) {
    objects.push(value);
  } else if (value instanceof Map) {
    for (const item of value.values()) {
      transfer(item, objects, seen);
    }
  } else {
    for (const item of Object.values(value)) {
      transfer(item, objects, seen);
    }
  }
}

/** Creates state confined to one Worker: immutable style and matrix, no tile or GPU cache. @private */
function createVectorTaskHandler() {
  let style, scheme, configuration, patterns;
  return function processVectorTask(parameters, transferableObjects) {
    const begin = performance.now();
    patterns = parameters.patterns ?? patterns;
    if (parameters.configuration) {
      configuration = parameters.configuration;
      style = new Style(configuration.style);
      scheme = new TilingScheme({
        coordinateSystem: new CoordinateSystem({
          extent: new Extent(configuration.extent),
        }),
      });
    }
    let result;
    if (parameters.kind === "terrain") {
      result = TerrainIndex.build(parameters);
    } else if (parameters.kind === "extrusion-terrain") {
      result = extrusionTerrain(parameters);
    } else if (parameters.kind === "decode") {
      result = { data: Tile.decode(parameters.buffer) };
    } else if (parameters.kind === "glyphs") {
      const glyphs = Glyphs.decode(parameters.buffer);
      for (const code of glyphs.keys()) {
        if (Math.floor(code / 256) !== parameters.range) {
          throw new RuntimeError(
            "Glyph response contains a code outside its requested range.",
          );
        }
      }
      result = { glyphs, image: Glyphs.pack(glyphs) };
    } else if (parameters.kind === "shapes") {
      result = {
        shapes: parameters.items.map((item) => {
          try {
            const layout = { ...item.layout, "text-size": 24, "icon-size": 1 };
            return {
              key: item.key,
              text: Layout.text(
                item.text.replace(/\r/g, ""),
                layout,
                (code) => {
                  const glyph = item.glyphs.get(code);
                  if (!glyph) {
                    throw new RuntimeError(
                      `Missing glyph U+${code.toString(16)}`,
                    );
                  }
                  return glyph;
                },
              ),
              icon: Layout.icon(item.image, "sprite", layout),
            };
          } catch (error) {
            return { key: item.key, error: error.message };
          }
        }),
      };
    } else if (parameters.kind === "tile") {
      if (!style) {
        throw new DeveloperError("Vector Worker configuration is required.");
      }
      const decodeBegin = performance.now();
      const data = parameters.buffer
        ? Tile.decode(parameters.buffer)
        : parameters.data;
      const decodeMs = performance.now() - decodeBegin;
      const tile = {
        ...parameters.tile,
        bounds: scheme.tileXYToExtent(
          parameters.tile.x,
          parameters.tile.y,
          parameters.tile.level,
        ),
      };
      const layers = [],
        symbols = [],
        errors = [];
      for (const record of parameters.records) {
        const definition = style.getLayerDefinition(record.id);
        const sourceLayer = data.layers.find(
          (layer) => layer.name === definition["source-layer"],
        );
        if (!sourceLayer) {
          if (definition.type !== "symbol") {
            layers.push({
              id: record.id,
              signature: record.signature,
              batches: [],
            });
          }
          continue;
        }
        const coordinates = new Coordinates({
          tilingScheme: scheme,
          ...parameters.tile,
          extent: sourceLayer.extent,
        });
        if (definition.type === "symbol") {
          const labels = prepareSymbols(
            style,
            definition,
            sourceLayer,
            coordinates,
            tile,
            { source: { maximumLevel: parameters.maximumLevel } },
            (configuration.extent.maximumX - configuration.extent.minimumX) /
              (512 * 2 ** Math.floor(parameters.zoom)),
            parameters.zoom,
            (key, error) => errors.push({ key, message: error.message }),
            parameters,
          );
          symbols.push([
            record.order,
            { extent: sourceLayer.extent, name: sourceLayer.name, labels },
          ]);
        } else {
          const batches = Geometry.build(
            sourceLayer,
            definition,
            style,
            coordinates,
            parameters.zoom,
            tile,
            patterns,
            parameters,
          ).flatMap((item) =>
            prepareBatch(item, parameters.allowPicking, parameters.ground),
          );
          if (parameters.globe) {
            for (const batch of batches) {
              prepareGlobeGeometry(batch, tile.bounds);
            }
          }
          layers.push({ id: record.id, signature: record.signature, batches });
        }
      }
      result = {
        layers,
        symbols,
        errors,
        featureIds: data.layers.map((layer) => [
          layer.name,
          [
            ...new Set(
              layer.features
                .filter((f) => f.id !== undefined)
                .map((f) => String(f.id)),
            ),
          ],
        ]),
        decodeMs,
        features: data.layers.reduce(
          (sum, layer) => sum + layer.features.length,
          0,
        ),
        byteLength: layers.reduce(
          (sum, layer) =>
            sum + layer.batches.reduce((n, b) => n + b.byteLength, 0),
          0,
        ),
      };
    } else {
      throw new DeveloperError(
        `Unknown vector Worker task: ${parameters.kind}`,
      );
    }
    result.kind = parameters.kind;
    result.workerMs = performance.now() - begin;
    transfer(result, transferableObjects);
    return result;
  };
}
export default createVectorTaskHandler;
