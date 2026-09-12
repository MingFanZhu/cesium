import earcut from "earcut";
import ArcType from "../../../Core/ArcType.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import ColorGeometryInstanceAttribute from "../../../Core/ColorGeometryInstanceAttribute.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import GeometryInstance from "../../../Core/GeometryInstance.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import PolylineGeometry from "../../../Core/PolylineGeometry.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import VertexFormat from "../../../Core/VertexFormat.js";

function attribute(values, size, double = false) {
  return new GeometryAttribute({
    componentDatatype: double
      ? ComponentDatatype.DOUBLE
      : ComponentDatatype.FLOAT,
    componentsPerAttribute: size,
    values: double ? new Float64Array(values) : new Float32Array(values),
  });
}

function rawGeometry(positions, indices, extra = {}) {
  return new Geometry({
    attributes: { position: attribute(positions, 3, true), ...extra },
    indices: IndexDatatype.createTypedArray(positions.length / 3, indices),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions),
  });
}

function colorWithOpacity(color, opacity) {
  return new Color(color.red, color.green, color.blue, color.alpha * opacity);
}

function makeInstance(geometry, id, color) {
  return new GeometryInstance({
    geometry,
    id,
    attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
  });
}

function fillGeometry(feature, coordinates) {
  const positions = [];
  const indices = [];
  const parts = feature.geometry.parts;
  const starts = feature.geometry.polygonStarts;
  for (let polygon = 0; polygon < starts.length; polygon++) {
    const end = starts[polygon + 1] ?? parts.length;
    const xy = [];
    const holes = [];
    for (let ring = starts[polygon]; ring < end; ring++) {
      if (ring !== starts[polygon]) {
        holes.push(xy.length / 2);
      }
      for (const value of parts[ring]) {
        xy.push(value);
      }
    }
    const offset = positions.length / 3;
    const triangles = earcut(xy, holes);
    for (let i = 0; i < xy.length; i += 2) {
      const point = coordinates.toLocal(xy[i], xy[i + 1]);
      positions.push(point.x, point.y, 0);
    }
    for (const index of triangles) {
      indices.push(offset + index);
    }
  }
  return indices.length === 0 ? undefined : rawGeometry(positions, indices);
}

function lineGeometries(feature, coordinates, width) {
  if (width <= 0) {
    return [];
  }
  return feature.geometry.parts
    .map((part) => {
      const positions = [];
      for (let i = 0; i < part.length; i += 2) {
        positions.push(coordinates.toLocal(part[i], part[i + 1]));
      }
      if (feature.type === 3) {
        positions.push(Cartesian3.clone(positions[0]));
      }
      return PolylineGeometry.createGeometry(
        new PolylineGeometry({
          positions,
          width,
          arcType: ArcType.NONE,
          vertexFormat: VertexFormat.POSITION_ONLY,
        }),
      );
    })
    .filter((geometry) => geometry !== undefined);
}

function circleGeometry(feature, coordinates, paint) {
  const positions = [];
  const indices = [];
  const corners = [];
  const dimensions = [];
  const strokes = [];
  const radius = paint["circle-radius"];
  const strokeWidth = paint["circle-stroke-width"];
  const stroke = colorWithOpacity(
    paint["circle-stroke-color"],
    paint["circle-stroke-opacity"],
  );
  if (radius + strokeWidth <= 0) {
    return undefined;
  }
  for (const part of feature.geometry.parts) {
    for (let i = 0; i < part.length; i += 2) {
      const point = coordinates.toLocal(part[i], part[i + 1]);
      const offset = positions.length / 3;
      for (const corner of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        positions.push(point.x, point.y, 0);
        corners.push(...corner);
        dimensions.push(radius, strokeWidth);
        strokes.push(stroke.red, stroke.green, stroke.blue, stroke.alpha);
      }
      indices.push(
        offset,
        offset + 1,
        offset + 2,
        offset,
        offset + 2,
        offset + 3,
      );
    }
  }
  return rawGeometry(positions, indices, {
    corner: attribute(corners, 2),
    dimensions: attribute(dimensions, 2),
    strokeColor: attribute(strokes, 4),
  });
}

/**
 * Prepares tile-local CPU geometry for the independently decoded flat map.
 * @private
 */
const SceneGISVectorTileGeometry = {};

SceneGISVectorTileGeometry.background = function (width, height, evaluated) {
  return makeInstance(
    rawGeometry(
      [0, 0, 0, width, 0, 0, width, -height, 0, 0, -height, 0],
      [0, 1, 2, 0, 2, 3],
    ),
    undefined,
    colorWithOpacity(
      evaluated.paint["background-color"],
      evaluated.paint["background-opacity"],
    ),
  );
};

SceneGISVectorTileGeometry.build = function (
  sourceLayer,
  definition,
  style,
  coordinates,
  zoom,
  tile,
) {
  const main = [];
  const outlines = [];
  if (sourceLayer === undefined) {
    return [];
  }
  for (let index = 0; index < sourceLayer.features.length; index++) {
    const feature = sourceLayer.features[index];
    if (
      (definition.type === "fill" && feature.type !== 3) ||
      (definition.type === "circle" && feature.type !== 1) ||
      (definition.type === "line" && feature.type === 1)
    ) {
      continue;
    }
    const evaluated = style.evaluateLayer(definition.id, feature, zoom);
    if (!evaluated.show) {
      continue;
    }
    const paint = evaluated.paint;
    const id = Object.freeze({
      source: definition.source,
      sourceLayer: sourceLayer.name,
      styleLayer: definition.id,
      tile: Object.freeze({ x: tile.x, y: tile.y, level: tile.level }),
      featureIndex: index,
      featureId: feature.id,
      properties: Object.freeze({ ...feature.properties }),
    });
    const color = colorWithOpacity(
      paint[`${definition.type}-color`],
      paint[`${definition.type}-opacity`],
    );
    if (definition.type === "fill") {
      const geometry = fillGeometry(feature, coordinates);
      if (geometry !== undefined && color.alpha > 0) {
        main.push(makeInstance(geometry, id, color));
      }
      const outline = paint["fill-outline-color"];
      if (outline !== undefined) {
        const outlineColor = colorWithOpacity(outline, paint["fill-opacity"]);
        if (outlineColor.alpha > 0) {
          for (const line of lineGeometries(feature, coordinates, 1)) {
            outlines.push(makeInstance(line, id, outlineColor));
          }
        }
      }
    } else if (definition.type === "line") {
      if (color.alpha > 0) {
        for (const line of lineGeometries(
          feature,
          coordinates,
          paint["line-width"],
        )) {
          main.push(makeInstance(line, id, color));
        }
      }
    } else {
      const geometry = circleGeometry(feature, coordinates, paint);
      if (geometry !== undefined) {
        main.push(makeInstance(geometry, id, color));
      }
    }
  }
  const result = [];
  if (main.length > 0) {
    result.push({ kind: definition.type, instances: main });
  }
  if (outlines.length > 0) {
    result.push({ kind: "line", instances: outlines });
  }
  return result;
};

export default SceneGISVectorTileGeometry;
