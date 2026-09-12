import Cartesian3 from "../../Core/Cartesian3.js";
import Cartographic from "../../Core/Cartographic.js";
import Color from "../../Core/Color.js";
import defined from "../../Core/defined.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Ellipsoid from "../../Core/Ellipsoid.js";
import Frozen from "../../Core/Frozen.js";
import JulianDate from "../../Core/JulianDate.js";
import Matrix3 from "../../Core/Matrix3.js";
import Matrix4 from "../../Core/Matrix4.js";
import Simon1994PlanetaryPositions from "../../Core/Simon1994PlanetaryPositions.js";
import Transforms from "../../Core/Transforms.js";
import DirectionalLight from "../../Scene/DirectionalLight.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISPlanarSkyBox from "./SceneGISPlanarSkyBox.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";

const defaultAtmosphereZenithColor = new Color(0.12, 0.32, 0.72, 0.72);
const defaultAtmosphereHorizonColor = new Color(0.92, 0.56, 0.28, 0.58);

function validateLiveWorld(world) {
  if (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed()) {
    throw new DeveloperError(
      "options.world must be a live SceneGISPlanarWorld.",
    );
  }
}

function normalizeDirection(value, propertyName, result) {
  if (
    !(value instanceof Cartesian3) ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new DeveloperError(
      `${propertyName} must be a finite non-zero Cartesian3.`,
    );
  }

  const scale = Math.max(
    Math.abs(value.x),
    Math.abs(value.y),
    Math.abs(value.z),
  );
  if (scale === 0.0) {
    throw new DeveloperError(
      `${propertyName} must be a finite non-zero Cartesian3.`,
    );
  }

  const x = value.x / scale;
  const y = value.y / scale;
  const z = value.z / scale;
  const magnitude = Math.hypot(x, y, z);
  result.x = x / magnitude;
  result.y = y / magnitude;
  result.z = z / magnitude;
  return result;
}

function validateColor(value, propertyName) {
  if (
    !(value instanceof Color) ||
    !Number.isFinite(value.red) ||
    !Number.isFinite(value.green) ||
    !Number.isFinite(value.blue) ||
    !Number.isFinite(value.alpha)
  ) {
    throw new DeveloperError(`${propertyName} must be a finite Color.`);
  }
}

function validateIntensity(value) {
  if (!Number.isFinite(value) || value < 0.0) {
    throw new DeveloperError(
      "sunIntensity must be a finite non-negative number.",
    );
  }
}

function validateBoolean(value, propertyName) {
  if (typeof value !== "boolean") {
    throw new DeveloperError(`${propertyName} must be a boolean.`);
  }
}

function validatePixelSize(value, propertyName) {
  if (!Number.isFinite(value) || value <= 0.0) {
    throw new DeveloperError(
      `${propertyName} must be a finite positive number.`,
    );
  }
}

function validatePositive(value, propertyName) {
  if (!Number.isFinite(value) || value <= 0.0) {
    throw new DeveloperError(
      `${propertyName} must be a finite positive number.`,
    );
  }
}

function validateNonNegative(value, propertyName) {
  if (!Number.isFinite(value) || value < 0.0) {
    throw new DeveloperError(
      `${propertyName} must be a finite non-negative number.`,
    );
  }
}

function validateSkyBox(value) {
  if (
    defined(value) &&
    (!(value instanceof SceneGISPlanarSkyBox) || value.isDestroyed())
  ) {
    throw new DeveloperError(
      "skyBox must be an undestroyed SceneGISPlanarSkyBox or undefined.",
    );
  }
}

function nativeVisible(value) {
  return defined(value) && value !== false && value.show !== false;
}

function validateNativeEnvironmentConflict(environment, scene) {
  validateSkyBox(environment._skyBox);
  if (environment._showSun && defined(scene.sun) && scene.sun.show !== false) {
    throw new DeveloperError(
      "SceneGIS planar Sun cannot be shown while the native Scene Sun is visible.",
    );
  }
  if (
    environment._showMoon &&
    defined(scene.moon) &&
    scene.moon.show !== false
  ) {
    throw new DeveloperError(
      "SceneGIS planar Moon cannot be shown while the native Scene Moon is visible.",
    );
  }
  if (defined(environment._skyBox)) {
    if (
      nativeVisible(scene.skyBox) ||
      nativeVisible(scene.skyAtmosphere) ||
      nativeVisible(scene.sun) ||
      nativeVisible(scene.moon)
    ) {
      throw new DeveloperError(
        "SceneGIS planar SkyBox conflicts with a visible native Scene environment primitive.",
      );
    }
  } else if (
    environment._showAtmosphere &&
    (nativeVisible(scene.skyAtmosphere) ||
      nativeVisible(scene.sun) ||
      nativeVisible(scene.moon))
  ) {
    throw new DeveloperError(
      "SceneGIS planar atmosphere conflicts with a visible native Scene atmosphere, Sun, or Moon.",
    );
  }
}

SceneGISPlanarEnvironment.prototype._validateNativeBodyConflict = function (
  scene,
) {
  validateNativeEnvironmentConflict(this, scene);
};

SceneGISPlanarEnvironment.prototype._validateNativeEnvironmentConflict =
  function (scene) {
    validateNativeEnvironmentConflict(this, scene);
  };

function requestBodyRender(environment, visible) {
  if (visible && environment._hasAuthority) {
    requestRender(environment);
  }
}

function validateDirectionMode(value) {
  if (value !== "manual" && value !== "astronomical") {
    throw new DeveloperError(
      'directionMode must be either "manual" or "astronomical".',
    );
  }
}

function validateOrigin(value, propertyName, minimum, maximum) {
  if (
    defined(value) &&
    (!Number.isFinite(value) || value < minimum || value > maximum)
  ) {
    throw new DeveloperError(
      `${propertyName} must be undefined or a finite number in [${minimum}, ${maximum}].`,
    );
  }
}

function validateAstronomicalOrigin(longitude, latitude) {
  if (!defined(longitude) || !defined(latitude)) {
    throw new DeveloperError(
      "Astronomical directionMode requires originLongitude and originLatitude.",
    );
  }
}

function validateTime(time) {
  if (
    !(time instanceof JulianDate) ||
    !Number.isFinite(time.dayNumber) ||
    !Number.isFinite(time.secondsOfDay)
  ) {
    throw new DeveloperError("time must be a finite JulianDate.");
  }
}

function computeAstronomicalDirection(
  environment,
  time,
  computeBodyPosition,
  result,
) {
  computeBodyPosition(time, environment._bodyInertial);
  Matrix3.multiplyByVector(
    environment._temeToFixed,
    environment._bodyInertial,
    environment._bodyFixed,
  );
  Cartesian3.subtract(
    environment._bodyFixed,
    environment._observerFixed,
    environment._lineOfSight,
  );
  Matrix3.multiplyByVector(
    environment._fixedToEnu,
    environment._lineOfSight,
    environment._lineOfSight,
  );
  return normalizeDirection(
    environment._lineOfSight,
    environment._directionMode === "astronomical"
      ? "astronomical direction"
      : "direction",
    result,
  );
}

function computeAstronomicalCandidates(environment, time) {
  validateTime(time);
  validateAstronomicalOrigin(
    environment._originLongitude,
    environment._originLatitude,
  );

  environment._originCartographic.longitude = environment._originLongitude;
  environment._originCartographic.latitude = environment._originLatitude;
  environment._originCartographic.height = 0.0;
  Ellipsoid.WGS84.cartographicToCartesian(
    environment._originCartographic,
    environment._observerFixed,
  );
  Transforms.eastNorthUpToFixedFrame(
    environment._observerFixed,
    Ellipsoid.WGS84,
    environment._enuTransform,
  );
  Matrix4.getMatrix3(environment._enuTransform, environment._fixedToEnu);
  Matrix3.transpose(environment._fixedToEnu, environment._fixedToEnu);
  Transforms.computeTemeToPseudoFixedMatrix(time, environment._temeToFixed);

  computeAstronomicalDirection(
    environment,
    time,
    Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame,
    environment._candidateSunDirection,
  );
  computeAstronomicalDirection(
    environment,
    time,
    Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame,
    environment._candidateMoonDirection,
  );
}

function publishAstronomicalCandidates(environment, time) {
  Cartesian3.clone(
    environment._candidateSunDirection,
    environment._effectiveSunDirection,
  );
  Cartesian3.clone(
    environment._candidateMoonDirection,
    environment._effectiveMoonDirection,
  );
  environment._publishedTime = JulianDate.clone(
    time,
    environment._publishedTime,
  );
  environment._astronomyDirty = false;
  syncLight(environment);
}

function astronomyNeedsUpdate(environment, time) {
  if (environment._directionMode !== "astronomical") {
    return false;
  }
  validateTime(time);
  return (
    environment._astronomyDirty ||
    !defined(environment._publishedTime) ||
    !JulianDate.equals(time, environment._publishedTime)
  );
}

function requestAstronomyRender(environment) {
  if (environment._hasAuthority) {
    requestRender(environment);
    environment._astronomyRenderRequested = true;
  }
}

function validateScene(environment, scene) {
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (scene.world !== environment._world) {
    throw new DeveloperError(
      "The Environment Scene must use the registered planar world.",
    );
  }
  if (scene.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError(
      "SceneGISPlanarEnvironment only supports SceneMode.SCENE3D.",
    );
  }
  if (defined(environment._scene) && environment._scene !== scene) {
    throw new DeveloperError(
      "A connected SceneGISPlanarEnvironment cannot control another Scene.",
    );
  }
}

function requestRender(environment) {
  if (defined(environment._scene)) {
    environment._scene.requestRender();
  }
}

function syncLight(environment) {
  const light = environment._light;
  light.direction = environment._lightDirection;
  light.color = environment._lightColor;
  const primary = environment._advancedLightState;
  const direction = defined(primary)
    ? primary.direction
    : environment._effectiveSunDirection;
  Cartesian3.negate(direction, environment._lightDirection);
  Color.clone(
    defined(primary) ? primary.nativeColor : environment._sunColor,
    environment._lightColor,
  );
  light.intensity = defined(primary)
    ? primary.nativeIntensity
    : environment._sunIntensity;
}

function acquireAuthority(environment) {
  const scene = environment._scene;
  environment._capturedLight = scene.light;
  syncLight(environment);
  scene.light = environment._light;
  environment._hasAuthority = true;
}

function releaseAuthority(environment) {
  environment._advancedLightOwner = undefined;
  environment._advancedLightState = undefined;
  if (!environment._hasAuthority) {
    return;
  }
  const scene = environment._scene;
  if (defined(scene) && scene.light === environment._light) {
    scene.light = environment._capturedLight;
  }
  environment._capturedLight = undefined;
  environment._hasAuthority = false;
}

/**
 * Controls manual or project-origin astronomical celestial directions and
 * planar scene lighting for one caller-owned {@link SceneGISPlanarWorld}.
 * Register the instance with a CesiumWidget or Viewer controller host and
 * remove it before destroying the widget. The world does not own this
 * instance or its stable light.
 *
 * @alias SceneGISPlanarEnvironment
 * @constructor
 * @implements Controller
 *
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarWorld} options.world The live planar world controlled by this environment.
 * @param {Cartesian3} options.sunDirection The finite non-zero observer-to-sun direction in +X east, +Y north, +Z up world axes.
 * @param {Cartesian3} options.moonDirection The finite non-zero observer-to-moon direction used by the lightweight Moon and advanced Moonlight.
 * @param {Color} [options.sunColor=Color.WHITE] The finite directional-light color.
 * @param {number} [options.sunIntensity=2.0] The finite non-negative directional-light intensity.
 * @param {"manual"|"astronomical"} [options.directionMode="manual"] The source of effective celestial directions.
 * @param {number} [options.originLongitude] The project-origin WGS84 longitude in radians, required in astronomical mode.
 * @param {number} [options.originLatitude] The project-origin WGS84 geodetic latitude in radians, required in astronomical mode.
 * @param {boolean} [options.showSun=false] Whether the procedural planar Sun is visible.
 * @param {boolean} [options.showMoon=false] Whether the procedural planar Moon is visible.
 * @param {number} [options.sunPixelSize=48.0] The Sun disc diameter in CSS pixels.
 * @param {number} [options.moonPixelSize=36.0] The Moon disc diameter in CSS pixels.
 * @param {Color} [options.moonColor=Color.LIGHTGRAY] The finite procedural Moon color.
 * @param {boolean} [options.showAtmosphere=false] Whether the planar atmosphere is visible.
 * @param {Color} [options.atmosphereZenithColor=(0.12, 0.32, 0.72, 0.72)] The finite zenith color and maximum alpha.
 * @param {Color} [options.atmosphereHorizonColor=(0.92, 0.56, 0.28, 0.58)] The finite horizon color and maximum alpha.
 * @param {number} [options.atmosphereIntensity=1.0] The finite non-negative visual atmosphere strength.
 * @param {number} [options.atmosphereFadeHeight=1000000.0] The finite positive height-fade scale in meters.
 * @param {SceneGISPlanarSkyBox} [options.skyBox] The live caller-owned fixed-axis planar sky box.
 *
 * @exception {DeveloperError} The world is not a live SceneGISPlanarWorld.
 * @exception {DeveloperError} A direction is not a finite non-zero Cartesian3.
 * @exception {DeveloperError} The sun color is not finite.
 * @exception {DeveloperError} The sun intensity is not finite and non-negative.
 * @exception {DeveloperError} The direction mode is not <code>"manual"</code> or <code>"astronomical"</code>.
 * @exception {DeveloperError} An origin is not undefined or a finite value in its inclusive longitude or latitude range.
 * @exception {DeveloperError} Astronomical mode does not define both origin longitude and origin latitude.
 * @exception {DeveloperError} A visible-body option is not a boolean, a finite positive CSS-pixel size, or a finite Color.
 * @exception {DeveloperError} An atmosphere option is not a valid boolean, finite Color, non-negative intensity, positive fade height, or live planar SkyBox.
 */
function SceneGISPlanarEnvironment(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  validateLiveWorld(options.world);

  const sunDirection = normalizeDirection(
    options.sunDirection,
    "sunDirection",
    new Cartesian3(),
  );
  const moonDirection = normalizeDirection(
    options.moonDirection,
    "moonDirection",
    new Cartesian3(),
  );
  const sunColor = options.sunColor ?? Color.WHITE;
  const sunIntensity = options.sunIntensity ?? 2.0;
  const directionMode = options.directionMode ?? "manual";
  const originLongitude = options.originLongitude;
  const originLatitude = options.originLatitude;
  const showSun = options.showSun ?? false;
  const showMoon = options.showMoon ?? false;
  const sunPixelSize = options.sunPixelSize ?? 48.0;
  const moonPixelSize = options.moonPixelSize ?? 36.0;
  const moonColor = options.moonColor ?? Color.LIGHTGRAY;
  const showAtmosphere = options.showAtmosphere ?? false;
  const atmosphereZenithColor =
    options.atmosphereZenithColor ?? defaultAtmosphereZenithColor;
  const atmosphereHorizonColor =
    options.atmosphereHorizonColor ?? defaultAtmosphereHorizonColor;
  const atmosphereIntensity = options.atmosphereIntensity ?? 1.0;
  const atmosphereFadeHeight = options.atmosphereFadeHeight ?? 1000000.0;
  const skyBox = options.skyBox;
  validateColor(sunColor, "sunColor");
  validateIntensity(sunIntensity);
  validateDirectionMode(directionMode);
  validateOrigin(originLongitude, "originLongitude", -Math.PI, Math.PI);
  validateOrigin(
    originLatitude,
    "originLatitude",
    -Math.PI * 0.5,
    Math.PI * 0.5,
  );
  if (directionMode === "astronomical") {
    validateAstronomicalOrigin(originLongitude, originLatitude);
  }
  validateBoolean(showSun, "showSun");
  validateBoolean(showMoon, "showMoon");
  validatePixelSize(sunPixelSize, "sunPixelSize");
  validatePixelSize(moonPixelSize, "moonPixelSize");
  validateColor(moonColor, "moonColor");
  validateBoolean(showAtmosphere, "showAtmosphere");
  validateColor(atmosphereZenithColor, "atmosphereZenithColor");
  validateColor(atmosphereHorizonColor, "atmosphereHorizonColor");
  validateNonNegative(atmosphereIntensity, "atmosphereIntensity");
  validatePositive(atmosphereFadeHeight, "atmosphereFadeHeight");
  validateSkyBox(skyBox);

  this._world = options.world;
  this._sunDirection = sunDirection;
  this._moonDirection = moonDirection;
  this._effectiveSunDirection = Cartesian3.clone(sunDirection);
  this._effectiveMoonDirection = Cartesian3.clone(moonDirection);
  this._candidateSunDirection = new Cartesian3();
  this._candidateMoonDirection = new Cartesian3();
  this._originCartographic = new Cartographic();
  this._observerFixed = new Cartesian3();
  this._enuTransform = new Matrix4();
  this._fixedToEnu = new Matrix3();
  this._temeToFixed = new Matrix3();
  this._bodyInertial = new Cartesian3();
  this._bodyFixed = new Cartesian3();
  this._lineOfSight = new Cartesian3();
  this._directionMode = directionMode;
  this._originLongitude = originLongitude;
  this._originLatitude = originLatitude;
  this._publishedTime = undefined;
  this._astronomyDirty = directionMode === "astronomical";
  this._astronomyRenderRequested = false;
  this._sunColor = Color.clone(sunColor);
  this._sunIntensity = sunIntensity;
  this._showSun = showSun;
  this._showMoon = showMoon;
  this._sunPixelSize = sunPixelSize;
  this._moonPixelSize = moonPixelSize;
  this._moonColor = Color.clone(moonColor);
  this._showAtmosphere = showAtmosphere;
  this._atmosphereZenithColor = Color.clone(atmosphereZenithColor);
  this._atmosphereHorizonColor = Color.clone(atmosphereHorizonColor);
  this._atmosphereIntensity = atmosphereIntensity;
  this._atmosphereFadeHeight = atmosphereFadeHeight;
  this._skyBox = skyBox;
  this._enabled = true;
  this._element = undefined;
  this._scene = undefined;
  this._capturedLight = undefined;
  this._advancedLightOwner = undefined;
  this._advancedLightState = undefined;
  this._hasAuthority = false;

  const lightDirection = Cartesian3.negate(sunDirection, new Cartesian3());
  this._light = new DirectionalLight({
    direction: lightDirection,
    color: sunColor,
    intensity: sunIntensity,
  });
  this._lightDirection = this._light.direction;
  this._lightColor = this._light.color;
}

/**
 * Borrows advanced radiometry while retaining the Environment's stable light.
 * @private
 */
SceneGISPlanarEnvironment.prototype._setAdvancedLight = function (
  owner,
  state,
) {
  this._advancedLightOwner = owner;
  this._advancedLightState = state;
  syncLight(this);
};

/**
 * Releases only the advanced renderer that supplied the current state.
 * @private
 */
SceneGISPlanarEnvironment.prototype._clearAdvancedLight = function (owner) {
  if (this._advancedLightOwner === owner) {
    this._advancedLightOwner = undefined;
    this._advancedLightState = undefined;
    syncLight(this);
  }
};

Object.defineProperties(SceneGISPlanarEnvironment.prototype, {
  /**
   * Gets the caller-owned planar world associated with this environment.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {SceneGISPlanarWorld}
   * @readonly
   */
  world: {
    get: function () {
      return this._world;
    },
  },

  /**
   * Gets the stable Cesium directional light controlled by this environment.
   * Its direction is the normalized negative of {@link SceneGISPlanarEnvironment#effectiveSunDirection}.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {DirectionalLight}
   * @readonly
   */
  light: {
    get: function () {
      return this._light;
    },
  },

  /**
   * Gets or sets whether effective celestial directions use manual fallback
   * state or the project-origin astronomical calculation.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {"manual"|"astronomical"}
   * @exception {DeveloperError} The assigned value is not <code>"manual"</code> or <code>"astronomical"</code>.
   * @exception {DeveloperError} Astronomical mode is selected without both origin longitude and origin latitude.
   */
  directionMode: {
    get: function () {
      return this._directionMode;
    },
    set: function (value) {
      validateDirectionMode(value);
      if (value === this._directionMode) {
        return;
      }
      if (value === "astronomical") {
        validateAstronomicalOrigin(this._originLongitude, this._originLatitude);
        this._directionMode = value;
        this._astronomyDirty = true;
        requestAstronomyRender(this);
        return;
      }

      this._directionMode = value;
      this._astronomyDirty = false;
      this._publishedTime = undefined;
      this._astronomyRenderRequested = false;
      Cartesian3.clone(this._sunDirection, this._effectiveSunDirection);
      Cartesian3.clone(this._moonDirection, this._effectiveMoonDirection);
      syncLight(this);
      if (this._hasAuthority) {
        requestRender(this);
      }
    },
  },

  /**
   * Gets or sets the project-origin WGS84 longitude in radians.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {number|undefined}
   * @exception {DeveloperError} The assigned value is neither undefined nor a finite number in <code>[-PI, PI]</code>.
   * @exception {DeveloperError} The value is undefined while astronomical mode is active.
   */
  originLongitude: {
    get: function () {
      return this._originLongitude;
    },
    set: function (value) {
      validateOrigin(value, "originLongitude", -Math.PI, Math.PI);
      if (this._directionMode === "astronomical" && !defined(value)) {
        validateAstronomicalOrigin(value, this._originLatitude);
      }
      if (value === this._originLongitude) {
        return;
      }
      this._originLongitude = value;
      if (this._directionMode === "astronomical") {
        this._astronomyDirty = true;
        requestAstronomyRender(this);
      }
    },
  },

  /**
   * Gets or sets the project-origin WGS84 geodetic latitude in radians.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {number|undefined}
   * @exception {DeveloperError} The assigned value is neither undefined nor a finite number in <code>[-PI/2, PI/2]</code>.
   * @exception {DeveloperError} The value is undefined while astronomical mode is active.
   */
  originLatitude: {
    get: function () {
      return this._originLatitude;
    },
    set: function (value) {
      validateOrigin(value, "originLatitude", -Math.PI * 0.5, Math.PI * 0.5);
      if (this._directionMode === "astronomical" && !defined(value)) {
        validateAstronomicalOrigin(this._originLongitude, value);
      }
      if (value === this._originLatitude) {
        return;
      }
      this._originLatitude = value;
      if (this._directionMode === "astronomical") {
        this._astronomyDirty = true;
        requestAstronomyRender(this);
      }
    },
  },

  /**
   * Gets the effective observer-to-sun planar direction.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {Cartesian3}
   * @readonly
   */
  effectiveSunDirection: {
    get: function () {
      return Cartesian3.clone(this._effectiveSunDirection);
    },
  },

  /**
   * Gets the effective observer-to-moon planar direction.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {Cartesian3}
   * @readonly
   */
  effectiveMoonDirection: {
    get: function () {
      return Cartesian3.clone(this._effectiveMoonDirection);
    },
  },

  /**
   * Gets or sets the finite non-zero observer-to-sun world direction.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {Cartesian3}
   */
  sunDirection: {
    get: function () {
      return Cartesian3.clone(this._sunDirection);
    },
    set: function (value) {
      const normalized = normalizeDirection(
        value,
        "sunDirection",
        new Cartesian3(),
      );
      if (Cartesian3.equals(normalized, this._sunDirection)) {
        return;
      }
      Cartesian3.clone(normalized, this._sunDirection);
      if (this._directionMode === "astronomical") {
        return;
      }
      Cartesian3.clone(normalized, this._effectiveSunDirection);
      syncLight(this);
      if (this._hasAuthority) {
        requestRender(this);
      }
    },
  },

  /**
   * Gets or sets the finite non-zero observer-to-moon world direction.
   * Advanced environment effects use its effective direction for Moonlight.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {Cartesian3}
   */
  moonDirection: {
    get: function () {
      return Cartesian3.clone(this._moonDirection);
    },
    set: function (value) {
      const normalized = normalizeDirection(
        value,
        "moonDirection",
        new Cartesian3(),
      );
      if (Cartesian3.equals(normalized, this._moonDirection)) {
        return;
      }
      Cartesian3.clone(normalized, this._moonDirection);
      if (this._directionMode === "astronomical") {
        return;
      }
      Cartesian3.clone(normalized, this._effectiveMoonDirection);
      if (this._hasAuthority) {
        requestRender(this);
      }
    },
  },

  /**
   * Gets or sets the finite directional-light color. The value is cloned on
   * both assignment and access.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {Color}
   */
  sunColor: {
    get: function () {
      return Color.clone(this._sunColor);
    },
    set: function (value) {
      validateColor(value, "sunColor");
      if (Color.equals(value, this._sunColor)) {
        return;
      }
      Color.clone(value, this._sunColor);
      syncLight(this);
      if (this._hasAuthority) {
        requestRender(this);
      }
    },
  },

  /**
   * Gets or sets the finite non-negative directional-light intensity.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {number}
   */
  sunIntensity: {
    get: function () {
      return this._sunIntensity;
    },
    set: function (value) {
      validateIntensity(value);
      if (value === this._sunIntensity) {
        return;
      }
      this._sunIntensity = value;
      syncLight(this);
      if (this._hasAuthority) {
        requestRender(this);
      }
    },
  },

  /**
   * Gets or sets whether the procedural planar Sun is visible.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {boolean}
   * @default false
   * @exception {DeveloperError} The assigned value is not a boolean or conflicts with a visible native Sun.
   */
  showSun: {
    get: function () {
      return this._showSun;
    },
    set: function (value) {
      validateBoolean(value, "showSun");
      if (value === this._showSun) {
        return;
      }
      if (value && defined(this._scene)) {
        const previous = this._showSun;
        this._showSun = true;
        try {
          validateNativeEnvironmentConflict(this, this._scene);
        } finally {
          this._showSun = previous;
        }
      }
      this._showSun = value;
      requestBodyRender(this, true);
    },
  },

  /** Gets or sets whether the procedural planar Moon is visible.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {boolean}
   * @default false
   * @exception {DeveloperError} The assigned value is not a boolean or conflicts with a visible native Moon.
   */
  showMoon: {
    get: function () {
      return this._showMoon;
    },
    set: function (value) {
      validateBoolean(value, "showMoon");
      if (value === this._showMoon) {
        return;
      }
      if (value && defined(this._scene)) {
        const previous = this._showMoon;
        this._showMoon = true;
        try {
          validateNativeEnvironmentConflict(this, this._scene);
        } finally {
          this._showMoon = previous;
        }
      }
      this._showMoon = value;
      requestBodyRender(this, true);
    },
  },

  /** Gets or sets the procedural Sun disc diameter in CSS pixels.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is not finite and positive.
   */
  sunPixelSize: {
    get: function () {
      return this._sunPixelSize;
    },
    set: function (value) {
      validatePixelSize(value, "sunPixelSize");
      if (value === this._sunPixelSize) {
        return;
      }
      this._sunPixelSize = value;
      requestBodyRender(this, this._showSun);
    },
  },

  /** Gets or sets the procedural Moon disc diameter in CSS pixels.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is not finite and positive.
   */
  moonPixelSize: {
    get: function () {
      return this._moonPixelSize;
    },
    set: function (value) {
      validatePixelSize(value, "moonPixelSize");
      if (value === this._moonPixelSize) {
        return;
      }
      this._moonPixelSize = value;
      requestBodyRender(this, this._showMoon);
    },
  },

  /** Gets or sets the finite procedural Moon color, cloned on access.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {Color}
   * @exception {DeveloperError} The assigned value is not a finite Color.
   */
  moonColor: {
    get: function () {
      return Color.clone(this._moonColor);
    },
    set: function (value) {
      validateColor(value, "moonColor");
      if (Color.equals(value, this._moonColor)) {
        return;
      }
      Color.clone(value, this._moonColor);
      requestBodyRender(this, this._showMoon);
    },
  },

  /** Gets or sets whether the planar atmosphere is visible.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {boolean}
   * @default false
   * @exception {DeveloperError} The value is not boolean or conflicts with a visible native environment primitive.
   */
  showAtmosphere: {
    get: function () {
      return this._showAtmosphere;
    },
    set: function (value) {
      validateBoolean(value, "showAtmosphere");
      if (value === this._showAtmosphere) {
        return;
      }
      if (value && this._hasAuthority) {
        const previous = this._showAtmosphere;
        this._showAtmosphere = true;
        try {
          validateNativeEnvironmentConflict(this, this._scene);
        } finally {
          this._showAtmosphere = previous;
        }
      }
      this._showAtmosphere = value;
      if (this._hasAuthority) {
        requestRender(this);
      }
    },
  },

  /** Gets or sets the finite planar atmosphere zenith color, cloned on access.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {Color}
   * @exception {DeveloperError} The assigned value is not a finite Color.
   */
  atmosphereZenithColor: {
    get: function () {
      return Color.clone(this._atmosphereZenithColor);
    },
    set: function (value) {
      validateColor(value, "atmosphereZenithColor");
      if (Color.equals(value, this._atmosphereZenithColor)) {
        return;
      }
      Color.clone(value, this._atmosphereZenithColor);
      if (this._hasAuthority && this._showAtmosphere) {
        requestRender(this);
      }
    },
  },

  /** Gets or sets the finite planar atmosphere horizon color, cloned on access.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {Color}
   * @exception {DeveloperError} The assigned value is not a finite Color.
   */
  atmosphereHorizonColor: {
    get: function () {
      return Color.clone(this._atmosphereHorizonColor);
    },
    set: function (value) {
      validateColor(value, "atmosphereHorizonColor");
      if (Color.equals(value, this._atmosphereHorizonColor)) {
        return;
      }
      Color.clone(value, this._atmosphereHorizonColor);
      if (this._hasAuthority && this._showAtmosphere) {
        requestRender(this);
      }
    },
  },

  /** Gets or sets the finite non-negative atmosphere strength.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {number}
   * @default 1.0
   * @exception {DeveloperError} The assigned value is not finite and non-negative.
   */
  atmosphereIntensity: {
    get: function () {
      return this._atmosphereIntensity;
    },
    set: function (value) {
      validateNonNegative(value, "atmosphereIntensity");
      if (value === this._atmosphereIntensity) {
        return;
      }
      this._atmosphereIntensity = value;
      if (this._hasAuthority && this._showAtmosphere) {
        requestRender(this);
      }
    },
  },

  /** Gets or sets the finite positive atmosphere height-fade scale in meters.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {number}
   * @default 1000000.0
   * @exception {DeveloperError} The assigned value is not finite and positive.
   */
  atmosphereFadeHeight: {
    get: function () {
      return this._atmosphereFadeHeight;
    },
    set: function (value) {
      validatePositive(value, "atmosphereFadeHeight");
      if (value === this._atmosphereFadeHeight) {
        return;
      }
      this._atmosphereFadeHeight = value;
      if (this._hasAuthority && this._showAtmosphere) {
        requestRender(this);
      }
    },
  },

  /** Gets or sets the live caller-owned fixed-axis planar sky box.
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {SceneGISPlanarSkyBox|undefined}
   * @exception {DeveloperError} The assigned value is not an undestroyed SceneGISPlanarSkyBox or conflicts with a visible native environment primitive.
   */
  skyBox: {
    get: function () {
      return this._skyBox;
    },
    set: function (value) {
      validateSkyBox(value);
      if (value === this._skyBox) {
        return;
      }
      if (defined(value) && this._hasAuthority) {
        const previous = this._skyBox;
        this._skyBox = value;
        try {
          validateNativeEnvironmentConflict(this, this._scene);
        } finally {
          this._skyBox = previous;
        }
      }
      this._skyBox = value;
      if (this._hasAuthority) {
        requestRender(this);
      }
    },
  },

  /**
   * Gets or sets whether this controller owns planar scene-light authority.
   *
   * @memberof SceneGISPlanarEnvironment.prototype
   * @type {boolean}
   */
  enabled: {
    get: function () {
      return this._enabled;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("enabled must be a boolean.");
      }
      if (value === this._enabled) {
        return;
      }

      if (!value) {
        this._enabled = false;
        releaseAuthority(this);
        requestRender(this);
        return;
      }

      validateLiveWorld(this._world);
      if (defined(this._scene)) {
        validateScene(this, this._scene);
        validateNativeEnvironmentConflict(this, this._scene);
      }
      this._enabled = true;
      if (defined(this._scene)) {
        acquireAuthority(this);
        requestRender(this);
        if (this._directionMode === "astronomical") {
          this._astronomyRenderRequested = true;
        }
      }
    },
  },
});

/**
 * Records a controller-host connection and reserves this instance's world.
 * This callback does not change the Scene light.
 *
 * @param {HTMLElement} element The element containing the Scene.
 * @exception {DeveloperError} The connection or world registry is invalid.
 */
SceneGISPlanarEnvironment.prototype.connectedCallback = function (element) {
  validateLiveWorld(this._world);
  if (!defined(element)) {
    throw new DeveloperError("element is required.");
  }
  if (defined(this._element)) {
    throw new DeveloperError(
      "A SceneGISPlanarEnvironment instance must not be registered twice.",
    );
  }
  if (defined(this._world.environment)) {
    throw new DeveloperError(
      "A SceneGISPlanarWorld may register only one Environment.",
    );
  }

  this._world._registerEnvironment(this);
  this._element = element;
};

/**
 * Releases light authority and the world registry for this host connection.
 *
 * @param {HTMLElement} element The element containing the Scene.
 * @exception {DeveloperError} The element does not match the connection.
 */
SceneGISPlanarEnvironment.prototype.disconnectedCallback = function (element) {
  if (!defined(this._element) || element !== this._element) {
    throw new DeveloperError(
      "element must match the connected SceneGISPlanarEnvironment host.",
    );
  }

  const scene = this._scene;
  releaseAuthority(this);
  if (!this._world.isDestroyed()) {
    this._world._unregisterEnvironment(this);
  }
  this._scene = undefined;
  this._element = undefined;
  this._capturedLight = undefined;
  this._hasAuthority = false;
  if (defined(scene)) {
    scene.requestRender();
  }
};

/**
 * Validates the host Scene and acquires scene-wide directional-light authority.
 *
 * @param {Scene} scene The host Scene.
 * @param {JulianDate} time The current simulation time.
 * @exception {DeveloperError} The connection, registry, world, Scene, or mode is invalid.
 */
SceneGISPlanarEnvironment.prototype.firstUpdate = function (scene, time) {
  if (!defined(this._element)) {
    throw new DeveloperError(
      "The Environment must be connected before its first update.",
    );
  }
  validateLiveWorld(this._world);
  if (this._world.environment !== this) {
    throw new DeveloperError(
      "The Environment no longer owns its planar world registry.",
    );
  }
  validateScene(this, scene);
  validateNativeEnvironmentConflict(this, scene);

  if (this._directionMode === "astronomical") {
    computeAstronomicalCandidates(this, time);
  }

  this._scene = scene;
  if (this._directionMode === "astronomical") {
    publishAstronomicalCandidates(this, time);
  }
  acquireAuthority(this);
  this._astronomyRenderRequested = false;
  scene.requestRender();
};

/**
 * Reasserts the stable light during an active controller-host update.
 *
 * @param {Scene} scene The host Scene.
 * @param {JulianDate} time The current simulation time.
 * @exception {DeveloperError} The connection, registry, world, Scene, or mode is invalid.
 */
SceneGISPlanarEnvironment.prototype.update = function (scene, time) {
  if (!defined(this._element) || !defined(this._scene)) {
    throw new DeveloperError(
      "The Environment must complete firstUpdate before update.",
    );
  }
  validateLiveWorld(this._world);
  if (this._world.environment !== this) {
    throw new DeveloperError(
      "The Environment no longer owns its planar world registry.",
    );
  }
  validateScene(this, scene);
  validateNativeEnvironmentConflict(this, scene);
  if (astronomyNeedsUpdate(this, time)) {
    computeAstronomicalCandidates(this, time);
    publishAstronomicalCandidates(this, time);
    if (!this._astronomyRenderRequested) {
      scene.requestRender();
    }
    this._astronomyRenderRequested = false;
  }
  syncLight(this);
  scene.light = this._light;
  this._hasAuthority = true;
};

/**
 * Severs world/Scene authority during world destruction without simulating a
 * controller-host disconnection. The host marker remains until caller removal.
 *
 * @param {SceneGISPlanarWorld} world The world being destroyed.
 * @private
 */
SceneGISPlanarEnvironment.prototype._severWorld = function (world) {
  if (world !== this._world) {
    throw new DeveloperError(
      "The Environment cannot be severed by another world.",
    );
  }
  releaseAuthority(this);
  this._scene = undefined;
  this._capturedLight = undefined;
  this._hasAuthority = false;
};

export default SceneGISPlanarEnvironment;
