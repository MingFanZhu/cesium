import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import Matrix4 from "../../../Core/Matrix4.js";
import OrthographicOffCenterFrustum from "../../../Core/OrthographicOffCenterFrustum.js";
import SceneGISPlanarCamera from "./_SceneGISPlanarCamera.js";

const inverseProjection = new Matrix4();
const projected = new Cartesian4();
const nearCorners = Array.from({ length: 4 }, () => new Cartesian3());
const farCorners = Array.from({ length: 4 }, () => new Cartesian3());
const corners = Array.from({ length: 8 }, () => new Cartesian3());
const centerEC = new Cartesian3();
const centerWC = new Cartesian3();
const right = new Cartesian3();
const up = new Cartesian3();
const direction = new Cartesian3();
const splits = new Array(5);
const minimum = new Cartesian3();
const maximum = new Cartesian3();
const translation = new Cartesian3();
const components = ["x", "y", "z", "w"];

function isActive(frameState) {
  const camera = frameState.camera;
  return (
    SceneGISPlanarCamera.isPlanarCamera(camera) &&
    !camera._scene.world.isDestroyed()
  );
}

function isSurface(shaderSource) {
  return shaderSource.defines.includes("SCENEGIS_PLANAR_SURFACE");
}

function setCamera(camera, x, y, z, halfWidth, halfHeight, depth) {
  const position = camera.positionWC;
  position.x = right.x * x + up.x * y + direction.x * z;
  position.y = right.y * x + up.y * y + direction.y * z;
  position.z = right.z * x + up.z * y + direction.z * z;
  Cartesian3.clone(direction, camera.directionWC);
  Cartesian3.clone(up, camera.upWC);
  Cartesian3.clone(right, camera.rightWC);
  // Shadow cameras retain Cesium's internal cartographic substrate only.
  camera.positionCartographic.height = position.z;
  Matrix4.computeView(position, direction, up, right, camera.viewMatrix);
  Matrix4.inverseTransformation(camera.viewMatrix, camera.inverseViewMatrix);
  const frustum = (camera.frustum ??= new OrthographicOffCenterFrustum());
  frustum.left = -halfWidth;
  frustum.right = halfWidth;
  frustum.bottom = -halfHeight;
  frustum.top = halfHeight;
  frustum.near = 0.01;
  frustum.far = depth;
}

function updateCascades(shadowMap, frameState) {
  if (!shadowMap._sceneGISPlanar) {
    return false;
  }
  const camera = shadowMap._sceneCamera;
  const near = camera.frustum.near;
  const far = camera.frustum.far;
  const count = shadowMap._numberOfCascades;
  const cascadeBias = (shadowMap._sceneGISPlanarCascadeBias ??=
    new Cartesian4());
  Cartesian3.normalize(shadowMap._shadowMapCamera.directionWC, direction);
  const axis =
    Math.abs(direction.z) < 0.9 ? Cartesian3.UNIT_Z : Cartesian3.UNIT_Y;
  Cartesian3.normalize(Cartesian3.cross(direction, axis, right), right);
  Cartesian3.cross(right, direction, up);

  // Work in eye space until the final CPU double-precision translation. This
  // also supports off-center perspective and orthographic camera frusta.
  Matrix4.inverse(camera.frustum.projectionMatrix, inverseProjection);
  for (let i = 0; i < 4; ++i) {
    for (let j = 0; j < 2; ++j) {
      Cartesian4.fromElements(
        i & 1 ? 1 : -1,
        i & 2 ? 1 : -1,
        j ? 1 : -1,
        1,
        projected,
      );
      Matrix4.multiplyByVector(inverseProjection, projected, projected);
      Cartesian3.fromElements(
        projected.x / projected.w,
        projected.y / projected.w,
        projected.z / projected.w,
        j ? farCorners[i] : nearCorners[i],
      );
    }
  }
  splits[0] = near;
  for (let i = 1; i <= count; ++i) {
    const fraction = i / count;
    splits[i] =
      0.1 * (near + (far - near) * fraction) +
      0.9 * near * Math.pow(far / near, fraction);
  }
  splits[count] = far;
  minimum.x = minimum.y = minimum.z = Number.POSITIVE_INFINITY;
  maximum.x = maximum.y = maximum.z = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; ++i) {
    // The next cascade covers the preceding cascade's final ten percent.
    const start =
      i === 0 ? near : splits[i] - 0.1 * (splits[i] - splits[i - 1]);
    const end = splits[i + 1];
    Cartesian3.clone(Cartesian3.ZERO, centerEC);
    for (let j = 0; j < 8; ++j) {
      const depth = j < 4 ? start : end;
      Cartesian3.lerp(
        nearCorners[j % 4],
        farCorners[j % 4],
        (depth - near) / (far - near),
        corners[j],
      );
      Cartesian3.add(centerEC, corners[j], centerEC);
    }
    Cartesian3.multiplyByScalar(centerEC, 1 / 8, centerEC);
    let radius = 0;
    for (let j = 0; j < 8; ++j) {
      radius = Math.max(radius, Cartesian3.distance(centerEC, corners[j]));
    }
    Matrix4.multiplyByPoint(camera.inverseViewMatrix, centerEC, centerWC);
    const pass = shadowMap._passes[i];
    const resolution = pass.passState.viewport.width;
    radius *= 1 + 4 / resolution;
    const texel = (2 * radius) / resolution;
    const x = Math.round(Cartesian3.dot(centerWC, right) / texel) * texel;
    const y = Math.round(Cartesian3.dot(centerWC, up) / texel) * texel;
    const z =
      Cartesian3.dot(centerWC, direction) - radius - shadowMap.maximumDistance;
    const depth = 2 * radius + shadowMap.maximumDistance;
    cascadeBias[components[i]] = texel / depth;
    setCamera(pass.camera, x, y, z, radius, radius, depth);
    pass.cullingVolume = pass.camera.frustum.computeCullingVolume(
      pass.camera.positionWC,
      direction,
      up,
    );
    const matrix = shadowMap._cascadeMatrices[i];
    Matrix4.multiply(
      pass.camera.getViewProjection(),
      camera.inverseViewMatrix,
      matrix,
    );
    Matrix4.multiply(pass.textureOffsets, matrix, matrix);
    minimum.x = Math.min(minimum.x, x - radius);
    minimum.y = Math.min(minimum.y, y - radius);
    minimum.z = Math.min(minimum.z, z);
    maximum.x = Math.max(maximum.x, x + radius);
    maximum.y = Math.max(maximum.y, y + radius);
    maximum.z = Math.max(maximum.z, z + depth);
  }
  if (count === 1) {
    shadowMap._shadowMapCamera.clone(shadowMap._passes[0].camera);
  } else {
    Cartesian3.midpoint(minimum, maximum, translation);
    setCamera(
      shadowMap._shadowMapCamera,
      translation.x,
      translation.y,
      minimum.z,
      (maximum.x - minimum.x) / 2,
      (maximum.y - minimum.y) / 2,
      maximum.z - minimum.z,
    );
    Cartesian4.unpack(splits, 0, shadowMap._cascadeSplits[0]);
    Cartesian4.unpack(splits, 1, shadowMap._cascadeSplits[1]);
    Cartesian4.fromElements(
      splits[1] - splits[0],
      splits[2] - splits[1],
      splits[3] - splits[2],
      splits[4] - splits[3],
      shadowMap._cascadeDistances,
    );
  }
  return true;
}

/** @private */
const SceneGISPlanarShadows = { isActive, isSurface, updateCascades };
export default SceneGISPlanarShadows;
