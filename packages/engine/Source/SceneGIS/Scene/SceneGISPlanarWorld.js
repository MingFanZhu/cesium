import Color from "../../Core/Color.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISPlanarCoordinateSystem from "../Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";
import SceneGISPlanarCamera from "./_private/_SceneGISPlanarCamera.js";
import SceneGISPlanarSurface from "./_private/_SceneGISPlanarSurface.js";
import SceneGISPlanarImageryLayerCollection from "./SceneGISPlanarImageryLayerCollection.js";

const scratchPickRay = {
  origin: new Cartesian3(),
  direction: new Cartesian3(),
};

function validateRay(ray) {
  if (
    !ray ||
    !ray.origin ||
    !ray.direction ||
    !Number.isFinite(ray.origin.x) ||
    !Number.isFinite(ray.origin.y) ||
    !Number.isFinite(ray.origin.z) ||
    !Number.isFinite(ray.direction.x) ||
    !Number.isFinite(ray.direction.y) ||
    !Number.isFinite(ray.direction.z)
  ) {
    throw new DeveloperError(
      "ray must have finite origin and direction components.",
    );
  }
  const magnitude = Math.hypot(
    ray.direction.x,
    ray.direction.y,
    ray.direction.z,
  );
  if (!Number.isFinite(magnitude) || magnitude === 0.0) {
    throw new DeveloperError("ray.direction must be non-zero and finite.");
  }
}

function validateMaximumScreenSpaceError(value) {
  if (!Number.isFinite(value) || value <= 0.0) {
    throw new DeveloperError(
      "maximumScreenSpaceError must be a finite positive number.",
    );
  }
}

function validateTileCacheSize(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new DeveloperError("tileCacheSize must be a non-negative integer.");
  }
}

function validateBaseColor(value) {
  if (!(value instanceof Color) || value.alpha !== 1.0) {
    throw new DeveloperError("baseColor must be an opaque Color.");
  }
}

/**
 * A bounded, meter-based planar primary world with an opaque tiled surface and
 * an ordered collection of optional raster imagery layers.
 * The world supports programmatically positioned perspective and orthographic
 * cameras in {@link SceneMode.SCENE3D}.
 *
 * @alias SceneGISPlanarWorld
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarCoordinateSystem} options.coordinateSystem The planar coordinate system.
 * @param {number} options.maximumLevel The highest selectable surface level.
 * @param {number} [options.maximumScreenSpaceError=2.0] The refinement threshold in pixels.
 * @param {number} [options.tileCacheSize=100] The number of unprotected tiles retained after a frame.
 * @param {Color} [options.baseColor=Color.GRAY] The opaque surface color.
 *
 * @exception {DeveloperError} <code>options.coordinateSystem</code> is not a SceneGISPlanarCoordinateSystem.
 * @exception {DeveloperError} <code>options.maximumLevel</code> is invalid or exceeds the coordinate system's safe level.
 * @exception {DeveloperError} The root or maximum-level tile scale is not representable as a positive finite Float32 value.
 * @exception {DeveloperError} <code>options.maximumScreenSpaceError</code> is not a finite positive number.
 * @exception {DeveloperError} <code>options.tileCacheSize</code> is not a non-negative integer.
 * @exception {DeveloperError} <code>options.baseColor</code> is not an opaque Color.
 */
function SceneGISPlanarWorld(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  if (!(options.coordinateSystem instanceof SceneGISPlanarCoordinateSystem)) {
    throw new DeveloperError(
      "options.coordinateSystem must be a SceneGISPlanarCoordinateSystem.",
    );
  }

  const tilingScheme = new SceneGISPlanarTilingScheme({
    coordinateSystem: options.coordinateSystem,
  });
  if (
    !Number.isInteger(options.maximumLevel) ||
    options.maximumLevel < 0 ||
    options.maximumLevel > tilingScheme.maximumSafeLevel
  ) {
    throw new DeveloperError(
      "options.maximumLevel must be a non-negative integer not exceeding maximumSafeLevel.",
    );
  }

  const rootScale = Math.fround(tilingScheme.getTileSizeAtLevel(0));
  const maximumScale = Math.fround(
    tilingScheme.getTileSizeAtLevel(options.maximumLevel),
  );
  if (
    !Number.isFinite(rootScale) ||
    rootScale <= 0.0 ||
    !Number.isFinite(maximumScale) ||
    maximumScale <= 0.0
  ) {
    throw new DeveloperError(
      "The root and maximum-level tile scales must be positive finite Float32 values.",
    );
  }

  const maximumScreenSpaceError = options.maximumScreenSpaceError ?? 2.0;
  const tileCacheSize = options.tileCacheSize ?? 100;
  const baseColor = options.baseColor ?? Color.GRAY;
  validateMaximumScreenSpaceError(maximumScreenSpaceError);
  validateTileCacheSize(tileCacheSize);
  validateBaseColor(baseColor);

  this._coordinateSystem = options.coordinateSystem;
  this._tilingScheme = tilingScheme;
  this._maximumLevel = options.maximumLevel;
  this._maximumScreenSpaceError = maximumScreenSpaceError;
  this._tileCacheSize = tileCacheSize;
  this._baseColor = Color.clone(baseColor);
  this._show = true;
  this._imageryLayers = new SceneGISPlanarImageryLayerCollection({
    tilingScheme,
  });
  this._imageryLayers._owner = this;
  this._surface = new SceneGISPlanarSurface(tilingScheme, this._imageryLayers);
}

Object.defineProperties(SceneGISPlanarWorld.prototype, {
  /**
   * Gets the planar coordinate system.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarCoordinateSystem}
   * @readonly
   */
  coordinateSystem: {
    get: function () {
      return this._coordinateSystem;
    },
  },
  /**
   * Gets the canonical single-root tiling scheme.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarTilingScheme}
   * @readonly
   */
  tilingScheme: {
    get: function () {
      return this._tilingScheme;
    },
  },
  /**
   * Gets the highest selectable surface level.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @readonly
   */
  maximumLevel: {
    get: function () {
      return this._maximumLevel;
    },
  },
  /**
   * Gets whether every shown imagery layer's desired tiles for the current
   * view are ready or terminally failed. Hidden worlds are loaded by definition.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {boolean}
   * @readonly
   */
  tilesLoaded: {
    get: function () {
      return !this._show || this._surface.tilesLoaded;
    },
  },
  /**
   * Gets the world-owned ordered planar imagery layers.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarImageryLayerCollection}
   * @readonly
   */
  imageryLayers: {
    get: function () {
      return this._imageryLayers;
    },
  },
  /**
   * Gets or sets whether the planar world is shown.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {boolean}
   * @exception {DeveloperError} The assigned value is not a boolean.
   */
  show: {
    get: function () {
      return this._show;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("show must be a boolean.");
      }
      this._show = value;
    },
  },
  /**
   * Gets or sets the screen-space error refinement threshold in pixels.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is not a finite positive number.
   */
  maximumScreenSpaceError: {
    get: function () {
      return this._maximumScreenSpaceError;
    },
    set: function (value) {
      validateMaximumScreenSpaceError(value);
      this._maximumScreenSpaceError = value;
    },
  },
  /**
   * Gets or sets the number of unprotected tile records retained after a frame.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is not a non-negative integer.
   */
  tileCacheSize: {
    get: function () {
      return this._tileCacheSize;
    },
    set: function (value) {
      validateTileCacheSize(value);
      this._tileCacheSize = value;
    },
  },
  /**
   * Gets or sets the opaque surface color. Values are cloned on get and set.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {Color}
   * @exception {DeveloperError} The assigned value is not an opaque Color.
   */
  baseColor: {
    get: function () {
      return Color.clone(this._baseColor);
    },
    set: function (value) {
      validateBaseColor(value);
      Color.clone(value, this._baseColor);
    },
  },
});

/**
 * Updates pass-invariant state and validates the supported scene mode.
 *
 * @param {object} frameState The state for the current frame.
 * @exception {DeveloperError} The frame is not using {@link SceneMode.SCENE3D}.
 */
SceneGISPlanarWorld.prototype.update = function (frameState) {
  if (frameState.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError(
      "SceneGISPlanarWorld only supports SceneMode.SCENE3D.",
    );
  }
};

/**
 * Resets per-frame planar selection state.
 *
 * @param {object} frameState The state for the current frame.
 * @exception {DeveloperError} The world is advanced with a second WebGL Context.
 */
SceneGISPlanarWorld.prototype.beginFrame = function (frameState) {
  this._surface.beginFrame(frameState);
};

/**
 * Selects visible planar tiles and submits opaque color commands.
 *
 * @param {object} frameState The state for the current frame.
 * @exception {DeveloperError} The world is rendered with a second WebGL Context.
 */
SceneGISPlanarWorld.prototype.render = function (frameState) {
  if (!this._show) {
    return;
  }
  this._surface.render(
    frameState,
    this._maximumLevel,
    this._maximumScreenSpaceError,
    this._baseColor,
  );
};

/**
 * Trims unprotected tile records after command execution.
 *
 * @param {object} frameState The state for the current frame.
 */
SceneGISPlanarWorld.prototype.endFrame = function (frameState) {
  this._surface.endFrame(this._tileCacheSize);
};

/**
 * Intersects a ray with the bounded mathematical planar surface at Z=0.
 * This operation is independent of rendering, depth picking, and surface LOD.
 *
 * @param {Ray} ray The ray to intersect. Its direction need not be normalized.
 * @param {Cartesian3} [result] The object in which to store the intersection.
 * @returns {Cartesian3|undefined} The intersection, or undefined when the forward ray misses the bounded surface.
 *
 * @exception {DeveloperError} <code>ray</code> does not have a finite origin and non-zero finite direction.
 * @exception {DeveloperError} This world has been destroyed.
 */
SceneGISPlanarWorld.prototype.pick = function (ray, result) {
  validateRay(ray);
  const intersection = SceneGISPlanarCamera.intersectPlane(ray, result);
  if (!intersection) {
    return undefined;
  }
  const extent = this._coordinateSystem.extent;
  if (
    intersection.x < extent.minimumX ||
    intersection.x > extent.maximumX ||
    intersection.y < extent.minimumY ||
    intersection.y > extent.maximumY
  ) {
    return undefined;
  }
  return intersection;
};

/**
 * Computes a four-frustum window ray and intersects it with the bounded
 * mathematical planar surface at Z=0.
 *
 * @param {Cartesian2} windowPosition The finite client-space position with a top-left origin.
 * @param {Scene} scene The live SCENE3D scene whose primary world is this world.
 * @param {Cartesian3} [result] The object in which to store the intersection.
 * @returns {Cartesian3|undefined} The intersection, or undefined for a zero-sized canvas or a miss.
 *
 * @exception {DeveloperError} <code>windowPosition</code> is missing or non-finite.
 * @exception {DeveloperError} <code>scene</code> is missing, destroyed, uses another world, or is not in SCENE3D.
 * @exception {DeveloperError} The scene camera does not use a supported finite frustum and pose.
 * @exception {DeveloperError} This world has been destroyed.
 */
SceneGISPlanarWorld.prototype.pickFromWindowPosition = function (
  windowPosition,
  scene,
  result,
) {
  if (
    !windowPosition ||
    !Number.isFinite(windowPosition.x) ||
    !Number.isFinite(windowPosition.y)
  ) {
    throw new DeveloperError(
      "windowPosition must have finite x and y components.",
    );
  }
  if (!scene || (scene.isDestroyed && scene.isDestroyed())) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (scene.world !== this) {
    throw new DeveloperError("scene.world must be this SceneGISPlanarWorld.");
  }
  if (scene.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError(
      "Planar window picking requires SceneMode.SCENE3D.",
    );
  }
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    windowPosition,
    scratchPickRay,
  );
  return ray ? this.pick(ray, result) : undefined;
};

/**
 * Returns true if this object was destroyed; otherwise, false.
 *
 * @returns {boolean} True if this object was destroyed; otherwise, false.
 */
SceneGISPlanarWorld.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys tile records and all Context-bound resources owned by this world.
 *
 * @returns {void}
 */
SceneGISPlanarWorld.prototype.destroy = function () {
  this._surface.destroy();
  this._imageryLayers._owner = undefined;
  this._imageryLayers.destroy();
  return destroyObject(this);
};

export default SceneGISPlanarWorld;
