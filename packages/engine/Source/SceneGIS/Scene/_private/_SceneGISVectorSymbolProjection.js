import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import EncodedCartesian3 from "../../../Core/EncodedCartesian3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Line from "../../Core/_private/_SceneGISVectorSymbolLine.js";

function snapshot(scene, terrain) {
  const camera = scene.camera,
    frustum = camera.frustum;
  const position = camera.positionWC,
    direction = camera.directionWC,
    projection = frustum.projectionMatrix;
  // Camera getters update their derived members. Read once for a placement pass,
  // instead of invoking that work for every anchor and glyph corner.
  return {
    terrain,
    camera: {
      positionWC: Cartesian3.clone(position),
      directionWC: Cartesian3.clone(direction),
      upWC: Cartesian3.clone(camera.upWC),
      rightWC: Cartesian3.clone(camera.rightWC),
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
        ? Math.min(frustum.far, (-position.z / direction.z) * 4)
        : frustum.far,
    canvas: {
      clientWidth: scene.canvas.clientWidth,
      clientHeight: scene.canvas.clientHeight,
    },
  };
}

function terrainPoint(scene, x, y) {
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
    angle += Math.atan2(-right.y, right.x);
  } else if (!mapPitch && alignment === "map") {
    const next = project(
      scene,
      terrainPoint(
        scene,
        candidate.position.x + metersPerPixel,
        candidate.position.y,
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
        candidate.position.x + Math.cos(angle) * metersPerPixel,
        candidate.position.y - Math.sin(angle) * metersPerPixel,
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
            x: (point.x - candidate.position.x) / metersPerPixel,
            y: (candidate.position.y - point.y) / metersPerPixel,
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
            candidate.position.x + x * metersPerPixel,
            candidate.position.y - y * metersPerPixel,
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
  let plane = settings.plane;
  let proxies;
  if (!along) {
    proxies = [Line.corners(shaped.box, 0, 0, angle)];
  } else {
    if (mapPitch) {
      plane = {
        line: Line.path(
          candidate.line.points.map((point) => ({
            x: (point.x - candidate.position.x) / metersPerPixel,
            y: (candidate.position.y - point.y) / metersPerPixel,
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
            candidate.position.x + x * metersPerPixel,
            candidate.position.y - y * metersPerPixel,
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

/** Separates current glyph drawing from placement collision envelopes. @private */
const SceneGISVectorSymbolProjection = {
  visible,
  shape,
  geometry,
  collision,
  snapshot,
  attach,
};
export default SceneGISVectorSymbolProjection;
