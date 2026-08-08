import ArcType from "../../../Core/ArcType.js";
import AssociativeArray from "../../../Core/AssociativeArray.js";
import BlendOption from "../../../Scene/BlendOption.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import BufferPolygonMaterial from "../../../Scene/BufferPolygonMaterial.js";
import BufferPolylineMaterial from "../../../Scene/BufferPolylineMaterial.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import ColorMaterialProperty from "../../../DataSources/ColorMaterialProperty.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import HeightReference from "../../../Scene/HeightReference.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PolygonPipeline from "../../../Core/PolygonPipeline.js";
import Property from "../../../DataSources/Property.js";
import ShadowMode from "../../../Scene/ShadowMode.js";
import destroyObject from "../../../Core/destroyObject.js";
import SceneGISPlanarBufferOwner from "./_SceneGISPlanarBufferOwner.js";
import SceneGISPlanarPositionResolver from "./_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

const scratchColor = new Color();
const scratchResolved = new Cartesian3();

function value(property, time, defaultValue, result) {
  return Property.getValueOrDefault(property, time, defaultValue, result);
}

function optional(property, time, result) {
  return Property.getValueOrUndefined(property, time, result);
}

function validateFiniteColor(name, color) {
  if (
    !Number.isFinite(color.red) ||
    !Number.isFinite(color.green) ||
    !Number.isFinite(color.blue) ||
    !Number.isFinite(color.alpha)
  ) {
    throw new DeveloperError(`${name} components must be finite.`);
  }
}

function getFillColor(graphic, time) {
  const material = graphic._material;
  if (material === undefined) {
    return Color.clone(Color.WHITE);
  }
  if (!(material instanceof ColorMaterialProperty)) {
    throw new DeveloperError("material must be a ColorMaterialProperty.");
  }
  const color = Color.clone(
    value(material.color, time, Color.WHITE, scratchColor),
  );
  validateFiniteColor("material color", color);
  return color;
}

function validateUnsupported(graphic, time) {
  const arcType = optional(graphic._arcType, time);
  if (arcType !== undefined && arcType !== ArcType.NONE) {
    throw new DeveloperError("arcType must be ArcType.NONE when defined.");
  }
  const shadows = optional(graphic._shadows, time);
  if (shadows !== undefined && shadows !== ShadowMode.DISABLED) {
    throw new DeveloperError("shadows must be ShadowMode.DISABLED.");
  }
  const unsupportedProperties = [
    ["stRotation", graphic._stRotation],
    ["granularity", graphic._granularity],
    ["textureCoordinates", graphic._textureCoordinates],
    ["distanceDisplayCondition", graphic._distanceDisplayCondition],
    ["classificationType", graphic._classificationType],
    ["zIndex", graphic._zIndex],
  ];
  for (let i = 0; i < unsupportedProperties.length; i++) {
    const [name, property] = unsupportedProperties[i];
    if (optional(property, time) !== undefined) {
      throw new DeveloperError(`${name} is not supported.`);
    }
  }
}

function sameXY(left, right) {
  return left.x === right.x && left.y === right.y;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, point) {
  return (
    cross(a, b, point) === 0.0 &&
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  );
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > 0.0 && abD < 0.0) || (abC < 0.0 && abD > 0.0)) &&
    ((cdA > 0.0 && cdB < 0.0) || (cdA < 0.0 && cdB > 0.0))
  ) {
    return true;
  }
  return (
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}

function normalizeRing(positions) {
  if (!Array.isArray(positions) || positions.length < 3) {
    throw new DeveloperError("Each polygon ring must contain three positions.");
  }
  const ring = positions.slice();
  for (let i = 0; i < ring.length; i++) {
    const position = ring[i];
    if (
      !(position instanceof Cartesian3) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new DeveloperError(
        "Polygon positions must be finite Cartesian3 values.",
      );
    }
  }
  if (ring.length > 3 && sameXY(ring[0], ring[ring.length - 1])) {
    ring.pop();
  }
  if (ring.length < 3) {
    throw new DeveloperError("Each normalized ring must have three vertices.");
  }
  const distinct = new Set();
  let signedArea = 0.0;
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    distinct.add(`${current.x}\n${current.y}`);
    signedArea += current.x * next.y - next.x * current.y;
  }
  if (distinct.size < 3 || !Number.isFinite(signedArea) || signedArea === 0.0) {
    throw new DeveloperError("Polygon rings must have nonzero finite area.");
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (let j = i + 1; j < ring.length; j++) {
      const nextJ = (j + 1) % ring.length;
      if (j === i || nextJ === i || j === (i + 1) % ring.length) {
        continue;
      }
      if (segmentsIntersect(a, b, ring[j], ring[nextJ])) {
        throw new DeveloperError("Polygon rings must be simple.");
      }
    }
  }
  return ring;
}

function ringsIntersect(left, right) {
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = left[(i + 1) % left.length];
    for (let j = 0; j < right.length; j++) {
      if (segmentsIntersect(a, b, right[j], right[(j + 1) % right.length])) {
        return true;
      }
    }
  }
  return false;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    if (onSegment(a, b, point)) {
      return false;
    }
    if (
      a.y !== b.y &&
      point.y < Math.max(a.y, b.y) &&
      point.y >= Math.min(a.y, b.y) &&
      point.x < ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function getRings(hierarchy) {
  if (
    hierarchy === undefined ||
    hierarchy === null ||
    !Array.isArray(hierarchy.positions)
  ) {
    throw new DeveloperError("hierarchy must define an outer ring.");
  }
  const outer = normalizeRing(hierarchy.positions);
  const sourceHoles = hierarchy.holes ?? [];
  if (!Array.isArray(sourceHoles)) {
    throw new DeveloperError("hierarchy holes must be an array.");
  }
  const holes = new Array(sourceHoles.length);
  for (let i = 0; i < sourceHoles.length; i++) {
    const sourceHole = sourceHoles[i];
    if ((sourceHole.holes?.length ?? 0) !== 0) {
      throw new DeveloperError("Nested polygon holes are not supported.");
    }
    const hole = normalizeRing(sourceHole.positions);
    if (ringsIntersect(outer, hole) || !pointInRing(hole[0], outer)) {
      throw new DeveloperError(
        "Polygon holes must lie strictly inside the outer ring.",
      );
    }
    holes[i] = hole;
  }
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      if (
        ringsIntersect(holes[i], holes[j]) ||
        pointInRing(holes[i][0], holes[j]) ||
        pointInRing(holes[j][0], holes[i])
      ) {
        throw new DeveloperError(
          "Polygon holes must not overlap or contain each other.",
        );
      }
    }
  }
  return [outer, ...holes];
}

function triangulateRings(rings) {
  const positions = [];
  const holes = [];
  for (let i = 0; i < rings.length; i++) {
    if (i > 0) {
      holes.push(positions.length);
    }
    for (let j = 0; j < rings[i].length; j++) {
      positions.push(new Cartesian2(rings[i][j].x, rings[i][j].y));
    }
  }
  const triangles = PolygonPipeline.triangulate(positions, holes);
  if (triangles.length < 3 || triangles.length % 3 !== 0) {
    throw new DeveloperError(
      "Polygon triangulation must produce complete triangles.",
    );
  }
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i];
    const b = triangles[i + 1];
    const c = triangles[i + 2];
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      !Number.isInteger(c) ||
      a < 0 ||
      b < 0 ||
      c < 0 ||
      a >= positions.length ||
      b >= positions.length ||
      c >= positions.length ||
      cross(positions[a], positions[b], positions[c]) === 0.0
    ) {
      throw new DeveloperError(
        "Polygon triangulation produced an invalid triangle.",
      );
    }
  }
  return { triangles, holeOffsets: holes };
}

function resolveHeights(visualizer, rings, options) {
  const top = [];
  const bottom = options.extruded ? [] : undefined;
  let outside = false;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex];
    for (let i = 0; i < ring.length; i++) {
      const source = ring[i];
      const topInput = options.perPositionHeight
        ? source
        : new Cartesian3(source.x, source.y, options.height);
      const topPosition = SceneGISPlanarPositionResolver.resolve(
        visualizer._world,
        topInput,
        options.perPositionHeight
          ? HeightReference.NONE
          : options.heightReference,
        scratchResolved,
      );
      if (topPosition === undefined) {
        outside = true;
        top.push(undefined);
      } else {
        top.push(Cartesian3.clone(topPosition));
      }
      if (bottom !== undefined) {
        const bottomPosition = SceneGISPlanarPositionResolver.resolve(
          visualizer._world,
          new Cartesian3(source.x, source.y, options.extrudedHeight),
          options.extrudedHeightReference,
          scratchResolved,
        );
        if (bottomPosition === undefined) {
          outside = true;
          bottom.push(undefined);
        } else {
          bottom.push(Cartesian3.clone(bottomPosition));
        }
      }
    }
  }
  if (!outside && bottom !== undefined) {
    for (let i = 0; i < top.length; i++) {
      if (bottom[i].z > top[i].z) {
        throw new DeveloperError(
          "extrudedHeight must not exceed the top height.",
        );
      }
    }
  }
  return { top, bottom, outside };
}

function appendTriangle(target, a, b, c) {
  target.push(a, b, c);
}

function buildFill(rings, triangulation, top, bottom, closeTop, closeBottom) {
  const positions = bottom === undefined ? top.slice() : [...top, ...bottom];
  const triangles = [];
  if (bottom === undefined || closeTop) {
    triangles.push(...triangulation.triangles);
  }
  const topCount = top.length;
  if (bottom !== undefined) {
    if (closeBottom) {
      for (let i = 0; i < triangulation.triangles.length; i += 3) {
        appendTriangle(
          triangles,
          topCount + triangulation.triangles[i],
          topCount + triangulation.triangles[i + 2],
          topCount + triangulation.triangles[i + 1],
        );
      }
    }
    let ringOffset = 0;
    for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
      const ringLength = rings[ringIndex].length;
      for (let i = 0; i < ringLength; i++) {
        const current = ringOffset + i;
        const next = ringOffset + ((i + 1) % ringLength);
        appendTriangle(triangles, current, next, topCount + next);
        appendTriangle(triangles, current, topCount + next, topCount + current);
      }
      ringOffset += ringLength;
    }
  }
  return { positions, triangles };
}

function toLocalArray(positions, origin) {
  const local = new Float64Array(positions.length * 3);
  for (let i = 0; i < positions.length; i++) {
    local[i * 3] = positions[i].x - origin.x;
    local[i * 3 + 1] = positions[i].y - origin.y;
    local[i * 3 + 2] = positions[i].z;
  }
  return local;
}

function buildOutline(rings, top, bottom, origin, material) {
  const primitives = [];
  let offset = 0;
  const addRing = (positions) => {
    primitives.push({
      positions: toLocalArray([...positions, positions[0]], origin),
      material,
    });
  };
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const length = rings[ringIndex].length;
    const topRing = top.slice(offset, offset + length);
    addRing(topRing);
    if (bottom !== undefined) {
      const bottomRing = bottom.slice(offset, offset + length);
      addRing(bottomRing);
      for (let i = 0; i < length; i++) {
        primitives.push({
          positions: toLocalArray([topRing[i], bottomRing[i]], origin),
          material,
        });
      }
    }
    offset += length;
  }
  return primitives;
}

function computeState(visualizer, item, time) {
  const entity = item.entity;
  const graphic = entity._polygon;
  validateUnsupported(graphic, time);
  const hierarchy = optional(graphic._hierarchy, time);
  if (hierarchy === undefined) {
    return { missing: true };
  }
  const rings = getRings(hierarchy);
  const triangulation = triangulateRings(rings);
  const perPositionHeight = value(graphic._perPositionHeight, time, false);
  const height = value(graphic._height, time, 0.0);
  const heightReference = value(
    graphic._heightReference,
    time,
    HeightReference.NONE,
  );
  if (typeof perPositionHeight !== "boolean" || !Number.isFinite(height)) {
    throw new DeveloperError("perPositionHeight and height must be valid.");
  }
  if (perPositionHeight && heightReference !== HeightReference.NONE) {
    throw new DeveloperError(
      "heightReference must be NONE with perPositionHeight.",
    );
  }
  const extrudedHeight = optional(graphic._extrudedHeight, time);
  if (extrudedHeight !== undefined && !Number.isFinite(extrudedHeight)) {
    throw new DeveloperError("extrudedHeight must be finite when defined.");
  }
  const extrudedHeightReference = value(
    graphic._extrudedHeightReference,
    time,
    HeightReference.NONE,
  );
  const fill = value(graphic._fill, time, true);
  const outline = value(graphic._outline, time, false);
  const closeTop = value(graphic._closeTop, time, true);
  const closeBottom = value(graphic._closeBottom, time, true);
  if (
    typeof fill !== "boolean" ||
    typeof outline !== "boolean" ||
    typeof closeTop !== "boolean" ||
    typeof closeBottom !== "boolean"
  ) {
    throw new DeveloperError(
      "Polygon visibility and cap flags must be boolean.",
    );
  }
  const fillColor = getFillColor(graphic, time);
  const outlineColor = Color.clone(
    value(graphic._outlineColor, time, Color.BLACK, scratchColor),
  );
  validateFiniteColor("outlineColor", outlineColor);
  const outlineWidth = value(graphic._outlineWidth, time, 1.0);
  if (
    !Number.isInteger(outlineWidth) ||
    outlineWidth < 0 ||
    outlineWidth > 255
  ) {
    throw new DeveloperError(
      "outlineWidth must be an integer between 0 and 255.",
    );
  }
  const resolved = resolveHeights(visualizer, rings, {
    perPositionHeight,
    height,
    heightReference,
    extruded: extrudedHeight !== undefined,
    extrudedHeight,
    extrudedHeightReference,
  });
  const shown =
    entity.isShowing &&
    entity.isAvailable(time) &&
    value(graphic._show, time, true) &&
    !resolved.outside &&
    ((fill && fillColor.alpha > 0.0) ||
      (outline && outlineWidth > 0.0 && outlineColor.alpha > 0.0));
  if (!shown) {
    return { shown: false };
  }
  const origin = new Cartesian3(resolved.top[0].x, resolved.top[0].y, 0.0);
  const allWorldPositions =
    resolved.bottom === undefined
      ? resolved.top
      : [...resolved.top, ...resolved.bottom];
  const boundingSphere = BoundingSphere.fromPoints(allWorldPositions);
  if (
    !Number.isFinite(boundingSphere.center.x) ||
    !Number.isFinite(boundingSphere.center.y) ||
    !Number.isFinite(boundingSphere.center.z) ||
    !Number.isFinite(boundingSphere.radius)
  ) {
    throw new DeveloperError("The derived bounding sphere must be finite.");
  }
  const fillGeometry = fill
    ? buildFill(
        rings,
        triangulation,
        resolved.top,
        resolved.bottom,
        closeTop,
        closeBottom,
      )
    : undefined;
  const fillMaterial = new BufferPolygonMaterial({ color: fillColor });
  const outlineMaterial = new BufferPolylineMaterial({
    color: outlineColor,
    width: outlineWidth,
  });
  const outlinePrimitives = outline
    ? buildOutline(
        rings,
        resolved.top,
        resolved.bottom,
        origin,
        outlineMaterial,
      )
    : undefined;
  const fillBlend =
    fillColor.alpha === 1.0 ? BlendOption.OPAQUE : BlendOption.TRANSLUCENT;
  const outlineBlend =
    outlineColor.alpha === 1.0 ? BlendOption.OPAQUE : BlendOption.TRANSLUCENT;
  const fillPositions =
    fillGeometry === undefined
      ? undefined
      : toLocalArray(fillGeometry.positions, origin);
  const fillTriangles =
    fillGeometry === undefined
      ? undefined
      : new Uint32Array(fillGeometry.triangles);
  const outlineVertexCount =
    outlinePrimitives?.reduce(
      (sum, primitive) => sum + primitive.positions.length / 3,
      0,
    ) ?? 0;
  return {
    shown: true,
    origin,
    modelMatrix: Matrix4.fromTranslation(origin),
    boundingSphere,
    fillPositions,
    fillTriangles,
    fillMaterial,
    fillBlend,
    outlinePrimitives,
    outlineVertexCount,
    outlineBlend,
    signature: [
      origin.x,
      origin.y,
      fillPositions?.length ?? 0,
      fillTriangles?.length ?? 0,
      fillBlend,
      outlinePrimitives?.length ?? 0,
      outlineVertexCount,
      outlineBlend,
    ].join("|"),
  };
}

function createOwner(visualizer, item, state) {
  const owner = new SceneGISPlanarBufferOwner(
    visualizer._scene,
    item.entity,
    visualizer._primitives,
  );
  try {
    if (state.fillPositions !== undefined) {
      const fill = owner.addPolygonCollection({
        positions: state.fillPositions,
        holes: new Uint32Array(),
        triangles: state.fillTriangles,
        material: state.fillMaterial,
        modelMatrix: state.modelMatrix,
        boundingVolume: state.boundingSphere,
        blendOption: state.fillBlend,
      });
      owner.fillCollection = fill.collection;
      owner.fillPrimitive = fill.primitive;
    }
    if (state.outlinePrimitives !== undefined) {
      const outline = owner.addPolylineCollection({
        primitives: state.outlinePrimitives,
        vertexCount: state.outlineVertexCount,
        modelMatrix: state.modelMatrix,
        boundingVolume: state.boundingSphere,
        blendOption: state.outlineBlend,
      });
      owner.outlineCollection = outline.collection;
      owner.outlinePrimitives = outline.primitives;
    }
    owner.signature = state.signature;
    owner.appliedFillPositions = state.fillPositions?.slice();
    owner.appliedFillTriangles = state.fillTriangles?.slice();
    owner.appliedFillMaterialKey = state.fillMaterial.color.toRgba();
    owner.appliedOutlinePositions = state.outlinePrimitives?.map((primitive) =>
      primitive.positions.slice(),
    );
    owner.appliedOutlineMaterialKeys = state.outlinePrimitives?.map(
      (primitive) =>
        `${primitive.material.color.toRgba()}|${primitive.material.width}`,
    );
    owner.boundingSphere = BoundingSphere.clone(state.boundingSphere);
    owner.shown = true;
    return owner;
  } catch (error) {
    owner.destroy();
    throw error;
  }
}

function arrayEquals(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function boundingSphereEquals(left, right) {
  return (
    Cartesian3.equals(left.center, right.center) && left.radius === right.radius
  );
}

function applyState(owner, state) {
  if (owner.fillPrimitive !== undefined) {
    if (!arrayEquals(owner.appliedFillPositions, state.fillPositions)) {
      owner.fillPrimitive.setPositions(state.fillPositions);
      owner.appliedFillPositions = state.fillPositions.slice();
    }
    if (!arrayEquals(owner.appliedFillTriangles, state.fillTriangles)) {
      owner.fillPrimitive.setTriangles(state.fillTriangles);
      owner.appliedFillTriangles = state.fillTriangles.slice();
    }
    const fillMaterialKey = state.fillMaterial.color.toRgba();
    if (owner.appliedFillMaterialKey !== fillMaterialKey) {
      owner.fillPrimitive.setMaterial(state.fillMaterial);
      owner.appliedFillMaterialKey = fillMaterialKey;
    }
  }
  if (owner.outlinePrimitives !== undefined) {
    for (let i = 0; i < owner.outlinePrimitives.length; i++) {
      const primitive = owner.outlinePrimitives[i];
      const outlineState = state.outlinePrimitives[i];
      if (
        !arrayEquals(owner.appliedOutlinePositions[i], outlineState.positions)
      ) {
        primitive.setPositions(outlineState.positions);
        owner.appliedOutlinePositions[i] = outlineState.positions.slice();
      }
      const materialKey = `${outlineState.material.color.toRgba()}|${outlineState.material.width}`;
      if (owner.appliedOutlineMaterialKeys[i] !== materialKey) {
        primitive.setMaterial(outlineState.material);
        owner.appliedOutlineMaterialKeys[i] = materialKey;
      }
    }
  }
  if (!boundingSphereEquals(owner.boundingSphere, state.boundingSphere)) {
    if (owner.fillCollection !== undefined) {
      BoundingSphere.clone(
        state.boundingSphere,
        owner.fillCollection._boundingVolume,
      );
    }
    if (owner.outlineCollection !== undefined) {
      BoundingSphere.clone(
        state.boundingSphere,
        owner.outlineCollection._boundingVolume,
      );
    }
    BoundingSphere.clone(state.boundingSphere, owner.boundingSphere);
  }
  owner.setShow(true);
  owner.shown = true;
}

function releaseOwner(item) {
  if (item.owner !== undefined) {
    item.owner.destroy();
    item.owner = undefined;
  }
}

/**
 * Visualizes simple planar PolygonGraphics with explicit buffer triangles.
 *
 * @alias SceneGISPlanarPolygonVisualizer
 * @constructor
 * @private
 */
function SceneGISPlanarPolygonVisualizer(
  world,
  scene,
  entityCollection,
  primitiveCollection,
) {
  if (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed()) {
    throw new DeveloperError("world must be a live SceneGISPlanarWorld.");
  }
  if (scene === undefined || scene.isDestroyed?.() === true) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (!(entityCollection instanceof EntityCollection)) {
    throw new DeveloperError("entityCollection is required.");
  }
  this._world = world;
  this._scene = scene;
  this._primitives = primitiveCollection ?? scene.primitives;
  if (
    typeof this._primitives.add !== "function" ||
    typeof this._primitives.remove !== "function" ||
    typeof this._primitives.contains !== "function"
  ) {
    throw new DeveloperError("primitiveCollection must own primitives.");
  }
  this._entityCollection = entityCollection;
  this._items = new AssociativeArray();
  entityCollection.collectionChanged.addEventListener(
    SceneGISPlanarPolygonVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(entityCollection, entityCollection.values, [], []);
}

SceneGISPlanarPolygonVisualizer.prototype.update = function (time) {
  if (time === undefined) {
    throw new DeveloperError("time is required.");
  }
  const items = this._items.values;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const state = computeState(this, item, time);
    if (state.missing) {
      releaseOwner(item);
      continue;
    }
    if (!state.shown) {
      item.owner?.setShow(false);
      if (item.owner !== undefined) {
        item.owner.shown = false;
      }
      continue;
    }
    if (item.owner !== undefined && item.owner.signature === state.signature) {
      applyState(item.owner, state);
      continue;
    }
    const candidate = createOwner(this, item, state);
    candidate.insert();
    releaseOwner(item);
    item.owner = candidate;
  }
  return true;
};

SceneGISPlanarPolygonVisualizer.prototype.getBoundingSphere = function (
  entity,
  result,
) {
  if (entity === undefined || result === undefined) {
    throw new DeveloperError("entity and result are required.");
  }
  const owner = this._items.get(entity.id)?.owner;
  if (owner === undefined || !owner.shown) {
    return BoundingSphereState.FAILED;
  }
  BoundingSphere.clone(owner.boundingSphere, result);
  return BoundingSphereState.DONE;
};

SceneGISPlanarPolygonVisualizer.prototype.isDestroyed = function () {
  return false;
};

SceneGISPlanarPolygonVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    SceneGISPlanarPolygonVisualizer.prototype._onCollectionChanged,
    this,
  );
  const items = this._items.values;
  for (let i = items.length - 1; i >= 0; i--) {
    releaseOwner(items[i]);
  }
  this._items.removeAll();
  return destroyObject(this);
};

SceneGISPlanarPolygonVisualizer.prototype._onCollectionChanged = function (
  entityCollection,
  added,
  removed,
  changed,
) {
  const add = (entity) => {
    if (entity._polygon !== undefined && !this._items.contains(entity.id)) {
      this._items.set(entity.id, { entity, owner: undefined });
    }
  };
  const remove = (entity) => {
    const item = this._items.get(entity.id);
    if (item !== undefined) {
      releaseOwner(item);
      this._items.remove(entity.id);
    }
  };
  for (let i = added.length - 1; i >= 0; i--) {
    add(added[i]);
  }
  for (let i = changed.length - 1; i >= 0; i--) {
    if (changed[i]._polygon !== undefined) {
      add(changed[i]);
    } else {
      remove(changed[i]);
    }
  }
  for (let i = removed.length - 1; i >= 0; i--) {
    remove(removed[i]);
  }
};

export default SceneGISPlanarPolygonVisualizer;
