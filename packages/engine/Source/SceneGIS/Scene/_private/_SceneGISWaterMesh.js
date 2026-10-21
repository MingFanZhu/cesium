import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";

// Clip already triangulated water, preserving islands and concave shorelines.
function clip(points, axis, boundary, sign) {
  const output = [];
  for (let i = 0; i < points.length; ++i) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const insideA = (a[axis] - boundary) * sign >= 0;
    const insideB = (b[axis] - boundary) * sign >= 0;
    if (insideA) {
      output.push(a);
    }
    if (insideA !== insideB) {
      const t = (boundary - a[axis]) / (b[axis] - a[axis]);
      const v = a.map((value, j) => value + (b[j] - value) * t);
      v[axis] = boundary;
      output.push(v);
    }
  }
  return output;
}
function rectangle(p, x, y, size) {
  return clip(
    clip(clip(clip(p, 0, x, 1), 0, x + size, -1), 1, y, 1),
    1,
    y + size,
    -1,
  );
}
function bounds(points) {
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
}
function segments(hierarchy, result = []) {
  const ring = hierarchy.positions;
  for (let i = 0; i < ring.length; ++i) {
    result.push([ring[i], ring[(i + 1) % ring.length]]);
  }
  for (const hole of hierarchy.holes) {
    segments(hole, result);
  }
  return result;
}
function distanceSquared(x, y, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return (x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2;
}
/**
 *  Polygon-clipped LOD tiles with identical boundary tessellation at every level.
 * @private
 */
function SceneGISWaterMesh(geometry, hierarchy, spacing) {
  this.spacing = spacing;
  this.size = 128;
  this.lodScale = 2 / this.size;
  this.tiles = [];
  const tiles = new Map(),
    positions = geometry.attributes.position.values,
    indices = geometry.indices;
  for (let i = 0; i < indices.length; i += 3) {
    const p = Array.from(indices.subarray(i, i + 3), (index) => [
      positions[index * 3],
      positions[index * 3 + 1],
    ]);
    const b = bounds(p);
    for (
      let y = Math.floor(b[1] / this.size);
      y < Math.ceil(b[3] / this.size);
      ++y
    ) {
      for (
        let x = Math.floor(b[0] / this.size);
        x < Math.ceil(b[2] / this.size);
        ++x
      ) {
        const polygon = rectangle(p, x * this.size, y * this.size, this.size);
        if (polygon.length < 3) {
          continue;
        }
        const key = `${x},${y}`;
        let tile = tiles.get(key);
        if (!tile) {
          tile = {
            x: x * this.size,
            y: y * this.size,
            polygons: [],
            cache: [],
            bounds: new BoundingSphere(
              new Cartesian3((x + 0.5) * this.size, (y + 0.5) * this.size, 0),
              this.size / Math.sqrt(2),
            ),
          };
          tiles.set(key, tile);
          this.tiles.push(tile);
        }
        tile.polygons.push(polygon);
      }
    }
  }
  const shores = segments(hierarchy);
  for (const tile of this.tiles) {
    tile.shores = shores.filter(
      ([a, b]) =>
        Math.max(a.x, b.x) >= tile.x - 4 &&
        Math.min(a.x, b.x) <= tile.x + this.size + 4 &&
        Math.max(a.y, b.y) >= tile.y - 4 &&
        Math.min(a.y, b.y) <= tile.y + this.size + 4,
    );
  }
}
SceneGISWaterMesh.prototype.createGeometry = function (tile, level) {
  const fine = this.spacing,
    step = fine * 2 ** level,
    size = this.size;
  const river = this.river;
  const riverData = [];
  const positions = [],
    waveData = [],
    indices = [],
    vertices = new Map();
  function vertex(p) {
    // Quantization only merges roundoff at intersections shared by adjacent triangles.
    const key = `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
    if (vertices.has(key)) {
      return vertices.get(key);
    }
    const index = positions.length / 3;
    vertices.set(key, index);
    positions.push(p[0], p[1], p[2] ?? 0);
    if (river) {
      riverData.push(p[3], p[4], p[5]);
    }
    let distance = 16;
    for (const [a, b] of tile.shores) {
      distance = Math.min(distance, distanceSquared(p[0], p[1], a, b));
    }
    const fade = Math.min(1, Math.sqrt(distance) / 4);
    // A vertex's wave filter must not depend on its tile or selected mesh LOD.
    waveData.push(fade * fade * (3 - 2 * fade), fine);
    return index;
  }
  for (const polygon of tile.polygons) {
    const b = bounds(polygon);
    for (let y = Math.floor(b[1] / step) * step; y < b[3] - 1e-8; y += step) {
      for (let x = Math.floor(b[0] / step) * step; x < b[2] - 1e-8; x += step) {
        const cell = rectangle(polygon, x, y, step);
        if (cell.length < 3) {
          continue;
        }
        const border = [];
        for (let i = 0; i < cell.length; ++i) {
          const a = cell[i],
            b = cell[(i + 1) % cell.length];
          border.push(a);
          // Local grids retain finest edges; curved grids supply shared neighbor coordinates.
          let axis;
          let edge;
          if (
            Math.abs(a[0] - b[0]) < 1e-8 &&
            (Math.abs(a[0] - tile.x) < 1e-8 ||
              Math.abs(a[0] - tile.x - size) < 1e-8)
          ) {
            axis = 1;
            edge = Math.abs(a[0] - tile.x) < 1e-8 ? 0 : 1;
          }
          if (
            Math.abs(a[1] - b[1]) < 1e-8 &&
            (Math.abs(a[1] - tile.y) < 1e-8 ||
              Math.abs(a[1] - tile.y - size) < 1e-8)
          ) {
            axis = 0;
            edge = Math.abs(a[1] - tile.y) < 1e-8 ? 2 : 3;
          }
          if (axis !== undefined) {
            const low = Math.min(a[axis], b[axis]),
              high = Math.max(a[axis], b[axis]);
            const points = [];
            const coordinates = tile.edgeCoordinates?.[edge];
            const values = coordinates ?? [];
            if (!coordinates) {
              for (
                let v = (Math.floor(low / fine) + 1) * fine;
                v < high - 1e-8;
                v += fine
              ) {
                values.push(v);
              }
            }
            for (const v of values) {
              if (v <= low + 1e-8 || v >= high - 1e-8) {
                continue;
              }
              const p = a.slice();
              for (let j = 2; j < p.length; ++j) {
                p[j] =
                  a[j] + (b[j] - a[j]) * ((v - a[axis]) / (b[axis] - a[axis]));
              }
              p[axis] = v;
              points.push(p);
            }
            if (a[axis] > b[axis]) {
              points.reverse();
            }
            border.push(...points);
          }
        }
        if (border.length === cell.length) {
          // Interior cells need only two triangles; reserve center fans for stitched boundaries.
          for (let i = 1; i + 1 < cell.length; ++i) {
            const a = cell[0],
              b = cell[i],
              c = cell[i + 1];
            if (
              Math.abs(
                (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]),
              ) > 1e-10
            ) {
              indices.push(vertex(a), vertex(b), vertex(c));
            }
          }
          continue;
        }
        // A center fan preserves collinear boundary vertices on coarse tiles.
        const center = cell[0].map(() => 0);
        for (const p of cell) {
          for (let j = 0; j < center.length; ++j) {
            center[j] += p[j] / cell.length;
          }
        }
        const c = vertex(center);
        for (let i = 0; i < border.length; ++i) {
          const a = border[i],
            b = border[(i + 1) % border.length];
          if (
            Math.abs(
              (a[0] - center[0]) * (b[1] - center[1]) -
                (b[0] - center[0]) * (a[1] - center[1]),
            ) < 1e-10
          ) {
            continue;
          }
          indices.push(c, vertex(a), vertex(b));
        }
      }
    }
  }
  const geometry = new Geometry({
    attributes: {
      position: new GeometryAttribute({
        componentDatatype: this.doublePrecision
          ? ComponentDatatype.DOUBLE
          : ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: this.doublePrecision
          ? new Float64Array(positions)
          : new Float32Array(positions),
      }),
      waveData: new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: new Float32Array(waveData),
      }),
    },
    indices: IndexDatatype.createTypedArray(positions.length / 3, indices),
    boundingSphere: BoundingSphere.clone(tile.bounds),
  });
  if (river) {
    geometry.attributes.riverData = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 3,
      values: new Float32Array(riverData),
    });
  }
  return geometry;
};
export default SceneGISWaterMesh;
export { bounds, rectangle, segments };
