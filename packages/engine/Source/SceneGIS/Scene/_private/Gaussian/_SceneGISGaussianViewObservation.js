/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import Cartesian3 from "../../../../Core/Cartesian3.js";
import Cartesian4 from "../../../../Core/Cartesian4.js";
import defined from "../../../../Core/defined.js";
import DeveloperError from "../../../../Core/DeveloperError.js";
import Matrix3 from "../../../../Core/Matrix3.js";
import Matrix4 from "../../../../Core/Matrix4.js";
import Quaternion from "../../../../Core/Quaternion.js";

const POSITION_EPSILON = 1.0e-7;
const DIRECTION_DOT_EPSILON = 1.0 - 1.0e-12;
const FRUSTUM_PLANE_EPSILON = 1.0e-12;
const scratchInverse = new Matrix4();
const scratchTranspose = new Matrix4();
const scratchPlane = new Cartesian4();
const scratchViewModel = new Matrix4();
const scratchSceneToClip = new Matrix4();
const scratchRenderInverse = new Matrix4();
const scratchRenderToWorld = new Matrix4();
const scratchRenderToView = new Matrix4();
const scratchRenderRotation = new Matrix3();

export function updateGaussianSourceRenderTransform(
  frameState,
  effectiveModelMatrix,
  viewOriginLocal,
  sourceRenderToViewPosition,
  sourceRenderToViewQuaternion,
) {
  Matrix4.inverseTransformation(effectiveModelMatrix, scratchRenderInverse);
  Matrix4.multiplyByPoint(
    scratchRenderInverse,
    frameState.camera.positionWC,
    viewOriginLocal,
  );
  Matrix4.multiplyByTranslation(
    effectiveModelMatrix,
    viewOriginLocal,
    scratchRenderToWorld,
  );
  Matrix4.multiplyTransformation(
    frameState.camera.viewMatrix,
    scratchRenderToWorld,
    scratchRenderToView,
  );
  Matrix4.getTranslation(scratchRenderToView, sourceRenderToViewPosition);
  Matrix4.getMatrix3(scratchRenderToView, scratchRenderRotation);
  Quaternion.fromRotationMatrix(
    scratchRenderRotation,
    sourceRenderToViewQuaternion,
  );
}

function normalizedDot(left, right) {
  const leftMagnitude = Cartesian3.magnitude(left);
  const rightMagnitude = Cartesian3.magnitude(right);
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return leftMagnitude === rightMagnitude ? 1 : -1;
  }
  return Cartesian3.dot(left, right) / (leftMagnitude * rightMagnitude);
}

function planeArray(plane) {
  const normal = plane.normal;
  const x = defined(normal) ? normal.x : plane.x;
  const y = defined(normal) ? normal.y : plane.y;
  const z = defined(normal) ? normal.z : plane.z;
  const w = defined(normal) ? plane.distance : plane.w;
  const magnitude = Math.hypot(x, y, z);
  if (!Number.isFinite(magnitude) || magnitude === 0 || !Number.isFinite(w)) {
    throw new DeveloperError("Macro culling plane is invalid");
  }
  return Object.freeze([
    x / magnitude,
    y / magnitude,
    z / magnitude,
    w / magnitude,
  ]);
}

function projectionKind(camera) {
  const name = camera.frustum?.constructor?.name ?? "unknown";
  return name.toLowerCase().includes("orthographic")
    ? "orthographic"
    : "perspective";
}

function isOrthographic(camera) {
  const name = camera.frustum?.constructor?.name ?? "unknown";
  const expected = "orthographic";
  for (let start = 0; start <= name.length - expected.length; start++) {
    let matches = true;
    for (let index = 0; index < expected.length; index++) {
      let code = name.charCodeAt(start + index);
      if (code >= 65 && code <= 90) {
        code += 32;
      }
      if (code !== expected.charCodeAt(index)) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }
  return false;
}

function normalizedComponentDot(leftX, leftY, leftZ, right) {
  const leftMagnitude = Math.hypot(leftX, leftY, leftZ);
  const rightMagnitude = Math.hypot(right[0], right[1], right[2]);
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return leftMagnitude === rightMagnitude ? 1 : -1;
  }
  return (
    (leftX * right[0] + leftY * right[1] + leftZ * right[2]) /
    (leftMagnitude * rightMagnitude)
  );
}

function updateProbePlaneComponent(target, component, value, initialized) {
  const previous = target[component];
  const scale = Math.max(1, Math.abs(previous), Math.abs(value));
  const tolerance =
    component === 3
      ? Math.max(POSITION_EPSILON, FRUSTUM_PLANE_EPSILON * scale)
      : FRUSTUM_PLANE_EPSILON * scale;
  target[component] = value;
  return initialized && Math.abs(previous - value) > tolerance;
}

export function createMutableGaussianMacroChunkViewProbe() {
  return {
    initialized: false,
    position: new Float64Array(3),
    direction: new Float64Array(3),
    up: new Float64Array(3),
    projectionMatrix: new Float64Array(16),
    frustumPlanesCameraRelative: [
      new Float64Array(4),
      new Float64Array(4),
      new Float64Array(4),
      new Float64Array(4),
      new Float64Array(4),
      new Float64Array(4),
    ],
    orthographic: false,
    context: undefined,
    drawingBufferWidth: 0,
    drawingBufferHeight: 0,
  };
}

export function updateMutableGaussianMacroChunkViewProbe(probe, frameState) {
  const camera = frameState.camera;
  const planes = frameState.cullingVolume?.planes;
  const projectionMatrix = camera?.frustum?.projectionMatrix;
  const context = frameState.context;
  if (
    !defined(camera) ||
    !Array.isArray(planes) ||
    planes.length !== 6 ||
    !defined(projectionMatrix) ||
    projectionMatrix.length !== 16 ||
    !defined(context)
  ) {
    throw new DeveloperError(
      "Macro view observation requires six culling planes",
    );
  }
  const drawingBufferWidth = context.drawingBufferWidth;
  const drawingBufferHeight = context.drawingBufferHeight;
  if (
    !Number.isSafeInteger(drawingBufferWidth) ||
    drawingBufferWidth <= 0 ||
    !Number.isSafeInteger(drawingBufferHeight) ||
    drawingBufferHeight <= 0
  ) {
    throw new DeveloperError("Macro projection observation is invalid");
  }

  const initialized = probe.initialized;
  const position = camera.positionWC;
  const direction = camera.directionWC;
  const up = camera.upWC;
  const orthographic = isOrthographic(camera);
  let changed =
    !initialized ||
    probe.context !== context ||
    probe.orthographic !== orthographic ||
    probe.drawingBufferWidth !== drawingBufferWidth ||
    probe.drawingBufferHeight !== drawingBufferHeight;
  if (
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z) ||
    !Number.isFinite(direction.x) ||
    !Number.isFinite(direction.y) ||
    !Number.isFinite(direction.z) ||
    !Number.isFinite(up.x) ||
    !Number.isFinite(up.y) ||
    !Number.isFinite(up.z)
  ) {
    throw new DeveloperError("Macro view observation is invalid");
  }
  if (
    initialized &&
    Math.hypot(
      position.x - probe.position[0],
      position.y - probe.position[1],
      position.z - probe.position[2],
    ) > POSITION_EPSILON
  ) {
    changed = true;
  }
  if (
    initialized &&
    (normalizedComponentDot(
      direction.x,
      direction.y,
      direction.z,
      probe.direction,
    ) < DIRECTION_DOT_EPSILON ||
      normalizedComponentDot(up.x, up.y, up.z, probe.up) <
        DIRECTION_DOT_EPSILON)
  ) {
    changed = true;
  }

  for (let index = 0; index < 16; index++) {
    const value = projectionMatrix[index];
    if (!Number.isFinite(value)) {
      throw new DeveloperError("Macro projection observation is invalid");
    }
    if (initialized && value !== probe.projectionMatrix[index]) {
      changed = true;
    }
    probe.projectionMatrix[index] = value;
  }

  for (let planeIndex = 0; planeIndex < 6; planeIndex++) {
    const source = planes[planeIndex];
    const normal = source.normal;
    const x = defined(normal) ? normal.x : source.x;
    const y = defined(normal) ? normal.y : source.y;
    const z = defined(normal) ? normal.z : source.z;
    const w = defined(normal) ? source.distance : source.w;
    const magnitude = Math.hypot(x, y, z);
    if (!Number.isFinite(magnitude) || magnitude === 0 || !Number.isFinite(w)) {
      throw new DeveloperError("Macro culling plane is invalid");
    }
    const target = probe.frustumPlanesCameraRelative[planeIndex];
    const normalizedX = x / magnitude;
    const normalizedY = y / magnitude;
    const normalizedZ = z / magnitude;
    const cameraRelativeW =
      w / magnitude +
      normalizedX * position.x +
      normalizedY * position.y +
      normalizedZ * position.z;
    changed =
      updateProbePlaneComponent(target, 0, normalizedX, initialized) || changed;
    changed =
      updateProbePlaneComponent(target, 1, normalizedY, initialized) || changed;
    changed =
      updateProbePlaneComponent(target, 2, normalizedZ, initialized) || changed;
    changed =
      updateProbePlaneComponent(target, 3, cameraRelativeW, initialized) ||
      changed;
  }

  probe.position[0] = position.x;
  probe.position[1] = position.y;
  probe.position[2] = position.z;
  probe.direction[0] = direction.x;
  probe.direction[1] = direction.y;
  probe.direction[2] = direction.z;
  probe.up[0] = up.x;
  probe.up[1] = up.y;
  probe.up[2] = up.z;
  probe.orthographic = orthographic;
  probe.context = context;
  probe.drawingBufferWidth = drawingBufferWidth;
  probe.drawingBufferHeight = drawingBufferHeight;
  probe.initialized = true;
  return changed;
}

function cameraRelativePlaneArray(worldPlane, cameraPosition) {
  return Object.freeze([
    worldPlane[0],
    worldPlane[1],
    worldPlane[2],
    worldPlane[3] +
      worldPlane[0] * cameraPosition[0] +
      worldPlane[1] * cameraPosition[1] +
      worldPlane[2] * cameraPosition[2],
  ]);
}

function frustumPlanesDiffer(previous, current) {
  if (
    previous.frustumPlanesCameraRelative.length !==
    current.frustumPlanesCameraRelative.length
  ) {
    return true;
  }
  return previous.frustumPlanesCameraRelative.some((plane, planeIndex) =>
    plane.some((value, component) => {
      const currentValue =
        current.frustumPlanesCameraRelative[planeIndex][component];
      const scale = Math.max(1, Math.abs(value), Math.abs(currentValue));
      const tolerance =
        component === 3
          ? Math.max(POSITION_EPSILON, FRUSTUM_PLANE_EPSILON * scale)
          : FRUSTUM_PLANE_EPSILON * scale;
      return Math.abs(value - currentValue) > tolerance;
    }),
  );
}

export function observeGaussianMacroChunkView(frameState, resolution) {
  const camera = frameState.camera;
  const planes = frameState.cullingVolume?.planes;
  if (!defined(camera) || !Array.isArray(planes) || planes.length !== 6) {
    throw new DeveloperError(
      "Macro view observation requires six culling planes",
    );
  }
  const position = Object.freeze([
    camera.positionWC.x,
    camera.positionWC.y,
    camera.positionWC.z,
  ]);
  const worldPlanes = Object.freeze(planes.map(planeArray));
  const viewMatrix = Object.freeze(Array.from(camera.viewMatrix));
  const projectionMatrix = Object.freeze(
    Array.from(camera.frustum.projectionMatrix),
  );
  const drawingBufferWidth =
    resolution ?? frameState.context.drawingBufferWidth;
  const drawingBufferHeight =
    resolution ?? frameState.context.drawingBufferHeight;
  if (
    !viewMatrix.every(Number.isFinite) ||
    !projectionMatrix.every(Number.isFinite) ||
    !Number.isSafeInteger(drawingBufferWidth) ||
    drawingBufferWidth <= 0 ||
    !Number.isSafeInteger(drawingBufferHeight) ||
    drawingBufferHeight <= 0
  ) {
    throw new DeveloperError("Macro projection observation is invalid");
  }
  return Object.freeze({
    position,
    direction: Object.freeze([
      camera.directionWC.x,
      camera.directionWC.y,
      camera.directionWC.z,
    ]),
    up: Object.freeze([camera.upWC.x, camera.upWC.y, camera.upWC.z]),
    frustumPlanesCameraRelative: Object.freeze(
      worldPlanes.map((plane) => cameraRelativePlaneArray(plane, position)),
    ),
    worldPlanes,
    projectionKind: projectionKind(camera),
    context: frameState.context,
    viewMatrix,
    projectionMatrix,
    drawingBufferWidth,
    drawingBufferHeight,
  });
}

export function gaussianMacroChunkViewChanged(previous, current) {
  if (!defined(previous)) {
    return true;
  }
  const previousViews = previous.additionalViews ?? [];
  const currentViews = current.additionalViews ?? [];
  if (
    previousViews.length !== currentViews.length ||
    currentViews.some((view, index) =>
      gaussianMacroChunkViewChanged(previousViews[index], view),
    )
  ) {
    return true;
  }
  const toCartesian = (value) =>
    Cartesian3.fromArray(value, 0, new Cartesian3());
  if (
    previous.context !== current.context ||
    previous.projectionKind !== current.projectionKind ||
    previous.drawingBufferWidth !== current.drawingBufferWidth ||
    previous.drawingBufferHeight !== current.drawingBufferHeight ||
    previous.projectionMatrix.some(
      (value, index) => value !== current.projectionMatrix[index],
    ) ||
    Cartesian3.distance(
      toCartesian(previous.position),
      toCartesian(current.position),
    ) > POSITION_EPSILON ||
    normalizedDot(
      toCartesian(previous.direction),
      toCartesian(current.direction),
    ) < DIRECTION_DOT_EPSILON ||
    normalizedDot(toCartesian(previous.up), toCartesian(current.up)) <
      DIRECTION_DOT_EPSILON
  ) {
    return true;
  }
  return frustumPlanesDiffer(previous, current);
}

export function createGaussianMacroChunkFrozenView(options) {
  const observation = options.observation;
  const effectiveModelMatrix = options.effectiveModelMatrix;
  Matrix4.inverseTransformation(effectiveModelMatrix, scratchInverse);
  const cameraPositionScene = Matrix4.multiplyByPoint(
    scratchInverse,
    Cartesian3.fromArray(observation.position, 0, new Cartesian3()),
    new Cartesian3(),
  );
  Matrix4.transpose(effectiveModelMatrix, scratchTranspose);
  const frustumPlanesScene = observation.worldPlanes.map((plane) => {
    Cartesian4.fromArray(plane, 0, scratchPlane);
    Matrix4.multiplyByVector(scratchTranspose, scratchPlane, scratchPlane);
    const magnitude = Math.hypot(
      scratchPlane.x,
      scratchPlane.y,
      scratchPlane.z,
    );
    if (!Number.isFinite(magnitude) || magnitude === 0) {
      throw new DeveloperError("Macro scene culling plane is invalid");
    }
    return Object.freeze([
      scratchPlane.x / magnitude,
      scratchPlane.y / magnitude,
      scratchPlane.z / magnitude,
      scratchPlane.w / magnitude,
    ]);
  });
  Matrix4.multiply(
    Matrix4.fromArray(observation.viewMatrix),
    effectiveModelMatrix,
    scratchViewModel,
  );
  Matrix4.multiply(
    Matrix4.fromArray(observation.projectionMatrix),
    scratchViewModel,
    scratchSceneToClip,
  );
  const sceneToClipMatrix = Object.freeze(Array.from(scratchSceneToClip));
  const identity = {
    selectionEpochGeneration: options.selectionEpochGeneration,
    modelTransformGeneration: options.modelTransformGeneration,
    cameraPositionScene: [
      cameraPositionScene.x,
      cameraPositionScene.y,
      cameraPositionScene.z,
    ],
    frustumPlanesScene,
    projectionKind: observation.projectionKind,
    sceneToClipMatrix,
    drawingBufferWidth: observation.drawingBufferWidth,
    drawingBufferHeight: observation.drawingBufferHeight,
  };
  const additionalViews = observation.additionalViews?.map((additional) =>
    createGaussianMacroChunkFrozenView({ ...options, observation: additional }),
  );
  if (additionalViews) {
    identity.additionalViews = additionalViews.map((view) => view.viewIdentity);
  }
  return Object.freeze({
    viewIdentity: JSON.stringify(identity),
    cameraPositionScene: Object.freeze([
      cameraPositionScene.x,
      cameraPositionScene.y,
      cameraPositionScene.z,
    ]),
    frustumPlanesScene: Object.freeze(frustumPlanesScene),
    sceneToClipMatrix,
    drawingBufferWidth: observation.drawingBufferWidth,
    drawingBufferHeight: observation.drawingBufferHeight,
    projectionKind: observation.projectionKind,
    ...(additionalViews && { additionalViews: Object.freeze(additionalViews) }),
  });
}

export const GaussianMacroChunkViewTolerances = Object.freeze({
  position: POSITION_EPSILON,
  directionDot: DIRECTION_DOT_EPSILON,
  frustumPlaneNormal: FRUSTUM_PLANE_EPSILON,
  frustumPlaneDistance: POSITION_EPSILON,
});

const _SceneGISGaussianViewObservation = Object.freeze({
  createMutableProbe: createMutableGaussianMacroChunkViewProbe,
  updateMutableProbe: updateMutableGaussianMacroChunkViewProbe,
  observe: observeGaussianMacroChunkView,
  changed: gaussianMacroChunkViewChanged,
  createFrozenView: createGaussianMacroChunkFrozenView,
  tolerances: GaussianMacroChunkViewTolerances,
});

export default _SceneGISGaussianViewObservation;
