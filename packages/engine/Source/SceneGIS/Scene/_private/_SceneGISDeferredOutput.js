import shader from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredOutput.js";

/** Display conversion for the shared linear deferred pipeline. @private */
const _SceneGISDeferredOutput = {
  update(collection, useHdr, displayHdr) {
    const ldr = useHdr && displayHdr === false;
    const changed = ldr !== (collection._sceneGISDeferredLdr === true);
    collection._sceneGISDeferredLdr = ldr;
    return changed;
  },

  configure(collection, stage) {
    if (collection._sceneGISDeferredLdr) {
      // Reuse the native display slot, before user stages and FXAA.
      stage._fragmentShader = shader;
    }
  },
};

export default _SceneGISDeferredOutput;
