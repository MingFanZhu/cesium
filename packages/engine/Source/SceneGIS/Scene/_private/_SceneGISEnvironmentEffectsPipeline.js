import Check from "../../../Core/Check.js";
import defined from "../../../Core/defined.js";
import destroyObject from "../../../Core/destroyObject.js";
import DeveloperError from "../../../Core/DeveloperError.js";

const attachmentProperty = "_sceneGISEnvironmentEffectsPipeline";

function validateScene(scene) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("scene", scene);
  if (
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed() ||
    !defined(scene.context)
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  //>>includeEnd('debug');
}

function validateTexture(name, texture, context) {
  //>>includeStart('debug', pragmas.debug);
  if (
    !defined(texture) ||
    typeof texture.isDestroyed !== "function" ||
    texture.isDestroyed() ||
    texture._context !== context
  ) {
    throw new DeveloperError(
      `${name} must be a live Texture owned by the Scene context.`,
    );
  }
  //>>includeEnd('debug');
}

function validateAttachment(pipeline, scene) {
  //>>includeStart('debug', pragmas.debug);
  if (
    pipeline.isDestroyed() ||
    pipeline._scene !== scene ||
    scene[attachmentProperty] !== pipeline
  ) {
    throw new DeveloperError(
      "The advanced-environment pipeline is not attached to this Scene.",
    );
  }
  //>>includeEnd('debug');
}

/**
 * Owns the private Scene attachment used by the advanced environment render
 * slots. A1 intentionally owns no GPU resources.
 *
 * @private
 */
function SceneGISEnvironmentEffectsPipeline() {
  this._scene = undefined;
  this._enabled = false;
  this._currentFrameDepthAvailable = true;
}

Object.defineProperties(SceneGISEnvironmentEffectsPipeline.prototype, {
  enabled: {
    get: function () {
      return this._enabled;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      Check.typeOf.bool("value", value);
      //>>includeEnd('debug');
      this._enabled = value;
    },
  },
});

SceneGISEnvironmentEffectsPipeline.prototype.attach = function (scene) {
  validateScene(scene);

  //>>includeStart('debug', pragmas.debug);
  if (defined(this._scene)) {
    throw new DeveloperError("The pipeline is already attached to a Scene.");
  }
  if (defined(scene[attachmentProperty])) {
    throw new DeveloperError(
      "The Scene already has an advanced-environment pipeline.",
    );
  }
  //>>includeEnd('debug');

  scene[attachmentProperty] = this;
  this._scene = scene;
};

SceneGISEnvironmentEffectsPipeline.prototype.detach = function () {
  const scene = this._scene;
  if (!defined(scene)) {
    return;
  }

  if (scene[attachmentProperty] === this) {
    scene[attachmentProperty] = undefined;
  }
  this._scene = undefined;
};

SceneGISEnvironmentEffectsPipeline.prototype.renderBackground = function (
  frameState,
  passState,
) {
  void frameState;
  void passState;
};

SceneGISEnvironmentEffectsPipeline.prototype.executeHdr = function (
  context,
  colorTexture,
  depthTexture,
  idTexture,
) {
  void context;
  void depthTexture;
  void idTexture;
  return colorTexture;
};

SceneGISEnvironmentEffectsPipeline.prototype._renderBackground = function (
  scene,
  frameState,
  passState,
) {
  validateAttachment(this, scene);
  if (!this._enabled) {
    return;
  }

  this.renderBackground(frameState, passState);
};

SceneGISEnvironmentEffectsPipeline.prototype._executeHdr = function (
  scene,
  context,
  colorTexture,
  depthTexture,
  idTexture,
) {
  validateAttachment(this, scene);
  if (!this._enabled) {
    return colorTexture;
  }

  validateTexture("colorTexture", colorTexture, context);
  validateTexture("depthTexture", depthTexture, context);
  validateTexture("idTexture", idTexture, context);

  this._currentFrameDepthAvailable = scene._view.frustumCommandsList.length > 0;

  const result = this.executeHdr(
    context,
    colorTexture,
    depthTexture,
    idTexture,
  );
  validateTexture("result", result, context);
  return result;
};

SceneGISEnvironmentEffectsPipeline.prototype.isDestroyed = function () {
  return false;
};

SceneGISEnvironmentEffectsPipeline.prototype.destroy = function () {
  this.detach();
  return destroyObject(this);
};

export default SceneGISEnvironmentEffectsPipeline;
