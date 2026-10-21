import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Occluder from "../../../Core/Occluder.js";
import PolygonHierarchy from "../../../Core/PolygonHierarchy.js";
import PolygonPipeline from "../../../Core/PolygonPipeline.js";
import Transforms from "../../../Core/Transforms.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Pass from "../../../Renderer/Pass.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import WaterMesh, {
  bounds,
  rectangle,
  segments,
} from "./_SceneGISWaterMesh.js";

const cells = 16;
const cellPixels = 8;
const cacheLimit = 16 * 1024 * 1024;
const normalScratch = new Cartesian3();
const pointScratch = new Cartesian3();
const eastScratch = new Cartesian3();
const localScratch = new Cartesian3();
const pixelScratch = new Cartesian2();

function finitePosition(p) {
  if (
    !p ||
    ![p.x, p.y, p.z].every(Number.isFinite) ||
    Cartesian3.magnitudeSquared(p) === 0
  ) {
    throw new DeveloperError(
      "Ellipsoid water requires finite nonzero ECEF positions.",
    );
  }
}

function projectHierarchy(mesh, hierarchy, perPositionHeight, height) {
  if (!hierarchy?.positions || hierarchy.positions.length < 3) {
    throw new DeveloperError(
      "polygonHierarchy requires at least three positions per ring.",
    );
  }
  const positions = hierarchy.positions.map((p) => {
    finitePosition(p);
    const c = mesh.ellipsoid.cartesianToCartographic(p);
    if (!c) {
      throw new DeveloperError(
        "A water position cannot be projected onto the ellipsoid.",
      );
    }
    const n = mesh.ellipsoid.geodeticSurfaceNormalCartographic(
      c,
      normalScratch,
    );
    const denominator = Cartesian3.dot(n, mesh.up);
    if (denominator <= 0) {
      throw new DeveloperError(
        "The water polygon must fit in the origin's open tangent hemisphere.",
      );
    }
    const z = perPositionHeight ? c.height : height;
    if (!Number.isFinite(z) || z <= -mesh.ellipsoid.minimumRadius) {
      throw new DeveloperError(
        "Water height must be finite and above the ellipsoid center.",
      );
    }
    return new Cartesian3(
      (mesh.radius * Cartesian3.dot(n, mesh.east)) / denominator,
      (mesh.radius * Cartesian3.dot(n, mesh.north)) / denominator,
      z,
    );
  });
  if (Cartesian3.equals(positions[0], positions[positions.length - 1])) {
    positions.pop();
  }
  if (positions.length < 3) {
    throw new DeveloperError("A water ring requires three distinct positions.");
  }
  return new PolygonHierarchy(
    positions,
    (hierarchy.holes ?? []).map((hole) =>
      projectHierarchy(mesh, hole, perPositionHeight, height),
    ),
  );
}

function triangles(hierarchy, result = []) {
  const positions = hierarchy.positions.slice();
  const holes = [];
  for (const hole of hierarchy.holes) {
    holes.push(positions.length);
    positions.push(...hole.positions);
    for (const island of hole.holes) {
      triangles(island, result);
    }
  }
  const indices = PolygonPipeline.triangulate(positions, holes);
  for (let i = 0; i < indices.length; i += 3) {
    const p = indices.slice(i, i + 3).map((j) => {
      const v = positions[j];
      return [v.x, v.y, v.z];
    });
    // The common clipped-grid generator preserves source winding.
    if (
      (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) -
        (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) <
      0
    ) {
      p.reverse();
    }
    result.push(p);
  }
  return result;
}

function makeNode(mesh, x, y, size, polygons, shores, parent) {
  let min = Infinity,
    max = -Infinity;
  for (const polygon of polygons) {
    for (const vertex of polygon) {
      min = Math.min(min, vertex[2]);
      max = Math.max(max, vertex[2]);
    }
  }
  const center = mesh.position(
    x + size * 0.5,
    y + size * 0.5,
    (min + max) * 0.5,
    new Cartesian3(),
  );
  const stretch =
    (mesh.ellipsoid.maximumRadius / mesh.radius) ** 2 +
    Math.max(Math.abs(min), Math.abs(max)) / mesh.radius;
  const sphere = new BoundingSphere(
    center,
    size * Math.SQRT1_2 * stretch + (max - min) * 0.5,
  );
  const node = {
    x,
    y,
    size,
    polygons,
    shores,
    parent,
    bounds: sphere,
    drawBounds: BoundingSphere.clone(sphere),
    minHeight: min,
    maxHeight: max,
    cache: [],
    children: undefined,
    lastUsed: 0,
  };
  mesh.nodes.add(node);
  return node;
}

function split(mesh, node) {
  if (node.children) {
    return node.children;
  }
  const size = node.size * 0.5;
  node.children = [];
  for (let j = 0; j < 4; ++j) {
    const x = node.x + (j % 2) * size,
      y = node.y + Math.floor(j / 2) * size;
    const polygons = [];
    for (const p of node.polygons) {
      const clipped = rectangle(p, x, y, size);
      if (clipped.length >= 3) {
        const b = bounds(clipped);
        if (b[2] > b[0] && b[3] > b[1]) {
          polygons.push(clipped);
        }
      }
    }
    if (!polygons.length) {
      continue;
    }
    const shores = node.shores.filter(
      ([a, b]) =>
        Math.max(a.x, b.x) >= x - 4 &&
        Math.min(a.x, b.x) <= x + size + 4 &&
        Math.max(a.y, b.y) >= y - 4 &&
        Math.min(a.y, b.y) <= y + size + 4,
    );
    node.children.push(makeNode(mesh, x, y, size, polygons, shores, node));
  }
  return node.children;
}

/**
 * Regional, polygon-clipped ellipsoid quadtree and its owned mesh cache.
 * @private
 */
function SceneGISEllipsoidWaterMesh(
  hierarchy,
  ellipsoid,
  height,
  perPositionHeight,
  spacing,
) {
  this.ellipsoid = ellipsoid;
  this.radius = ellipsoid.minimumRadius;
  this.spacing = spacing;
  this.nodes = new Set();
  this.selected = [];
  this.statistics = {
    visitedTiles: 0,
    selectedTiles: 0,
    budgetLimited: false,
    cachedTiles: 1,
    geometryBytes: 0,
    inactiveGeometryBytes: 0,
    triangles: 0,
    geometryBuilds: 0,
  };
  if (!hierarchy?.positions || hierarchy.positions.length < 3) {
    throw new DeveloperError(
      "polygonHierarchy requires at least three positions.",
    );
  }
  this.up = new Cartesian3();
  for (const p of hierarchy.positions) {
    finitePosition(p);
    const c = ellipsoid.cartesianToCartographic(p);
    if (!c) {
      throw new DeveloperError("Invalid ECEF water position.");
    }
    Cartesian3.add(
      this.up,
      ellipsoid.geodeticSurfaceNormalCartographic(c, normalScratch),
      this.up,
    );
  }
  if (Cartesian3.magnitude(this.up) < 1e-8) {
    throw new DeveloperError(
      "The water polygon must have a regional hemisphere origin.",
    );
  }
  Cartesian3.normalize(this.up, this.up);
  const pole = Cartesian3.mostOrthogonalAxis(this.up, new Cartesian3());
  // Preserve east/north away from the exact pole; define a deterministic polar frame.
  const axis = Math.abs(this.up.z) < 1 - 1e-12 ? Cartesian3.UNIT_Z : pole;
  this.east = Cartesian3.normalize(
    Cartesian3.cross(axis, this.up, new Cartesian3()),
    new Cartesian3(),
  );
  this.north = Cartesian3.cross(this.up, this.east, new Cartesian3());
  this.hierarchy = projectHierarchy(this, hierarchy, perPositionHeight, height);
  const polygons = triangles(this.hierarchy);
  if (!polygons.length) {
    throw new DeveloperError("The water polygon must have nonzero area.");
  }
  const b = bounds(polygons.flat());
  const minimumSize = cells * spacing;
  const size =
    minimumSize *
    2 **
      Math.max(
        0,
        Math.ceil(Math.log2(Math.max(b[2] - b[0], b[3] - b[1]) / minimumSize)),
      );
  // Grid origin is fixed for this surface, independent of the camera and selected level.
  this.root = makeNode(
    this,
    b[0],
    b[1],
    size,
    polygons,
    segments(this.hierarchy),
  );
  this.occluder = new Occluder(
    new BoundingSphere(Cartesian3.ZERO, this.radius),
    Cartesian3.UNIT_X,
  );
}

SceneGISEllipsoidWaterMesh.prototype.position = function (
  x,
  y,
  height,
  result,
) {
  const n = normalScratch;
  n.x = this.up.x + (this.east.x * x + this.north.x * y) / this.radius;
  n.y = this.up.y + (this.east.y * x + this.north.y * y) / this.radius;
  n.z = this.up.z + (this.east.z * x + this.north.z * y) / this.radius;
  Cartesian3.normalize(n, n);
  const k = Cartesian3.multiplyComponents(
    this.ellipsoid.radiiSquared,
    n,
    result,
  );
  const gamma = Math.sqrt(Cartesian3.dot(n, k));
  result.x = k.x / gamma + n.x * height;
  result.y = k.y / gamma + n.y * height;
  result.z = k.z / gamma + n.z * height;
  return result;
};

function nodePriority(mesh, node, frame, displacement, error) {
  BoundingSphere.clone(node.bounds, node.drawBounds);
  node.drawBounds.radius += displacement;
  if (
    frame.cullingVolume.computeVisibility(node.drawBounds) === -1 ||
    !mesh.occluder.isBoundingSphereVisible(node.drawBounds)
  ) {
    return 0;
  }
  const distance = Math.max(
    0.1,
    Cartesian3.distance(frame.camera.positionWC, node.bounds.center) -
      node.drawBounds.radius,
  );
  const pixels = frame.camera.frustum.getPixelDimensions(
    frame.context.drawingBufferWidth,
    frame.context.drawingBufferHeight,
    distance,
    1, // Match the drawing-buffer pixel footprint used by the vertex shader.
    pixelScratch,
  );
  const pixelSize = Math.max(1e-9, Math.min(pixels.x, pixels.y));
  const step = node.size / cells;
  const curvature = (step * step) / (4 * mesh.radius);
  return step <= mesh.spacing
    ? 1
    : Math.max(
        step / Math.max(mesh.spacing, pixelSize * cellPixels),
        curvature / (pixelSize * error),
      );
}

SceneGISEllipsoidWaterMesh.prototype.select = function (
  frame,
  displacement,
  error,
  tileLimit,
) {
  const occluderRadius = Math.max(
    1,
    this.radius + Math.min(0, this.root.minHeight) - displacement,
  );
  if (this._occluderRadius !== occluderRadius) {
    this.occluder = new Occluder(
      new BoundingSphere(Cartesian3.ZERO, occluderRadius),
      frame.camera.positionWC,
    );
    this._occluderRadius = occluderRadius;
  }
  this.occluder.cameraPosition = frame.camera.positionWC;
  const leaves = [this.root];
  let visited = 1,
    budgetLimited = false;
  this.root.priority = nodePriority(
    this,
    this.root,
    frame,
    displacement,
    error,
  );
  // Refine the largest projected error first, so budget is spent on the visible near field.
  for (;;) {
    let index = -1,
      priority = 1;
    for (let i = 0; i < leaves.length; ++i) {
      if (leaves[i].priority > priority) {
        index = i;
        priority = leaves[i].priority;
      }
    }
    if (index < 0) {
      break;
    }
    if (leaves.length + 3 > tileLimit) {
      budgetLimited = true;
      break;
    }
    const node = leaves[index];
    const children = split(this, node);
    for (const child of children) {
      child.priority = nodePriority(this, child, frame, displacement, error);
      ++visited;
    }
    leaves.splice(index, 1, ...children);
  }
  this.selected = leaves.filter((node) => node.priority > 0);
  // Keep dyadic grid origins relative to the root in the common clipping generator.
  for (const node of this.selected) {
    node.edgeCoordinates = Array.from({ length: 4 }, () => new Set());
    node.lastUsed = frame.frameNumber;
    for (let p = node.parent; p; p = p.parent) {
      p.lastUsed = frame.frameNumber;
    }
  }
  // Compare intervals, not only tile centers: a coarse edge can touch several fine tiles.
  const join = (a, sideA, b, sideB, axis) => {
    const origin = axis === 0 ? this.root.x : this.root.y;
    const av = axis === 0 ? a.x : a.y,
      bv = axis === 0 ? b.x : b.y;
    const lo = Math.max(av, bv) - origin,
      hi = Math.min(av + a.size, bv + b.size) - origin;
    const step = Math.min(a.size, b.size) / cells;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      a.edgeCoordinates[sideA].add(v);
      b.edgeCoordinates[sideB].add(v);
    }
  };
  for (let i = 0; i < this.selected.length; ++i) {
    const a = this.selected[i];
    for (let j = i + 1; j < this.selected.length; ++j) {
      const b = this.selected[j];
      const yOverlap =
        Math.min(a.y + a.size, b.y + b.size) > Math.max(a.y, b.y);
      const xOverlap =
        Math.min(a.x + a.size, b.x + b.size) > Math.max(a.x, b.x);
      if (yOverlap && Math.abs(a.x + a.size - b.x) < 1e-7) {
        join(a, 1, b, 0, 1);
      }
      if (yOverlap && Math.abs(b.x + b.size - a.x) < 1e-7) {
        join(a, 0, b, 1, 1);
      }
      if (xOverlap && Math.abs(a.y + a.size - b.y) < 1e-7) {
        join(a, 3, b, 2, 0);
      }
      if (xOverlap && Math.abs(b.y + b.size - a.y) < 1e-7) {
        join(a, 2, b, 3, 0);
      }
    }
  }
  for (const node of this.selected) {
    node.edgeCoordinates = node.edgeCoordinates.map((set) =>
      [...set].sort((a, b) => a - b),
    );
  }
  this.statistics.visitedTiles = visited;
  this.statistics.selectedTiles = this.selected.length;
  this.statistics.budgetLimited = budgetLimited;
  return this.selected;
};

SceneGISEllipsoidWaterMesh.prototype.createGeometry = function (node) {
  // Translate the chart so all dyadic grid lines are exact multiples of the spacing.
  const ox = this.root.x,
    oy = this.root.y;
  const tile = {
    x: node.x - ox,
    y: node.y - oy,
    bounds: node.bounds,
    edgeCoordinates: node.edgeCoordinates,
    polygons: node.polygons.map((p) =>
      p.map((v) => [v[0] - ox, v[1] - oy, v[2]]),
    ),
    shores: node.shores.map(([a, b]) => [
      new Cartesian3(a.x - ox, a.y - oy),
      new Cartesian3(b.x - ox, b.y - oy),
    ]),
  };
  const geometry = WaterMesh.prototype.createGeometry.call(
    {
      spacing: node.size / cells,
      size: node.size,
      doublePrecision: true,
    },
    tile,
    0,
  );
  const source = geometry.attributes.position.values,
    count = source.length / 3;
  const positions = new Float32Array(source.length),
    normals = new Float32Array(source.length),
    tangents = new Float32Array(source.length);
  const wavePositions = new Float32Array(count * 2);
  node.origin ??= this.position(
    node.x,
    node.y,
    (node.minHeight + node.maxHeight) * 0.5,
    new Cartesian3(),
  );
  node.modelMatrix ??= Transforms.eastNorthUpToFixedFrame(
    node.origin,
    this.ellipsoid,
  );
  node.inverse ??= Matrix4.inverseTransformation(
    node.modelMatrix,
    new Matrix4(),
  );
  for (let i = 0; i < count; ++i) {
    const x = source[i * 3] + ox,
      y = source[i * 3 + 1] + oy;
    this.position(x, y, source[i * 3 + 2], pointScratch);
    Matrix4.multiplyByPoint(node.inverse, pointScratch, localScratch);
    Cartesian3.pack(localScratch, positions, i * 3);
    // position() left the exact geodetic normal in normalScratch.
    const n = normalScratch;
    Matrix4.multiplyByPointAsVector(node.inverse, n, localScratch);
    Cartesian3.pack(localScratch, normals, i * 3);
    Cartesian3.multiplyByScalar(n, Cartesian3.dot(this.east, n), eastScratch);
    Cartesian3.normalize(
      Cartesian3.subtract(this.east, eastScratch, eastScratch),
      eastScratch,
    );
    Matrix4.multiplyByPointAsVector(node.inverse, eastScratch, localScratch);
    Cartesian3.pack(localScratch, tangents, i * 3);
    wavePositions[i * 2] = x - node.x;
    wavePositions[i * 2 + 1] = y - node.y;
    geometry.attributes.waveData.values[i * 2 + 1] = this.spacing;
  }
  function attribute(values, components) {
    return new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: components,
      values,
    });
  }
  geometry.attributes.position = attribute(positions, 3);
  geometry.attributes.waterNormal = attribute(normals, 3);
  geometry.attributes.waterEast = attribute(tangents, 3);
  geometry.attributes.wavePosition = attribute(wavePositions, 2);
  geometry.boundingSphere = BoundingSphere.fromVertices(positions);
  return geometry;
};

const attributeLocations = {
  position: 0,
  waveData: 1,
  waterNormal: 2,
  waterEast: 3,
  wavePosition: 4,
};
SceneGISEllipsoidWaterMesh.attributeLocations = attributeLocations;

SceneGISEllipsoidWaterMesh.prototype.update = function (surface, frame) {
  if (!frame.passes.render) {
    frame.commandList.push(...(surface._commands ?? []));
    return;
  }
  const selected = this.select(
    frame,
    surface.windWaves._maximumDisplacement,
    surface.maximumScreenSpaceError,
    surface.maximumTileCount,
  );
  surface._commands ??= [];
  surface._commands.length = 0;
  let triangles = 0,
    builds = 0;
  const base = surface._command;
  for (const node of selected) {
    const key = node.edgeCoordinates.map((edge) => edge.join(",")).join(";");
    let entry = node.cache.find((e) => e.key === key);
    if (!entry) {
      const geometry = this.createGeometry(node);
      entry = {
        key,
        vertexArray: VertexArray.fromGeometry({
          context: frame.context,
          geometry,
          attributeLocations,
          bufferUsage: BufferUsage.STATIC_DRAW,
        }),
        triangles: geometry.indices.length / 3,
        bytes:
          geometry.indices.byteLength +
          Object.values(geometry.attributes).reduce(
            (sum, a) => sum + a.values.byteLength,
            0,
          ),
      };
      node.cache.push(entry);
      ++builds;
    }
    entry.lastUsed = frame.frameNumber;
    node.offset ??= new Cartesian2();
    const period = surface.windWaves.patchLength * 4;
    node.offset.x = ((node.x % period) + period) % period;
    node.offset.y = ((node.y % period) + period) % period;
    node.foamOffset ??= new Cartesian2();
    node.foamOffset.x = node.x - node.offset.x;
    node.foamOffset.y = node.y - node.offset.y;
    node.command ??= new DrawCommand({
      owner: surface,
      pass: Pass.OPAQUE,
      pickId: "u_pickColor",
    });
    const command = node.command;
    command.uniformMap ??= {
      ...base.uniformMap,
      u_waterOffset: () => node.offset,
      u_waterFoamOffset: () => node.foamOffset,
    };
    Object.assign(command.uniformMap, base.uniformMap);
    command.vertexArray = entry.vertexArray;
    command.modelMatrix = node.modelMatrix;
    command.boundingVolume = node.drawBounds;
    command.shaderProgram = base.shaderProgram;
    command.renderState = base.renderState;
    surface._commands.push(command);
    frame.commandList.push(command);
    triangles += entry.triangles;
  }
  this.trim(frame.frameNumber, surface.maximumTileCount);
  this.statistics.triangles = triangles;
  this.statistics.geometryBuilds = builds;
};

function disposeNode(mesh, node) {
  for (const child of node.children ?? []) {
    disposeNode(mesh, child);
  }
  for (const entry of node.cache) {
    entry.vertexArray.destroy();
  }
  mesh.nodes.delete(node);
  node.children = undefined;
  node.cache.length = 0;
}

SceneGISEllipsoidWaterMesh.prototype.trim = function (frameNumber, tileLimit) {
  let inactiveBytes = 0,
    activeBytes = 0;
  const inactive = [];
  for (const node of this.nodes) {
    for (const entry of node.cache) {
      if (entry.lastUsed === frameNumber) {
        activeBytes += entry.bytes;
      } else {
        inactiveBytes += entry.bytes;
        inactive.push({ node, entry });
      }
    }
  }
  inactive.sort((a, b) => a.entry.lastUsed - b.entry.lastUsed);
  for (const { node, entry } of inactive) {
    if (inactiveBytes <= cacheLimit && node.cache.length <= 2) {
      continue;
    }
    node.cache.splice(node.cache.indexOf(entry), 1);
    entry.vertexArray.destroy();
    inactiveBytes -= entry.bytes;
  }
  // Retain the current traversal and bound old CPU branches after touring the region.
  const candidates = [...this.nodes].filter(
    (n) => n.children && n.lastUsed !== frameNumber,
  );
  candidates.sort((a, b) => a.lastUsed - b.lastUsed);
  for (const node of candidates) {
    if (this.nodes.size <= tileLimit * 8) {
      break;
    }
    // Keep the parent coverage and release a complete inactive child set.
    for (const child of node.children ?? []) {
      disposeNode(this, child);
    }
    node.children = undefined;
  }
  inactiveBytes = 0;
  for (const node of this.nodes) {
    for (const entry of node.cache) {
      if (entry.lastUsed !== frameNumber) {
        inactiveBytes += entry.bytes;
      }
    }
  }
  this.statistics.cachedTiles = this.nodes.size;
  this.statistics.geometryBytes = activeBytes + inactiveBytes;
  this.statistics.inactiveGeometryBytes = inactiveBytes;
};

SceneGISEllipsoidWaterMesh.prototype.destroy = function () {
  disposeNode(this, this.root);
};
export default SceneGISEllipsoidWaterMesh;
