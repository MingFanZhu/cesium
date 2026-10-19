import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import EncodedCartesian3 from "../../../Core/EncodedCartesian3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Line from "../../Core/_private/_SceneGISVectorSymbolLine.js";
import EllipsoidalOccluder from "../../../Core/EllipsoidalOccluder.js";
import GlobeCoordinates from "../../Core/_private/_SceneGISVectorGlobeCoordinates.js";

function snapshot(scene, terrain, referenceDepth) {
  const camera = scene.camera,
    frustum = camera.frustum;
  const position = camera.positionWC,
    direction = camera.directionWC,
    projection = frustum.projectionMatrix;
  const up = camera.upWC,
    right = camera.rightWC;
  const planes = [];
  for (let row = 0; row < 3; row++) {
    for (const sign of [-1, 1]) {
      const x = projection[3] + sign * projection[row];
      const y = projection[7] + sign * projection[4 + row];
      const z = projection[11] + sign * projection[8 + row];
      planes.push([
        right.x * x + up.x * y - direction.x * z,
        right.y * x + up.y * y - direction.y * z,
        right.z * x + up.z * y - direction.z * z,
        projection[15] + sign * projection[12 + row],
      ]);
    }
  }
  // Camera getters update their derived members. Read once for a placement pass,
  // instead of invoking that work for every anchor and glyph corner.
  return {
    terrain,
    planes,
    referenceDepth: referenceDepth ?? -position.z / direction.z,
    horizon: terrain?.ellipsoid
      ? new EllipsoidalOccluder(terrain.ellipsoid, position)
      : undefined,
    camera: {
      positionWC: Cartesian3.clone(position),
      directionWC: Cartesian3.clone(direction),
      upWC: Cartesian3.clone(up),
      rightWC: Cartesian3.clone(right),
      frustum: {
        near: frustum.near,
        far: frustum.far,
        projectionMatrix: Matrix4.clone(projection),
      },
    },
    // Beyond four reference depths, ground scale is over two zoom levels coarser.
    // Cull the whole label before asset requests; do not clip individual glyphs.
    maximumAnchorDepth:
      projection[15] === 0
        ? Math.min(
            frustum.far,
            (referenceDepth ?? -position.z / direction.z) * 4,
          )
        : frustum.far,
    canvas: {
      clientWidth: scene.canvas.clientWidth,
      clientHeight: scene.canvas.clientHeight,
    },
  };
}

function intersectsBounds(scene, bounds) {
  const eye = scene.camera.positionWC;
  const minimum = [bounds[0] - eye.x, bounds[1] - eye.y, bounds[2] - eye.z];
  const maximum = [bounds[3] - eye.x, bounds[4] - eye.y, bounds[5] - eye.z];
  if (bounds[0] > bounds[3]) {
    return false;
  }
  for (const plane of scene.planes) {
    let distance = plane[3];
    for (let i = 0; i < 3; i++) {
      distance += plane[i] * (plane[i] >= 0 ? maximum[i] : minimum[i]);
    }
    if (distance < 0) {
      return false;
    }
  }
  const direction = scene.camera.directionWC;
  const depth =
    direction.x * (direction.x >= 0 ? minimum[0] : maximum[0]) +
    direction.y * (direction.y >= 0 ? minimum[1] : maximum[1]) +
    direction.z * (direction.z >= 0 ? minimum[2] : maximum[2]);
  return depth <= scene.maximumAnchorDepth;
}

function terrainPoint(scene, x, y) {
  if (scene.terrain?.ellipsoid) {
    return GlobeCoordinates.position(x, y, scene.terrain.height(x, y));
  }
  return new Cartesian3(x, y, scene.terrain?.height(x, y) ?? 0);
}

function attach(scene, candidate) {
  if (candidate.terrain === scene.terrain) {
    return;
  }
  const position = candidate.anchor.position;
  candidate.position = terrainPoint(scene, position.x, position.y);
  candidate.encoded = EncodedCartesian3.fromCartesian(candidate.position);
  candidate.terrain = scene.terrain;
}

function depth(scene, point) {
  const eye = scene.camera.positionWC,
    direction = scene.camera.directionWC;
  return (
    (point.x - eye.x) * direction.x +
    (point.y - eye.y) * direction.y +
    ((point.z ?? 0) - eye.z) * direction.z
  );
}

const eyePoint = new Cartesian4();
function windowPoint(scene, point) {
  const camera = scene.camera,
    eye = camera.positionWC,
    right = camera.rightWC,
    up = camera.upWC;
  const x = point.x - eye.x,
    y = point.y - eye.y,
    z = (point.z ?? 0) - eye.z;
  eyePoint.x = x * right.x + y * right.y + z * right.z;
  eyePoint.y = x * up.x + y * up.y + z * up.z;
  eyePoint.z = -depth(scene, point);
  eyePoint.w = 1;
  // Use eye-relative doubles and the actual projection. SceneTransforms rejects
  // negative clip Z, although the near half of a perspective frustum has Z < 0.
  Matrix4.multiplyByVector(camera.frustum.projectionMatrix, eyePoint, eyePoint);
  return new Cartesian2(
    ((eyePoint.x / eyePoint.w) * 0.5 + 0.5) * scene.canvas.clientWidth,
    (0.5 - (eyePoint.y / eyePoint.w) * 0.5) * scene.canvas.clientHeight,
  );
}

function project(scene, point) {
  const distance = depth(scene, point),
    frustum = scene.camera.frustum;
  if (distance < frustum.near || distance > frustum.far) {
    return undefined;
  }
  return windowPoint(scene, point);
}

function visible(scene, point) {
  if (scene.horizon && !scene.horizon.isPointVisible(point)) {
    return undefined;
  }
  const distance = depth(scene, point);
  if (
    distance <= scene.camera.frustum.near ||
    distance > scene.maximumAnchorDepth
  ) {
    return undefined;
  }
  const screen = project(scene, point);
  return screen &&
    screen.x >= 0 &&
    screen.y >= 0 &&
    screen.x < scene.canvas.clientWidth &&
    screen.y < scene.canvas.clientHeight
    ? screen
    : undefined;
}

// Walk only the connected, camera-visible section on either side of the anchor.
// Clipping at near/far avoids projecting vertices behind the perspective camera.
function screenPath(scene, candidate) {
  const points = candidate.line.points,
    anchor = candidate.position;
  const index = Line.sample(candidate.line, candidate.station).index;
  function walk(step) {
    const result = [{ x: 0, y: 0 }];
    let previous = anchor;
    for (
      let i = step > 0 ? index + 1 : index;
      i >= 0 && i < points.length;
      i += step
    ) {
      let point = scene.terrain
        ? terrainPoint(scene, points[i].x, points[i].y)
        : points[i];
      const a = depth(scene, previous),
        b = depth(scene, point);
      const { near, far } = scene.camera.frustum;
      const clipped = b < near || b > far;
      if (clipped) {
        const t = ((b < near ? near : far) - a) / (b - a);
        point = {
          x: previous.x + (point.x - previous.x) * t,
          y: previous.y + (point.y - previous.y) * t,
          z: previous.z + ((point.z ?? 0) - previous.z) * t,
        };
      }
      // The boundary is known to be inside; avoid a second rounded depth test.
      const screen = windowPoint(scene, point);
      result.push({
        x: screen.x - candidate.screen.x,
        y: screen.y - candidate.screen.y,
      });
      if (clipped) {
        break;
      }
      previous = point;
    }
    return result;
  }
  const before = walk(-1).reverse(),
    after = walk(1);
  return {
    line: Line.path([...before, ...after.slice(1)]),
    station: Line.path(before).length,
  };
}

function bounds(points) {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point[0]);
    top = Math.min(top, point[1]);
    right = Math.max(right, point[0]);
    bottom = Math.max(bottom, point[1]);
  }
  return [left, top, right, bottom];
}

function alignment(scene, candidate, text, metersPerPixel) {
  const layout = candidate.evaluated.layout,
    prefix = text ? "text" : "icon";
  const placement = layout["symbol-placement"];
  let alignment = layout[`${prefix}-rotation-alignment`];
  if (alignment === "auto") {
    alignment = placement === "point" ? "viewport" : "map";
  }
  const pitch = layout[`${prefix}-pitch-alignment`];
  const mapPitch = (pitch === "auto" ? alignment : pitch) === "map";
  const along = candidate.line && placement !== "point" && alignment === "map";
  const rotation = (layout[`${prefix}-rotate`] * Math.PI) / 180;
  let plane,
    angle = rotation;
  if (along) {
    if (mapPitch) {
      // World path metrics are already available from tile preparation.
      const tangent = Line.sample(candidate.line, candidate.station);
      if (!tangent) {
        return undefined;
      }
      angle -= tangent.angle;
    } else {
      plane = screenPath(scene, candidate);
      const tangent = Line.sample(plane.line, plane.station);
      if (!tangent) {
        return undefined;
      }
      angle += tangent.angle;
    }
  } else if (mapPitch && alignment === "viewport") {
    const right = scene.camera.rightWC;
    if (scene.terrain?.ellipsoid) {
      const ll = GlobeCoordinates.cartographic(
        candidate.anchor.position.x,
        candidate.anchor.position.y,
      );
      const sin = Math.sin(ll.longitude),
        cos = Math.cos(ll.longitude);
      const east = -right.x * sin + right.y * cos;
      const north =
        -(right.x * cos + right.y * sin) * Math.sin(ll.latitude) +
        right.z * Math.cos(ll.latitude);
      angle += Math.atan2(-north, east);
    } else {
      angle += Math.atan2(-right.y, right.x);
    }
  } else if (!mapPitch && alignment === "map") {
    const next = project(
      scene,
      terrainPoint(
        scene,
        candidate.anchor.position.x + metersPerPixel,
        candidate.anchor.position.y,
      ),
    );
    if (!next) {
      return undefined;
    }
    angle += Math.atan2(
      next.y - candidate.screen.y,
      next.x - candidate.screen.x,
    );
  }
  let screenDirectionX = Math.cos(angle);
  if (mapPitch) {
    const next = project(
      scene,
      terrainPoint(
        scene,
        candidate.anchor.position.x + Math.cos(angle) * metersPerPixel,
        candidate.anchor.position.y - Math.sin(angle) * metersPerPixel,
      ),
    );
    if (!next) {
      return undefined;
    }
    screenDirectionX = next.x - candidate.screen.x;
  }
  const flip =
    along && layout[`${prefix}-keep-upright`] && screenDirectionX < 0;
  const maxAngle = text ? (layout["text-max-angle"] * Math.PI) / 180 : Infinity;
  return { mapPitch, along, rotation, plane, angle, flip, maxAngle };
}

function geometry(scene, candidate, shaped, text, metersPerPixel) {
  if (!shaped.quads.length) {
    return { quads: [] };
  }
  const settings = alignment(scene, candidate, text, metersPerPixel);
  if (!settings) {
    return undefined;
  }
  let { plane } = settings;
  const { mapPitch, along, rotation, angle, flip, maxAngle } = settings;
  if (mapPitch) {
    metersPerPixel = mapMetersPerPixel(scene, candidate, metersPerPixel);
  }
  let cached = shaped._projectionGeometry;
  const reusable = mapPitch || !along;
  if (
    !reusable ||
    !cached ||
    cached.anchor !== candidate.anchor ||
    cached.terrain !== scene.terrain ||
    (mapPitch && cached.metersPerPixel !== metersPerPixel) ||
    cached.angle !== angle ||
    cached.flip !== flip ||
    cached.mapPitch !== mapPitch ||
    cached.along !== !!along ||
    cached.rotation !== rotation ||
    cached.maxAngle !== maxAngle
  ) {
    if (along && mapPitch) {
      plane = {
        line: Line.path(
          candidate.line.points.map((point) => ({
            x: (point.x - candidate.anchor.position.x) / metersPerPixel,
            y: (candidate.anchor.position.y - point.y) / metersPerPixel,
          })),
        ),
        station: candidate.station / metersPerPixel,
      };
    }
    const quads = along
      ? Line.bend(shaped, plane.line, plane.station, flip, rotation, maxAngle)
      : shaped.quads.map((quad) => ({
          page: quad.page,
          rect: quad.rect,
          scale: quad.scale,
          corners: Line.corners(quad.box, 0, 0, angle),
        }));
    if (!quads) {
      return undefined;
    }
    if (mapPitch) {
      for (const quad of quads) {
        quad.positions = quad.corners.map(([x, y]) =>
          terrainPoint(
            scene,
            candidate.anchor.position.x + x * metersPerPixel,
            candidate.anchor.position.y - y * metersPerPixel,
          ),
        );
        quad.encodedPositions = quad.positions.map((point) =>
          EncodedCartesian3.fromCartesian(point),
        );
      }
    }
    cached = {
      terrain: scene.terrain,
      anchor: candidate.anchor,
      metersPerPixel,
      angle,
      flip,
      mapPitch,
      along: !!along,
      rotation,
      maxAngle,
      quads,
    };
    if (reusable) {
      shaped._projectionGeometry = cached;
    }
  }
  return cached;
}

function shape(scene, candidate, shaped, text, metersPerPixel) {
  const cached = geometry(scene, candidate, shaped, text, metersPerPixel);
  if (!cached) {
    return undefined;
  }
  if (!cached.quads.length) {
    return { quads: [], boxes: [] };
  }
  const { mapPitch, along } = cached;
  const reusable = mapPitch || !along;
  if (!mapPitch && cached.projected) {
    return cached.projected;
  }
  const boxes = [],
    quads = [];
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const quad of cached.quads) {
    let projectedQuad = quad;
    if (mapPitch) {
      const corners = [];
      for (const point of quad.positions) {
        const screen = project(scene, point);
        if (!screen) {
          return undefined;
        }
        corners.push([
          screen.x - candidate.screen.x,
          screen.y - candidate.screen.y,
        ]);
      }
      projectedQuad = {
        page: quad.page,
        rect: quad.rect,
        scale: quad.scale,
        positions: quad.positions,
        encodedPositions: quad.encodedPositions,
        corners,
      };
    }
    quads.push(projectedQuad);
    const box = bounds(projectedQuad.corners);
    if (along) {
      boxes.push(box);
    } else {
      left = Math.min(left, box[0]);
      top = Math.min(top, box[1]);
      right = Math.max(right, box[2]);
      bottom = Math.max(bottom, box[3]);
    }
  }
  if (!along) {
    boxes.push([left, top, right, bottom]);
  }
  const projected = { quads, boxes };
  if (!mapPitch && reusable) {
    cached.projected = projected;
  }
  return projected;
}

function collision(scene, candidate, shaped, text, metersPerPixel) {
  if (!shaped.quads.length) {
    return { boxes: [] };
  }
  const settings = alignment(scene, candidate, text, metersPerPixel);
  if (!settings) {
    return undefined;
  }
  const { mapPitch, along, angle, flip } = settings;
  if (mapPitch) {
    metersPerPixel = mapMetersPerPixel(scene, candidate, metersPerPixel);
  }
  let plane = settings.plane;
  let proxies;
  if (!along) {
    proxies = [Line.corners(shaped.box, 0, 0, angle)];
  } else {
    if (mapPitch) {
      plane = {
        line: Line.path(
          candidate.line.points.map((point) => ({
            x: (point.x - candidate.anchor.position.x) / metersPerPixel,
            y: (candidate.anchor.position.y - point.y) / metersPerPixel,
          })),
        ),
        station: candidate.station / metersPerPixel,
      };
    }
    let metrics = shaped._collisionMetrics;
    if (!metrics) {
      let radius = 0,
        first = Infinity,
        last = -Infinity;
      for (const quad of shaped.quads) {
        const center = quad.center ?? 0;
        radius = Math.max(
          radius,
          Math.hypot(
            Math.max(
              Math.abs(quad.box[0] - center),
              Math.abs(quad.box[2] - center),
            ),
            Math.max(Math.abs(quad.box[1]), Math.abs(quad.box[3])),
          ),
        );
        first = Math.min(first, center);
        last = Math.max(last, center);
      }
      metrics = shaped._collisionMetrics = { radius, first, last };
    }
    const direction = flip ? -1 : 1;
    const span = shaped.span ?? [shaped.box[0], shaped.box[2]];
    if (
      !Line.sample(plane.line, plane.station + direction * span[0]) ||
      !Line.sample(plane.line, plane.station + direction * span[1])
    ) {
      return undefined;
    }
    const a = plane.station + direction * metrics.first;
    const b = plane.station + direction * metrics.last;
    const first = Line.sample(plane.line, Math.min(a, b));
    const last = Line.sample(plane.line, Math.max(a, b));
    const points = [first];
    for (let i = first.index + 1; i <= last.index; i++) {
      points.push(plane.line.points[i]);
    }
    points.push(last);
    proxies = [];
    // The swept circumradius contains glyphs at every bisector orientation.
    // A straight run needs one envelope instead of four projections per glyph.
    const radius = metrics.radius;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1],
        q = points[i];
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      const angle = Math.atan2(q.y - p.y, q.x - p.x);
      proxies.push(
        Line.corners(
          [-radius, -radius, length + radius, radius],
          p.x,
          p.y,
          angle,
        ),
      );
    }
  }
  const boxes = [];
  for (const corners of proxies) {
    if (mapPitch) {
      const projected = [];
      for (const [x, y] of corners) {
        const screen = project(
          scene,
          terrainPoint(
            scene,
            candidate.anchor.position.x + x * metersPerPixel,
            candidate.anchor.position.y - y * metersPerPixel,
          ),
        );
        if (!screen) {
          return undefined;
        }
        projected.push([
          screen.x - candidate.screen.x,
          screen.y - candidate.screen.y,
        ]);
      }
      boxes.push(bounds(projected));
    } else {
      boxes.push(bounds(corners));
    }
  }
  return { boxes };
}

const anchorClip = new Cartesian4();
const axisClip = new Cartesian4();
const pixelAxisX = new Cartesian2();
const pixelAxisY = new Cartesian2();

function screenDerivative(scene, candidate, x, y, result) {
  const axis = terrainPoint(scene, x, y);
  Cartesian3.subtract(axis, candidate.position, axis);
  const camera = scene.camera;
  axisClip.x = Cartesian3.dot(axis, camera.rightWC);
  axisClip.y = Cartesian3.dot(axis, camera.upWC);
  axisClip.z = -Cartesian3.dot(axis, camera.directionWC);
  axisClip.w = 0;
  Matrix4.multiplyByVector(camera.frustum.projectionMatrix, axisClip, axisClip);
  // Differentiate the perspective divide at the anchor, including off-axis
  // stretch. A finite screen-space difference would distort very near labels.
  result.x =
    ((axisClip.x - (anchorClip.x / anchorClip.w) * axisClip.w) / anchorClip.w) *
    (scene.canvas.clientWidth * 0.5);
  result.y =
    ((axisClip.y - (anchorClip.y / anchorClip.w) * axisClip.w) / anchorClip.w) *
    (scene.canvas.clientHeight * 0.5);
}

function mapMetersPerPixel(scene, candidate, metersPerPixel) {
  if (scene.camera.frustum.projectionMatrix[15] !== 0) {
    return metersPerPixel;
  }
  const camera = scene.camera;
  const position = Cartesian3.subtract(
    candidate.position,
    camera.positionWC,
    new Cartesian3(),
  );
  anchorClip.x = Cartesian3.dot(position, camera.rightWC);
  anchorClip.y = Cartesian3.dot(position, camera.upWC);
  anchorClip.z = -Cartesian3.dot(position, camera.directionWC);
  anchorClip.w = 1;
  Matrix4.multiplyByVector(
    camera.frustum.projectionMatrix,
    anchorClip,
    anchorClip,
  );
  const anchor = candidate.anchor.position;
  // Sample the existing surface in map metres; this includes local Globe metric
  // and terrain slope without treating the style reference as a local pixel.
  screenDerivative(scene, candidate, anchor.x + 1, anchor.y, pixelAxisX);
  screenDerivative(scene, candidate, anchor.x, anchor.y + 1, pixelAxisY);
  const xx = Cartesian2.magnitudeSquared(pixelAxisX);
  const yy = Cartesian2.magnitudeSquared(pixelAxisY);
  const xy = Cartesian2.dot(pixelAxisX, pixelAxisY);
  const stretch = Math.sqrt(0.5 * (xx + yy + Math.hypot(xx - yy, 2 * xy)));
  // The largest singular value bounds local stretch in every map direction.
  // A single scale preserves foreshortening; distant labels keep their ground
  // size and shrink naturally. Bending and collision use this same scale.
  return Math.min(metersPerPixel, 1 / stretch);
}

/** Separates current glyph drawing from placement collision envelopes. @private */
const SceneGISVectorSymbolProjection = {
  visible,
  shape,
  geometry,
  collision,
  snapshot,
  attach,
  intersectsBounds,
};
export default SceneGISVectorSymbolProjection;
