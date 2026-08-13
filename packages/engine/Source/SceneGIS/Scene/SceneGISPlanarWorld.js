import Color from "../../Core/Color.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import Material from "../../Scene/Material.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISPlanarCoordinateSystem from "../Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";
/* eslint-disable no-unused-vars -- Public JSDoc type requires a runtime-resolvable import. */
import SceneGISPlanarTerrainProvider from "../Core/SceneGISPlanarTerrainProvider.js";
/* eslint-enable no-unused-vars */
import SceneGISPlanarCamera from "./_private/_SceneGISPlanarCamera.js";
import SceneGISPlanarSurface from "./_private/_SceneGISPlanarSurface.js";
import { validateTerrainProvider } from "./_private/_SceneGISPlanarTerrain.js";
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

function validateEnableLighting(value) {
  if (typeof value !== "boolean") {
    throw new DeveloperError("enableLighting must be a boolean.");
  }
}

function validateLambertDiffuseMultiplier(value) {
  if (!Number.isFinite(value) || value < 0.0) {
    throw new DeveloperError(
      "lambertDiffuseMultiplier must be a finite non-negative number.",
    );
  }
}

function validateMaterial(value) {
  if (
    value !== undefined &&
    (!(value instanceof Material) || value.isDestroyed())
  ) {
    throw new DeveloperError(
      "material must be an undestroyed Material or undefined.",
    );
  }
}

/**
 * A bounded, meter-based planar primary world with an opaque flat or heightmap
 * terrain surface, optional geometric lighting, and an ordered collection of
 * raster imagery layers.
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
 * @param {boolean} [options.enableLighting=false] Whether geometric Lambert lighting is enabled.
 * @param {number} [options.lambertDiffuseMultiplier=0.9] The non-negative multiplier applied to Lambert diffuse lighting.
 *
 * @exception {DeveloperError} <code>options.coordinateSystem</code> is not a SceneGISPlanarCoordinateSystem.
 * @exception {DeveloperError} <code>options.maximumLevel</code> is invalid or exceeds the coordinate system's safe level.
 * @exception {DeveloperError} The root or maximum-level tile scale is not representable as a positive finite Float32 value.
 * @exception {DeveloperError} <code>options.maximumScreenSpaceError</code> is not a finite positive number.
 * @exception {DeveloperError} <code>options.tileCacheSize</code> is not a non-negative integer.
 * @exception {DeveloperError} <code>options.baseColor</code> is not an opaque Color.
 * @exception {DeveloperError} <code>options.enableLighting</code> is not a boolean.
 * @exception {DeveloperError} <code>options.lambertDiffuseMultiplier</code> is not a finite non-negative number.
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
  const enableLighting = options.enableLighting ?? false;
  const lambertDiffuseMultiplier = options.lambertDiffuseMultiplier ?? 0.9;
  validateMaximumScreenSpaceError(maximumScreenSpaceError);
  validateTileCacheSize(tileCacheSize);
  validateBaseColor(baseColor);
  validateEnableLighting(enableLighting);
  validateLambertDiffuseMultiplier(lambertDiffuseMultiplier);

  this._coordinateSystem = options.coordinateSystem;
  this._tilingScheme = tilingScheme;
  this._maximumLevel = options.maximumLevel;
  this._maximumScreenSpaceError = maximumScreenSpaceError;
  this._tileCacheSize = tileCacheSize;
  this._baseColor = Color.clone(baseColor);
  this._enableLighting = enableLighting;
  this._lambertDiffuseMultiplier = lambertDiffuseMultiplier;
  this._material = undefined;
  this._environment = undefined;
  this._show = true;
  this._terrainProvider = undefined;
  this._imageryLayers = new SceneGISPlanarImageryLayerCollection({
    tilingScheme,
  });
  this._imageryLayers._owner = this;
  this._surface = new SceneGISPlanarSurface(tilingScheme, this._imageryLayers);
  this._frameState = undefined;
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
   * Gets whether terrain and every shown imagery layer for the current view are
   * ready or terminally failed. Hidden worlds are loaded by definition.
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
   * Gets the caller-owned planar Environment currently registered with this
   * world, or undefined. The world keeps only a reference and never destroys
   * the Environment or its light.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarEnvironment|undefined}
   * @readonly
   */
  environment: {
    get: function () {
      return this._environment;
    },
  },
  /**
   * Gets or sets the caller-owned Cesium Material used to style planar
   * terrain. Assignment is published by the next successful normal render.
   * Replacing, clearing, or destroying the world never destroys the material.
   * The qualified built-ins are ElevationContour, ElevationRamp, SlopeRamp,
   * and AspectRamp. Custom Fabric sources may consume planar materialInput
   * fields: normalized tile st/s/str, topology-up normalEC, positionToEyeEC,
   * the fixed east/north/up tangentToEyeMatrix, absolute world-Z height,
   * +Z-relative slope, north-clockwise downslope aspect, and waterMask=0.
   * Only diffuse and alpha are composited; normal, specular, shininess,
   * emission, translucent passes, and full Globe Material compatibility are
   * not supported.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {Material|undefined}
   * @default undefined
   * @exception {DeveloperError} The assigned value is not an undestroyed Material or undefined.
   */
  material: {
    get: function () {
      return this._material;
    },
    set: function (value) {
      if (value === this._material) {
        return;
      }
      validateMaterial(value);
      this._material = value;
    },
  },
  /**
   * Gets or sets the caller-owned planar terrain provider. The provider must
   * use this world's canonical tiling scheme. Assigning undefined restores the
   * flat Z=0 surface. Replacing or destroying the world never destroys the
   * provider.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {SceneGISPlanarTerrainProvider|undefined}
   * @exception {DeveloperError} The provider contract, canonical tiling identity, height range, maximum level, or geometric error curve is invalid.
   */
  terrainProvider: {
    get: function () {
      return this._terrainProvider;
    },
    set: function (provider) {
      if (provider === this._terrainProvider) {
        return;
      }
      let geometricErrors;
      if (provider !== undefined) {
        geometricErrors = validateTerrainProvider(
          provider,
          this._tilingScheme,
          this._maximumLevel,
        );
      }
      this._surface.setTerrainProvider(provider, geometricErrors);
      this._terrainProvider = provider;
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
      if (!value) {
        this._surface.invalidateTerrainQuerySnapshot();
      }
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
  /**
   * Gets or sets whether fragment geometric Lambert lighting is enabled.
   * Lighting consumes the owning Scene's light and does not change surface
   * geometry, terrain selection, or resource ownership.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {boolean}
   * @default false
   * @exception {DeveloperError} The assigned value is not a boolean.
   */
  enableLighting: {
    get: function () {
      return this._enableLighting;
    },
    set: function (value) {
      validateEnableLighting(value);
      this._enableLighting = value;
    },
  },
  /**
   * Gets or sets the multiplier applied to Lambert diffuse lighting. This
   * value has no effect while {@link SceneGISPlanarWorld#enableLighting} is
   * false.
   *
   * @memberof SceneGISPlanarWorld.prototype
   * @type {number}
   * @default 0.9
   * @exception {DeveloperError} The assigned value is not a finite non-negative number.
   */
  lambertDiffuseMultiplier: {
    get: function () {
      return this._lambertDiffuseMultiplier;
    },
    set: function (value) {
      validateLambertDiffuseMultiplier(value);
      this._lambertDiffuseMultiplier = value;
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
  if (this._frameState !== undefined && this._frameState !== frameState) {
    throw new DeveloperError(
      "SceneGISPlanarWorld must remain bound to one reusable frameState.",
    );
  }
  this._frameState = frameState;
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
    this._surface.invalidateTerrainQuerySnapshot();
    return;
  }
  this._surface.render(
    frameState,
    this._maximumLevel,
    this._maximumScreenSpaceError,
    this._baseColor,
    this._enableLighting,
    this._lambertDiffuseMultiplier,
    this._material,
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
 * Gets the terrain height from the deepest resident direct or upsampled
 * Float32 surface mesh containing a position. This method does not request,
 * create, promote, or retain tiles. Flat fallback content is not terrain.
 *
 * @param {Cartesian3} position The finite planar position. Z is validated but does not affect addressing.
 * @returns {number|undefined} The resident terrain height in meters, or undefined when none is resident.
 *
 * @exception {DeveloperError} <code>position</code> is not a Cartesian3 with finite components.
 * @exception {DeveloperError} This world has been destroyed.
 */
SceneGISPlanarWorld.prototype.getTerrainHeight = function (position) {
  if (
    !(position instanceof Cartesian3) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new DeveloperError(
      "position must be a Cartesian3 with finite components.",
    );
  }
  if (!this._terrainProvider) {
    return undefined;
  }
  return this._surface.getTerrainHeight(position, this._maximumLevel);
};

/**
 * Intersects a ray with the actual terrain cover published by the most recent
 * successful normal render. Surface skirts are excluded. A nearest flat
 * fallback occludes farther terrain but does not produce a terrain result.
 *
 * @param {Ray} ray The ray to intersect. Its direction need not be normalized.
 * @param {Cartesian3} [result] The object in which to store the intersection.
 * @returns {Cartesian3|undefined} The nearest terrain intersection, or undefined when none is available.
 *
 * @exception {DeveloperError} <code>ray</code> does not have a finite origin and non-zero finite direction.
 * @exception {DeveloperError} This world has been destroyed.
 */
SceneGISPlanarWorld.prototype.pickTerrain = function (ray, result) {
  validateRay(ray);
  return this._surface.pickTerrain(ray, result);
};

/**
 * Computes a four-frustum window ray and intersects it with the actual terrain
 * cover published by the most recent successful normal render. This method
 * does not trigger a render, depth pick, or mathematical Z=0 fallback.
 *
 * @param {Cartesian2} windowPosition The finite client-space position with a top-left origin.
 * @param {Scene} scene The live SCENE3D scene whose primary world is this world.
 * @param {Cartesian3} [result] The object in which to store the intersection.
 * @returns {Cartesian3|undefined} The terrain intersection, or undefined for a zero-sized canvas or a miss.
 *
 * @exception {DeveloperError} <code>windowPosition</code> is missing or non-finite.
 * @exception {DeveloperError} <code>scene</code> is missing, destroyed, uses another world, or is not in SCENE3D.
 * @exception {DeveloperError} The scene camera does not use a supported finite frustum and pose.
 * @exception {DeveloperError} This world has been destroyed.
 */
SceneGISPlanarWorld.prototype.pickTerrainFromWindowPosition = function (
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
      "Planar window terrain picking requires SceneMode.SCENE3D.",
    );
  }
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    windowPosition,
    scratchPickRay,
  );
  return ray ? this.pickTerrain(ray, result) : undefined;
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
 * Registers the sole caller-owned Environment reference for this live world.
 *
 * @param {SceneGISPlanarEnvironment} environment The Environment being connected.
 * @private
 */
SceneGISPlanarWorld.prototype._registerEnvironment = function (environment) {
  if (this.isDestroyed()) {
    throw new DeveloperError(
      "A destroyed SceneGISPlanarWorld cannot register an Environment.",
    );
  }
  if (this._environment !== undefined) {
    throw new DeveloperError(
      "A SceneGISPlanarWorld may register only one Environment.",
    );
  }
  this._environment = environment;
};

/**
 * Clears this world's Environment reference when the matching controller is
 * disconnected. A stale controller cannot detach another registration.
 *
 * @param {SceneGISPlanarEnvironment} environment The Environment being disconnected.
 * @private
 */
SceneGISPlanarWorld.prototype._unregisterEnvironment = function (environment) {
  if (this._environment === environment) {
    this._environment = undefined;
  }
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
  const environment = this._environment;
  if (environment !== undefined) {
    environment._severWorld(this);
    this._environment = undefined;
  }
  this._frameState = undefined;
  this._surface.destroy();
  this._imageryLayers._owner = undefined;
  this._imageryLayers.destroy();
  return destroyObject(this);
};

export default SceneGISPlanarWorld;
