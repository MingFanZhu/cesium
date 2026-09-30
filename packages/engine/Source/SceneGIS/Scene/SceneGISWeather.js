import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import Cartographic from "../../Core/Cartographic.js";
import Color from "../../Core/Color.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import JulianDate from "../../Core/JulianDate.js";
import Matrix4 from "../../Core/Matrix4.js";
import Transforms from "../../Core/Transforms.js";
import SceneGISGpuParticleSystem from "./SceneGISGpuParticleSystem.js";
import SceneGISWeatherEffects from "./_private/_SceneGISWeatherEffects.js";
import weatherCommon from "../../Shaders/SceneGIS/Particles/SceneGISWeatherCommon.js";
import weatherSimulation from "../../Shaders/SceneGIS/Particles/SceneGISWeatherSimulation.js";
import weatherStyle from "../../Shaders/SceneGIS/Particles/SceneGISWeatherStyle.js";

const budgets = Object.freeze({ low: 16384, medium: 32768, high: 65536 });
const simulationShader = `${weatherCommon}\n${weatherSimulation}`;
const renderShader = `${weatherCommon}\n${weatherStyle}`;

function range(name, value, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DeveloperError(
      `${name} must be finite and in [${minimum}, ${maximum}].`,
    );
  }
}
function validate(weather) {
  if (weather.type !== "rain" && weather.type !== "snow") {
    throw new DeveloperError('type must be "rain" or "snow".');
  }
  if (!Object.hasOwn(budgets, weather.quality)) {
    throw new DeveloperError('quality must be "low", "medium" or "high".');
  }
  if (
    typeof weather.show !== "boolean" ||
    typeof weather.paused !== "boolean"
  ) {
    throw new DeveloperError("show and paused must be boolean.");
  }
  range("intensity", weather.intensity, 0, 1);
  range("radius", weather.radius, 100, 5000);
  range("ceilingHeight", weather.ceilingHeight, -10000, 100000);
  range("transitionDuration", weather.transitionDuration, 0, 60);
  range("particleSize", weather.particleSize, 0.25, 4);
  range("windVelocity.x", weather.windVelocity?.x, -100, 100);
  range("windVelocity.y", weather.windVelocity?.y, -100, 100);
  range("color.red", weather.color?.red, 0, 1);
  range("color.green", weather.color?.green, 0, 1);
  range("color.blue", weather.color?.blue, 0, 1);
  range("color.alpha", weather.color?.alpha, 0, 1);
}
function releasePools(weather) {
  if (weather._layers) {
    for (const layer of weather._layers) {
      layer.destroy();
    }
    weather._layers = undefined;
  }
}
function createPools(weather) {
  const count = budgets[weather.quality] / 2;
  // Keep enough precipitation in front of nearby opaque city geometry.
  const nearRadius = Math.min(60, weather.radius * 0.18);
  const layers = [];
  try {
    for (let i = 0; i < 2; ++i) {
      const radius = i === 0 ? nearRadius : weather.radius;
      layers.push(
        new SceneGISGpuParticleSystem({
          maximumParticles: count,
          initialParticles: count,
          emissionRate: 0,
          seed: i * 100000,
          simulationShader,
          renderShader,
          boundingSphere: new BoundingSphere(Cartesian3.ZERO, radius * 2 + 60),
          uniformMap: {
            u_updateTransform: () => weather._updateTransform,
            u_renderTransform: () => weather._renderTransform,
            u_radius: () => radius,
            u_innerRadius: () => (i === 0 ? 0 : nearRadius * 0.75),
            u_wind: () => weather._currentWind,
            u_snow: () => weather._snow,
            u_intensity: () => weather._currentIntensity,
            u_particleSize: () => weather.particleSize,
            u_cameraHeight: () => weather._cameraHeight,
            u_ceilingHeight: () => weather.ceilingHeight,
            u_color: () => weather.color,
          },
        }),
      );
    }
    weather._allocatedQuality = weather.quality;
    weather._allocatedRadius = weather.radius;
    return layers;
  } catch (error) {
    for (const layer of layers) {
      layer.destroy();
    }
    throw error;
  }
}
function approach(value, target, step) {
  return (
    value + Math.sign(target - value) * Math.min(Math.abs(target - value), step)
  );
}

function advanceWeather(weather, time) {
  validate(weather);
  const dt = weather._lastTime
    ? JulianDate.secondsDifference(time, weather._lastTime)
    : 0;
  weather._lastTime = JulianDate.clone(time, weather._lastTime);
  weather._deltaTime = Math.max(0, dt);
  if (!weather.show || weather.paused) {
    return;
  }
  const step =
    weather.transitionDuration === 0
      ? 1
      : weather._deltaTime / weather.transitionDuration;
  weather._currentIntensity = approach(
    weather._currentIntensity,
    weather.intensity,
    step,
  );
  weather._snow = approach(
    weather._snow,
    weather.type === "snow" ? 1 : 0,
    step,
  );
  const fraction =
    weather.transitionDuration === 0
      ? 1
      : 1 - Math.exp((-3 * weather._deltaTime) / weather.transitionDuration);
  Cartesian2.lerp(
    weather._currentWind,
    weather.windVelocity,
    fraction,
    weather._currentWind,
  );
}

/**
 * Camera-local rain and snow for aerial GIS views, in WebGL2 SCENE3D.
 * Add to {@link Scene#primitives}; the collection normally owns destruction.
 * Two bounded GPU particle pools wrap and fade around the observer. Overlapping
 * particles retain world-space motion as the camera moves, including frozen time.
 * Supplying scene also coordinates fog, surface wetness/snow and lens rain/frost.
 * Fog borrows the caller's registered environmentEffects; it never enables that
 * controller or changes lighting, exposure, clouds or clocks. Without scene,
 * this primitive provides independent precipitation only.
 *
 * Each fog/surface/lens group defaults to automatic control (fog requires a binding).
 * Set a group's automatic=false before adjusting its shared effect externally.
 * Manual groups receive no weather writes, including on clear or hide. Strengths
 * are retained while automatic effects fade out. Bound composition runs before
 * Scene consumers; add this primitive to the supplied Scene and destroy/remove it
 * when no longer needed. Only one scene-bound weather system is allowed per Scene.
 *
 * Intensity is an artistic density, not a rainfall measurement. Opaque depth testing
 * hides particles behind geometry but does not provide roof shelter or collisions.
 * Sprites are unlit, with no physical accumulation or motion vectors.
 * Globe uses a regional camera-local tangent approximation for altitude and vertical.
 * Quality/radius changes reset both pools; type/intensity/wind transitions reuse them.
 * show=false hides immediately and pauses observed time; intensity=0 fades to clear.
 * Forward time steps are used as supplied. Rewinding time resets the particle sequence.
 * No additional frames are requested in requestRenderMode.
 *
 * @alias SceneGISWeather
 * @constructor
 * @param {object} options Configuration.
 * @param {string} options.mode "globe" for ENU or "planar" for fixed world XYZ meters. Must match the Scene world.
 * @param {Scene} [options.scene] Bind complete weather composition to this live SCENE3D Scene.
 * @param {SceneGISEnvironmentEffects} [options.environmentEffects] Borrow the existing fog controller. The caller registers/enables it; omitted means no fog binding.
 * @param {SceneGISSurfaceWeather} [options.surfaceWeather] Borrow a surface setting; otherwise reuse the Scene setting or create one.
 * @param {SceneGISRainLensStage} [options.rainLens] Borrow a stage already in this Scene's collection; otherwise create and own it.
 * @param {SceneGISSnowLensStage} [options.snowLens] Borrow a stage already in this Scene's collection; otherwise create and own it.
 * @param {SceneGISWeather.FogOptions} [options.fog] Fog control; requires scene.
 * @param {SceneGISWeather.SurfaceOptions} [options.surface] Surface control; requires scene.
 * @param {SceneGISWeather.LensOptions} [options.lens] Lens control; requires scene.
 * @param {string} [options.type="rain"] "rain" or "snow".
 * @param {number} [options.intensity=0.6] Target visual density in [0,1].
 * @param {Cartesian2} [options.windVelocity] Horizontal velocity in m/s; Planar XY or Globe east/north. Defaults to (3,0).
 * @param {string} [options.quality="medium"] Total slot budget: low=16K, medium=32K, high=64K.
 * @param {number} [options.radius=1500] Far volume radius in meters, [100,5000].
 * @param {number} [options.ceilingHeight=4500] Precipitation ceiling in meters; Planar world Z or Globe ellipsoid height.
 * @param {number} [options.particleSize=1] Artistic sprite size multiplier, [0.25,4].
 * @param {Color} [options.color=Color.WHITE] Unlit sprite tint and opacity, components in [0,1].
 * @param {number} [options.transitionDuration=3] Seconds for a full-scale intensity/type transition and approximately 95% wind convergence, [0,60]. Zero applies immediately.
 * @param {boolean} [options.show=true] Display the system.
 * @param {boolean} [options.paused=false] Freeze simulation and transitions, while maintaining camera coverage.
 * @throws {DeveloperError} Mode or public values violate their documented contracts.
 * @example
 * const weather = scene.primitives.add(new Cesium.SceneGISWeather({
 *   scene, environmentEffects: effects,
 *   mode: "planar", type: "rain", intensity: 0.7,
 *   windVelocity: new Cesium.Cartesian2(4, 1), quality: "medium"
 * }));
 * weather.intensity = 0; // Smoothly clear the precipitation.
 * weather.fog.automatic = false; // Let the external environment panel own fog.
 * effects.heightFogDensity = 0.0001;
 */
function SceneGISWeather(options = {}) {
  if (options.mode !== "globe" && options.mode !== "planar") {
    throw new DeveloperError('mode must be "globe" or "planar".');
  }
  this._mode = options.mode;
  /**
   * Target precipitation kind.
   * @type {string}
   */
  this.type = options.type ?? "rain";
  /**
   * Target visual density, [0,1].
   * @type {number}
   */
  this.intensity = options.intensity ?? 0.6;
  /**
   * Horizontal velocity in local XY or ENU meters per second.
   * @type {Cartesian2}
   */
  this.windVelocity = Cartesian2.clone(
    options.windVelocity ?? new Cartesian2(3, 0),
  );
  /**
   * Explicit low/medium/high particle budget. Changing it resets the pools.
   * @type {string}
   */
  this.quality = options.quality ?? "medium";
  /**
   * Far volume radius in meters; changing it resets the pools.
   * @type {number}
   */
  this.radius = options.radius ?? 1500;
  /**
   * Precipitation ceiling in world/ellipsoid meters.
   * @type {number}
   */
  this.ceilingHeight = options.ceilingHeight ?? 4500;
  /**
   * Artistic sprite size multiplier.
   * @type {number}
   */
  this.particleSize = options.particleSize ?? 1;
  /**
   * Unlit sprite tint and opacity.
   * @type {Color}
   */
  this.color = Color.clone(options.color ?? Color.WHITE);
  /**
   * Transition duration in seconds; zero is immediate.
   * @type {number}
   */
  this.transitionDuration = options.transitionDuration ?? 3;
  /**
   * Display weather; hidden updates pause observed time.
   * @type {boolean}
   */
  this.show = options.show ?? true;
  /**
   * Freeze simulation and transitions.
   * @type {boolean}
   */
  this.paused = options.paused ?? false;
  validate(this);
  this._currentIntensity = 0;
  this._snow = this.type === "snow" ? 1 : 0;
  this._currentWind = Cartesian2.clone(this.windVelocity);
  this._lastTime = undefined;
  this._layers = undefined;
  this._allocatedQuality = undefined;
  this._allocatedRadius = undefined;
  this._matrix = new Matrix4();
  this._stateMatrix = new Matrix4();
  this._inverse = new Matrix4();
  this._updateTransform = Matrix4.clone(Matrix4.IDENTITY);
  this._renderTransform = Matrix4.clone(Matrix4.IDENTITY);
  this._cartographic = new Cartographic();
  this._cameraHeight = 0;
  this._deltaTime = 0;
  this._lastParticleTime = undefined;
  this._effects = undefined;
  this._removePreUpdate = undefined;
  if (options.scene !== undefined) {
    this._effects = new SceneGISWeatherEffects(this, options);
    const now = new JulianDate();
    this._removePreUpdate = options.scene.preUpdate.addEventListener(
      (scene, time) => {
        advanceWeather(this, time ?? JulianDate.now(now));
        this._effects.update(this);
      },
    );
  } else if (
    options.environmentEffects ||
    options.surfaceWeather ||
    options.rainLens ||
    options.snowLens ||
    options.fog ||
    options.surface ||
    options.lens
  ) {
    throw new DeveloperError("Weather composition options require scene.");
  }
}

Object.defineProperties(SceneGISWeather.prototype, {
  /** Shared fog controller; caller-owned, never implicitly enabled.
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISEnvironmentEffects|undefined}
   * @readonly
   */
  environmentEffects: {
    get() {
      return this._effects?.environmentEffects;
    },
  },
  /** Shared surface setting. Automatically created when scene has none.
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISSurfaceWeather|undefined}
   * @readonly
   */
  surfaceWeather: {
    get() {
      return this._effects?.surfaceWeather;
    },
  },
  /** Shared native rain stage. Set lens.automatic=false for direct manual control.
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISRainLensStage|undefined}
   * @readonly
   */
  rainLens: {
    get() {
      return this._effects?.rainLens;
    },
  },
  /** Shared native frost stage. Geometry/appearance controls remain on this stage.
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISSnowLensStage|undefined}
   * @readonly
   */
  snowLens: {
    get() {
      return this._effects?.snowLens;
    },
  },
  /** Mutable fog automation and full-intensity density. Undefined without scene.
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISWeather.FogOptions|undefined}
   * @readonly
   */
  fog: {
    get() {
      return this._effects?.fog;
    },
  },
  /** Mutable full-intensity surface amounts, retained through clear/hide.
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISWeather.SurfaceOptions|undefined}
   * @readonly
   */
  surface: {
    get() {
      return this._effects?.surface;
    },
  },
  /** Mutable rain/frost automation and full-intensity strengths.
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISWeather.LensOptions|undefined}
   * @readonly
   */
  lens: {
    get() {
      return this._effects?.lens;
    },
  },
  /**
   * Immutable world mode.
   * @memberof SceneGISWeather.prototype
   * @type {string}
   * @readonly
   */
  mode: {
    get() {
      return this._mode;
    },
  },
  /**
   * Current transitioned visual intensity.
   * @memberof SceneGISWeather.prototype
   * @type {number}
   * @readonly
   */
  actualIntensity: {
    get() {
      return this._currentIntensity;
    },
  },
  /**
   * Allocated simulation bytes, including texture padding.
   * @memberof SceneGISWeather.prototype
   * @type {number}
   * @readonly
   */
  textureMemoryInBytes: {
    get() {
      return (
        this._layers?.reduce((sum, p) => sum + p.textureMemoryInBytes, 0) ?? 0
      );
    },
  },
});

/** @private */
SceneGISWeather.prototype.update = function (frameState) {
  // Weather must never obscure scene-object picking or advance in auxiliary passes.
  if (!frameState.passes.render || frameState.passes.pick) {
    return;
  }
  if (this._effects) {
    if (frameState !== this._effects.scene.frameState) {
      throw new DeveloperError("Weather must be added to its supplied Scene.");
    }
  } else {
    advanceWeather(this, frameState.time);
  }
  // Scene preUpdate can run without a rendered frame in requestRenderMode.
  // Particle rebasing follows actual primitive updates, not composition ticks.
  const dt = this._lastParticleTime
    ? JulianDate.secondsDifference(frameState.time, this._lastParticleTime)
    : 0;
  this._lastParticleTime = JulianDate.clone(
    frameState.time,
    this._lastParticleTime,
  );
  const rewind = dt < 0;
  if (!this.show) {
    if (this._layers) {
      for (const layer of this._layers) {
        layer.show = false;
        layer.update(frameState);
      }
    }
    return;
  }
  const camera = frameState.camera;
  if (this.mode === "globe") {
    const ellipsoid = frameState.mapProjection.ellipsoid;
    Transforms.eastNorthUpToFixedFrame(
      camera.positionWC,
      ellipsoid,
      this._matrix,
    );
    this._cameraHeight = ellipsoid.cartesianToCartographic(
      camera.positionWC,
      this._cartographic,
    ).height;
  } else {
    Matrix4.fromTranslation(camera.positionWC, this._matrix);
    this._cameraHeight = camera.positionWC.z;
  }
  const visible =
    this._currentIntensity > 0 &&
    this._cameraHeight < this.ceilingHeight + this.radius;
  if (
    this._layers &&
    (this._allocatedQuality !== this.quality ||
      this._allocatedRadius !== this.radius)
  ) {
    releasePools(this);
  }
  if (!this._layers && visible && !this.paused) {
    this._layers = createPools(this);
  }
  if (!this._layers) {
    return;
  }
  const initialize = !this._layers[0].ready || rewind;
  if (initialize) {
    Matrix4.clone(this._matrix, this._stateMatrix);
    for (const layer of this._layers) {
      layer.reset();
    }
  }
  Matrix4.inverseTransformation(this._matrix, this._inverse);
  Matrix4.multiply(this._inverse, this._stateMatrix, this._updateTransform);
  Matrix4.clone(this._updateTransform, this._renderTransform);
  const advance = visible && !this.paused && (initialize || dt > 0);
  try {
    for (const layer of this._layers) {
      Matrix4.clone(this._matrix, layer.modelMatrix);
      layer.show = visible;
      layer.paused = this.paused;
      layer.update(frameState);
    }
  } catch (error) {
    releasePools(this);
    throw error;
  }
  if (advance) {
    Matrix4.clone(this._matrix, this._stateMatrix);
    Matrix4.clone(Matrix4.IDENTITY, this._renderTransform);
  }
};

/**
 * @returns {boolean} Whether this primitive has been destroyed.
 */
SceneGISWeather.prototype.isDestroyed = function () {
  return false;
};

/**
 * Release owned pools, surface/lens components and the Scene listener. Borrowed
 * resources survive; weather-written fields are restored only if not edited later.
 * @returns {undefined}
 */
SceneGISWeather.prototype.destroy = function () {
  this._removePreUpdate?.();
  this._removePreUpdate = undefined;
  this._effects?.destroy();
  this._effects = undefined;
  releasePools(this);
  return destroyObject(this);
};

/**
 * Automatic fog writes density/showHeightFog only; other fog parameters stay shared.
 * Direct environment controls remain available when automatic=false.
 * @typedef {object} SceneGISWeather.FogOptions
 * @property {boolean} [automatic=true] Follow weather. Defaults to false without environmentEffects.
 * @property {boolean} [enabled=true] Apply fog while automatic; false clears weather fog.
 * @property {number} [density=0.0003] Extinction per meter at full intensity, [0,0.001].
 */

/**
 * Automatic rain drives wetness/ripples; snow drives coverage. Current values are
 * available on surfaceWeather. Set automatic=false to edit it independently.
 * @typedef {object} SceneGISWeather.SurfaceOptions
 * @property {boolean} [automatic=true] Follow weather; false stops all surface writes.
 * @property {boolean} [enabled=true] Apply automatic coverage; false disables it.
 * @property {number} [wetness=0.8] Full-rain wetness, [0,1].
 * @property {number} [snowCoverage=0.95] Full-snow coverage, [0,1].
 * @property {number} [rippleIntensity=1] Full-rain ripple strength, [0,1].
 */

/**
 * Automatic lens strengths follow the rain/snow mixture. Shape controls remain
 * directly available on rainLens and snowLens; manual mode stops all lens writes.
 * @typedef {object} SceneGISWeather.LensOptions
 * @property {boolean} [automatic=true] Follow weather; false stops all lens writes.
 * @property {boolean} [enabled=true] Apply automatic lens effects.
 * @property {boolean} [rainEnabled=true] Enable automatic rain beads.
 * @property {boolean} [snowEnabled=true] Enable automatic frost.
 * @property {number} [rainIntensity=0.7] Full-rain strength, [0,1].
 * @property {number} [snowIntensity=0.7] Full-snow strength, [0,1].
 */

export default SceneGISWeather;
