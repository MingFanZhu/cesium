import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import SceneMode from "../../../Scene/SceneMode.js";
import validatePlanarShadowMode from "./_SceneGISPlanarShadowMode.js";

function isLiveNonGlobeScene(scene) {
  const world = scene?.world;
  return (
    defined(world) &&
    !defined(scene.globe) &&
    typeof world.isDestroyed === "function" &&
    !world.isDestroyed()
  );
}

function validateConstructionOptions(options) {
  if (defined(options.sceneMode) && options.sceneMode !== SceneMode.SCENE3D) {
    throw new DeveloperError(
      "A non-Globe world only supports SceneMode.SCENE3D.",
    );
  }
  if (defined(options.scene3DOnly) && options.scene3DOnly !== true) {
    throw new DeveloperError(
      "options.scene3DOnly must be true with a non-Globe world.",
    );
  }

  const ellipsoidOptions = [
    "ellipsoid",
    "mapProjection",
    "mapMode2D",
    "depthPlaneEllipsoidOffset",
  ];
  for (let i = 0; i < ellipsoidOptions.length; ++i) {
    const optionName = ellipsoidOptions[i];
    if (defined(options[optionName])) {
      throw new DeveloperError(
        `options.${optionName} is not supported with a non-Globe world.`,
      );
    }
  }

  if (defined(options.shadows) && typeof options.shadows !== "boolean") {
    throw new DeveloperError("options.shadows must be a boolean.");
  }
  if (defined(options.terrainShadows)) {
    validatePlanarShadowMode(options.terrainShadows);
  }

  const nativeEnvironmentOptions = ["skyBox", "skyAtmosphere"];
  for (let i = 0; i < nativeEnvironmentOptions.length; ++i) {
    const optionName = nativeEnvironmentOptions[i];
    if (defined(options[optionName]) && options[optionName] !== false) {
      throw new DeveloperError(
        `options.${optionName} must be false with a non-Globe world.`,
      );
    }
  }
}

function prepareScene(scene) {
  if (defined(scene?.world) && !defined(scene.globe)) {
    scene.fog.enabled = false;
  }
}

function nativeBodyIsVisible(body) {
  return defined(body) && body.show !== false;
}

function validateFrameState(scene) {
  if (!isLiveNonGlobeScene(scene)) {
    return;
  }

  const nativeBodies = [
    ["skyBox", scene.skyBox],
    ["skyAtmosphere", scene.skyAtmosphere],
    ["sun", scene.sun],
    ["moon", scene.moon],
  ];
  for (let i = 0; i < nativeBodies.length; ++i) {
    const [name, body] = nativeBodies[i];
    if (nativeBodyIsVisible(body)) {
      throw new DeveloperError(
        `scene.${name} must be hidden or undefined with a non-Globe world.`,
      );
    }
  }

  if (scene.fog.enabled) {
    throw new DeveloperError(
      "scene.fog.enabled must be false with a non-Globe world.",
    );
  }
}

function throwIfHeightApiUnsupported(scene, methodName) {
  if (isLiveNonGlobeScene(scene)) {
    throw new DeveloperError(
      `Scene.${methodName} is not supported with a non-Globe world. Use world.getTerrainHeight, world.pickTerrain, or SceneGISPlanarTerrainSampler instead.`,
    );
  }
}

/** @private */
const SceneGISPlanarSceneApi = {
  isLiveNonGlobeScene: isLiveNonGlobeScene,
  prepareScene: prepareScene,
  throwIfHeightApiUnsupported: throwIfHeightApiUnsupported,
  validateConstructionOptions: validateConstructionOptions,
  validateFrameState: validateFrameState,
};

export default SceneGISPlanarSceneApi;
