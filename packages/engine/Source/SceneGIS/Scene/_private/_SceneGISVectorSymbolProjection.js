import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Line from "../../Core/_private/_SceneGISVectorSymbolLine.js";

function snapshot(scene) {
  const camera = scene.camera,
    frustum = camera.frustum;
  const position = camera.positionWC,
    direction = camera.directionWC,
    projection = frustum.projectionMatrix;
  // Camera getters update their derived members. Read once for a placement pass,
  // instead of invoking that work for every anchor and glyph corner.
  return {
    camera: {
      positionWC: position,
      directionWC: direction,
      upWC: camera.upWC,
      rightWC: camera.rightWC,
      frustum: {
        near: frustum.near,
        far: frustum.far,
        projectionMatrix: projection,
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
      let point = points[i];
      const a = depth(scene, previous),
        b = depth(scene, point);
      const { near, far } = scene.camera.frustum;
      const clipped = b < near || b > far;
      if (clipped) {
        const t = ((b < near ? near : far) - a) / (b - a);
        point = {
          x: previous.x + (point.x - previous.x) * t,
          y: previous.y + (point.y - previous.y) * t,
          z: 0,
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
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
}

function shape(scene, candidate, shaped, text, metersPerPixel) {
  if (!shaped.quads.length) {
    return { quads: [], boxes: [] };
  }
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
    plane = mapPitch
      ? {
          line: Line.path(
            candidate.line.points.map((point) => ({
              x: (point.x - candidate.position.x) / metersPerPixel,
              y: (candidate.position.y - point.y) / metersPerPixel,
            })),
          ),
          station: candidate.station / metersPerPixel,
        }
      : screenPath(scene, candidate);
    const tangent = Line.sample(plane.line, plane.station);
    if (!tangent) {
      return undefined;
    }
    angle += tangent.angle;
  } else if (mapPitch && alignment === "viewport") {
    const right = scene.camera.rightWC;
    angle += Math.atan2(-right.y, right.x);
  } else if (!mapPitch && alignment === "map") {
    const next = project(
      scene,
      new Cartesian3(
        candidate.position.x + metersPerPixel,
        candidate.position.y,
        0,
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
      new Cartesian3(
        candidate.position.x + Math.cos(angle) * metersPerPixel,
        candidate.position.y - Math.sin(angle) * metersPerPixel,
        0,
      ),
    );
    if (!next) {
      return undefined;
    }
    screenDirectionX = next.x - candidate.screen.x;
  }
  const flip =
    along && layout[`${prefix}-keep-upright`] && screenDirectionX < 0;
  const quads = along
    ? Line.bend(
        shaped,
        plane.line,
        plane.station,
        flip,
        rotation,
        text ? (layout["text-max-angle"] * Math.PI) / 180 : Infinity,
      )
    : shaped.quads.map((quad) => ({
        ...quad,
        corners: Line.corners(quad.box, 0, 0, angle),
      }));
  if (!quads) {
    return undefined;
  }
  const boxes = [];
  for (const quad of quads) {
    if (mapPitch) {
      quad.positions = quad.corners.map(
        ([x, y]) =>
          new Cartesian3(
            candidate.position.x + x * metersPerPixel,
            candidate.position.y - y * metersPerPixel,
            0,
          ),
      );
      const projected = quad.positions.map((point) => project(scene, point));
      if (projected.some((point) => !point)) {
        return undefined;
      }
      quad.corners = projected.map((point) => [
        point.x - candidate.screen.x,
        point.y - candidate.screen.y,
      ]);
    }
    boxes.push(bounds(quad.corners));
  }
  // Point labels retain one collision box; curved labels use the actual glyph corridor.
  return {
    quads,
    boxes: along
      ? boxes
      : [
          bounds(
            boxes.flatMap((box) => [
              [box[0], box[1]],
              [box[2], box[3]],
            ]),
          ),
        ],
  };
}

/** Projects the same glyph vertices used by rendering and collision. @private */
const SceneGISVectorSymbolProjection = { visible, shape, snapshot };
export default SceneGISVectorSymbolProjection;
