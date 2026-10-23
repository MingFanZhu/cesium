import Cartesian4 from "../../../Core/Cartesian4.js";
import Intersect from "../../../Core/Intersect.js";
import Matrix4 from "../../../Core/Matrix4.js";
import ShaderDestination from "../../../Renderer/ShaderDestination.js";
import clippingFS from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarClippingFS.js";
import clippingVS from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarModelClippingVS.js";
import SceneGISPlanarWorld from "../SceneGISPlanarWorld.js";
import SceneGISPlanarClipping from "./_SceneGISPlanarClipping.js";

/**
 * Collection-owned Cartesian clipping for native Model and tileset consumers.
 * @private
 */
const SceneGISPlanarModelClipping = {
  update(collection, frameState) {
    const world = frameState.camera?._scene?.world;
    if (!(world instanceof SceneGISPlanarWorld)) {
      collection._sceneGISPlanarClipping?.destroy();
      collection._sceneGISPlanarClipping = undefined;
      return false;
    }
    collection._sceneGISPlanarClipping ??= new SceneGISPlanarClipping(
      world.coordinateSystem.extent,
    );
    return true;
  },

  queueCommands(collection, frameState) {
    // Tileset prePassesUpdate runs before Scene resets the previous pass flags.
    // Publish here, before tile traversal, once the actual render pass is known.
    if (frameState.passes.render) {
      collection._sceneGISPlanarClipping.update(
        frameState.context,
        undefined,
        collection,
      );
    }
  },

  intersection(collection) {
    // Keep native frustum culling. A partial polygon overlap cannot prove
    // that an arbitrary concave region contains the complete tile volume.
    return collection._sceneGISPlanarClipping.counts.y > 0
      ? Intersect.INTERSECTING
      : Intersect.OUTSIDE;
  },

  process(renderResources, model, frameState) {
    const clipping = model.clippingPolygons._sceneGISPlanarClipping;
    if (!clipping) {
      return false;
    }
    const builder = renderResources.shaderBuilder;
    builder.addDefine(
      "ENABLE_CLIPPING_POLYGONS",
      undefined,
      ShaderDestination.BOTH,
    );
    // The shared terrain source declares its fragment input and uniforms.
    builder.addVertexLines(clippingVS);
    builder.addFragmentLines(clippingFS);
    builder.addFragmentLines(
      "void modelClippingPolygonsStage() { sceneGISClipTerrain(); }",
    );
    const inverseView = new Matrix4();
    Object.assign(renderResources.uniformMap, {
      u_sceneGISClippingInverseView: () => {
        Matrix4.clone(frameState.context.uniformState.inverseView, inverseView);
        inverseView[12] -= clipping.origin.x;
        inverseView[13] -= clipping.origin.y;
        inverseView[14] -= clipping.origin.z;
        return inverseView;
      },
      u_clippingData: () =>
        clipping.texture ?? frameState.context.defaultTexture,
      u_clippingCounts: () => clipping.counts,
      u_clippingUnion: () => false,
      u_clippingInverse: () => clipping.inverse,
      u_clippingEdgeStyle: () => Cartesian4.ZERO,
    });
    return true;
  },
};

export default SceneGISPlanarModelClipping;
