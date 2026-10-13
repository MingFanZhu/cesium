import RuntimeError from "../../../Core/RuntimeError.js";

function textureCount(material) {
  let count = 0;
  for (const name in material._textures) {
    if (Object.prototype.hasOwnProperty.call(material._textures, name)) {
      ++count;
    }
  }
  for (const name in material.materials) {
    if (Object.prototype.hasOwnProperty.call(material.materials, name)) {
      count += textureCount(material.materials[name]);
    }
  }
  return count;
}

/** Reserve surface samplers before native imagery batching. @private */
function _SceneGISGlobeMaterial(
  maximumTextures,
  material,
  hasImagery,
  hasVector = false,
  frameState,
) {
  // Opaque deferred lighting uses separate samplers; native translucent faces do not.
  const lightingTextures =
    frameState?.passes.render && frameState.globeTranslucencyState.translucent
      ? (frameState._sceneGISLocalLightTextureCount ?? 0) +
        (frameState._sceneGISGlobeLighting?.active === true ? 3 : 0)
      : 0;
  // VectorCommon uses eight samplers, including placeholders for absent primitive types.
  const available =
    maximumTextures -
    (material ? textureCount(material) : 0) -
    (hasVector ? 8 : 0) -
    lightingTextures;
  if (available < 0 || (hasImagery && available === 0)) {
    throw new RuntimeError(
      `Globe ${hasVector ? "Fabric/vector" : "Fabric"} textures leave insufficient sampler capacity for the surface and its imagery.`,
    );
  }
  return available;
}

export default _SceneGISGlobeMaterial;
