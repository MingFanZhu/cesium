import earcut from "earcut";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Color from "../../../Core/Color.js";
import ColorGeometryInstanceAttribute from "../../../Core/ColorGeometryInstanceAttribute.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import GeometryInstance from "../../../Core/GeometryInstance.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import strokeGeometry from "./_SceneGISVectorTileStroke.js";
import Dashes from "./_SceneGISVectorTileDashes.js";

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
  const coverage = new Float32Array(positions.length);
  for (let i = 2; i < coverage.length; i += 3) {
    coverage[i] = 1;
  }
  return indices.length === 0
    ? undefined
    : rawGeometry(positions, indices, {
        fringe: attribute(coverage, 3),
      });
}

function lineGeometries(feature, coordinates, paint, layout, dash) {
  return feature.geometry.parts
    .map((part) =>
      strokeGeometry(
        part,
        coordinates,
        feature.type === 3,
        paint,
        layout,
        dash,
      ),
    )
    .filter((geometry) => geometry !== undefined);
}

function fringeGeometry(feature, coordinates) {
  const positions = [];
  const fringes = [];
  const indices = [];
  for (let ring = 0; ring < feature.geometry.parts.length; ring++) {
    const part = feature.geometry.parts[ring];
    const points = [];
    for (let i = 0; i < part.length; i += 2) {
      const p = coordinates.toLocal(part[i], part[i + 1]);
      const previous = points[points.length - 1];
      if (previous === undefined || p.x !== previous.x || p.y !== previous.y) {
        points.push(p);
      }
    }
    if (points.length < 3) {
      continue;
    }
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    const isHole = !feature.geometry.polygonStarts.includes(ring);
    const outside = (area < 0 ? 1 : -1) * (isHole ? -1 : 1);
    const offset = positions.length / 3;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length];
      const b = points[i];
      const c = points[(i + 1) % points.length];
      const l0 = Math.hypot(b.x - a.x, b.y - a.y);
      const l1 = Math.hypot(c.x - b.x, c.y - b.y);
      const n0 = [-(b.y - a.y) / l0, (b.x - a.x) / l0];
      const n1 = [-(c.y - b.y) / l1, (c.x - b.x) / l1];
      const divisor = 1 + n0[0] * n1[0] + n0[1] * n1[1];
      const e =
        divisor > 0
          ? [(n0[0] + n1[0]) / divisor, (n0[1] + n1[1]) / divisor]
          : n1;
      // A fringe is only one device pixel wide; bound its corner envelope.
      const scale = outside / Math.max(1, Math.hypot(...e) / 2);
      positions.push(b.x, b.y, 0, b.x, b.y, 0);
      fringes.push(0, 0, 1, e[0] * scale, e[1] * scale, 0);
      const current = offset + i * 2;
      const next = offset + ((i + 1) % points.length) * 2;
      indices.push(current, current + 1, next, current + 1, next + 1, next);
    }
  }
  return indices.length === 0
    ? undefined
    : rawGeometry(positions, indices, {
        fringe: attribute(fringes, 3),
      });
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
        dimensions.push(radius, strokeWidth, paint["circle-blur"] ?? 0);
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
    dimensions: attribute(dimensions, 3),
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
  const dashes = new Dashes();
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
      if (outline !== undefined && paint["fill-antialias"]) {
        const outlineColor = colorWithOpacity(outline, paint["fill-opacity"]);
        if (outlineColor.alpha > 0) {
          for (const line of lineGeometries(
            feature,
            coordinates,
            { "line-width": 1 },
            { "line-join": "miter" },
            [0, 0, 0],
          )) {
            outlines.push(makeInstance(line, id, outlineColor));
          }
        }
      } else if (paint["fill-antialias"] && color.alpha > 0) {
        const fringe = fringeGeometry(feature, coordinates);
        if (fringe !== undefined) {
          main.push(makeInstance(fringe, id, color));
        }
      }
    } else if (definition.type === "line") {
      if (color.alpha > 0) {
        for (const line of lineGeometries(
          feature,
          coordinates,
          paint,
          evaluated.layout,
          dashes.add(paint["line-dasharray"]),
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
    result.push({
      kind: definition.type,
      instances: main,
      dashIntervals: dashes.values,
    });
  }
  if (outlines.length > 0) {
    result.push({ kind: "line", instances: outlines });
  }
  return result;
};

export default SceneGISVectorTileGeometry;
