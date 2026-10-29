import Matrix4 from "../../../Core/Matrix4.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import ModelReader from "../../../Scene/Model/ModelReader.js";
import ModelUtility from "../../../Scene/Model/ModelUtility.js";
import VertexAttributeSemantic from "../../../Scene/VertexAttributeSemantic.js";

/** Explicit Model-content snapshot adapter. The visitor only receives static triangles. @private */
function _SceneGISReadModelTriangles(model, visitor) {
  const components = model.sceneGraph?.components;
  if (!model.ready || !components) {
    throw new RuntimeError(
      "The selected Model is not ready for a geometry snapshot.",
    );
  }
  if (
    model.customShader ||
    components.skins.length > 0 ||
    components.animations.length > 0
  ) {
    throw new RuntimeError(
      "Voxelization requires static geometry without custom shaders, skins or animations.",
    );
  }
  ModelReader.forEachPrimitive(
    model,
    undefined,
    (_runtime, primitive, instances) => {
      if (
        primitive.primitiveType !== PrimitiveType.TRIANGLES ||
        primitive.morphTargets.length > 0
      ) {
        throw new RuntimeError(
          "Voxelization supports static TRIANGLES only; point clouds, other primitive modes and morph targets are unsupported.",
        );
      }
      const attribute = ModelUtility.getAttributeBySemantic(
        primitive,
        VertexAttributeSemantic.POSITION,
      );
      if (!attribute) {
        throw new RuntimeError(
          "A selected primitive has no POSITION attribute.",
        );
      }
      const indexCount = primitive.indices?.count ?? attribute.count;
      visitor.reserve(
        attribute.count * 3 * 8,
        primitive.indices ? indexCount * 4 : 0,
        indexCount / 3,
        instances.length,
      );
      const sourcePositions = ModelReader.readAttributeAsTypedArray(attribute);
      const positions =
        sourcePositions instanceof Float32Array ||
        sourcePositions instanceof Float64Array
          ? sourcePositions
          : new Float64Array(sourcePositions);
      const indices = primitive.indices
        ? ModelReader.readIndicesAsTypedArray(primitive.indices)
        : undefined;
      for (const instance of instances) {
        visitor.mesh({
          positions,
          indices,
          modelMatrix: Matrix4.clone(instance.transform),
        });
      }
    },
  );
}

export default _SceneGISReadModelTriangles;
