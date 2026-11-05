import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Quaternion from "../../../Core/Quaternion.js";
import SceneMode from "../../../Scene/SceneMode.js";
import ModelUtility from "../../../Scene/Model/ModelUtility.js";

const translation = new Cartesian3();
const rotation = new Quaternion();
const scale = new Cartesian3();
const matrix = new Matrix4();
const corner = new Cartesian3();
const minimum = new Cartesian3();
const maximum = new Cartesian3();
const low = new Float64Array(3);
const high = new Float64Array(3);

function getSummary(resources) {
  return resources.runtimeNode?.node?.instances?._sceneGISInstanceBounds;
}

function setCorner(min, max, index, result) {
  return Cartesian3.fromElements(
    index & 1 ? max.x : min.x,
    index & 2 ? max.y : min.y,
    index & 4 ? max.z : min.z,
    result,
  );
}

// Bounds after instance * axis * node, before the outer tile / RTC transform.
function computePositions(resources, min, max) {
  const summary = getSummary(resources);
  const position = ModelUtility.getAttributeBySemantic(
    resources.runtimePrimitive.primitive,
    "POSITION",
  );
  const graph = resources.model.sceneGraph;
  Matrix4.multiplyTransformation(
    graph.axisCorrectionMatrix,
    resources.runtimeNode.computedTransform,
    matrix,
  );
  Cartesian3.fromElements(Infinity, Infinity, Infinity, min);
  Cartesian3.fromElements(-Infinity, -Infinity, -Infinity, max);
  for (let i = 0; i < 8; i++) {
    setCorner(position.min, position.max, i, corner);
    Matrix4.multiplyByPoint(matrix, corner, corner);
    for (let row = 0; row < 3; row++) {
      low[row] = summary[9 + row];
      high[row] = summary[21 + row];
      for (let column = 0; column < 3; column++) {
        const value =
          column === 0 ? corner.x : column === 1 ? corner.y : corner.z;
        const a = summary[column * 3 + row] * value;
        const b = summary[12 + column * 3 + row] * value;
        low[row] += Math.min(a, b);
        high[row] += Math.max(a, b);
      }
    }
    min.x = Math.min(min.x, low[0]);
    min.y = Math.min(min.y, low[1]);
    min.z = Math.min(min.z, low[2]);
    max.x = Math.max(max.x, high[0]);
    max.y = Math.max(max.y, high[1]);
    max.z = Math.max(max.z, high[2]);
  }
}

/**
 * CPU-only bounds for the native legacy i3dm transform order.
 * @private
 */
const LegacyInstanceBounds = {
  create(translations, rotations, scales) {
    const summary = new Float64Array(24);
    summary.fill(Infinity, 0, 12);
    summary.fill(-Infinity, 12);
    const count = translations.length / 3;
    for (let i = 0; i < count; i++) {
      Cartesian3.unpack(translations, i * 3, translation);
      if (rotations) {
        Quaternion.unpack(rotations, i * 4, rotation);
      } else {
        Quaternion.clone(Quaternion.IDENTITY, rotation);
      }
      if (scales) {
        Cartesian3.unpack(scales, i * 3, scale);
      } else {
        Cartesian3.clone(Cartesian3.ONE, scale);
      }
      Matrix4.fromTranslationQuaternionRotationScale(
        translation,
        rotation,
        scale,
        matrix,
      );
      for (let column = 0; column < 4; column++) {
        for (let row = 0; row < 3; row++) {
          const index = column * 3 + row;
          // Matrix attributes are uploaded as Float32; vec3 attributes already are Float32.
          const value = Math.fround(matrix[column * 4 + row]);
          summary[index] = Math.min(summary[index], value);
          summary[index + 12] = Math.max(summary[index + 12], value);
        }
      }
    }
    return summary;
  },

  update(resources, result, frameState) {
    if (!getSummary(resources)) {
      return;
    }
    if (frameState) {
      resources._sceneGISBoundsFrameState = frameState;
    }
    if (resources._sceneGISBoundsFrameState.mode !== SceneMode.SCENE3D) {
      return;
    }
    computePositions(resources, minimum, maximum);
    BoundingSphere.fromCornerPoints(minimum, maximum, result);
    const model = resources.model;
    Matrix4.multiplyTransformation(
      model.modelMatrix,
      model.sceneGraph.components.transform,
      matrix,
    );
    BoundingSphere.transform(result, matrix, result);
  },

  modelPositions(resources, min, max) {
    if (!getSummary(resources)) {
      return;
    }
    computePositions(resources, minimum, maximum);
    // ModelSceneGraph applies axis correction after aggregating primitive positions.
    // Undo only this orthonormal axis rotation, never the possibly singular node transform.
    Matrix4.inverseTransformation(
      resources.model.sceneGraph.axisCorrectionMatrix,
      matrix,
    );
    Cartesian3.fromElements(Infinity, Infinity, Infinity, min);
    Cartesian3.fromElements(-Infinity, -Infinity, -Infinity, max);
    for (let i = 0; i < 8; i++) {
      setCorner(minimum, maximum, i, corner);
      Matrix4.multiplyByPoint(matrix, corner, corner);
      Cartesian3.minimumByComponent(min, corner, min);
      Cartesian3.maximumByComponent(max, corner, max);
    }
  },
};

export default LegacyInstanceBounds;
