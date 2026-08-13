import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import defined from "../../Core/defined.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import DirectionalLight from "../../Scene/DirectionalLight.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";

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
  environment._lightDirection.x = -environment._sunDirection.x;
  environment._lightDirection.y = -environment._sunDirection.y;
  environment._lightDirection.z = -environment._sunDirection.z;
  Color.clone(environment._sunColor, environment._lightColor);
  light.intensity = environment._sunIntensity;
}

function acquireAuthority(environment) {
  const scene = environment._scene;
  environment._capturedLight = scene.light;
  syncLight(environment);
  scene.light = environment._light;
  environment._hasAuthority = true;
}

function releaseAuthority(environment) {
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
 * Controls explicit manual celestial directions and planar scene lighting for
 * one caller-owned {@link SceneGISPlanarWorld}. Register the instance with a
 * CesiumWidget or Viewer controller host and remove it before destroying the
 * widget. The world does not own this instance or its stable light.
 *
 * @alias SceneGISPlanarEnvironment
 * @constructor
 * @implements Controller
 *
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarWorld} options.world The live planar world controlled by this environment.
 * @param {Cartesian3} options.sunDirection The finite non-zero observer-to-sun direction in +X east, +Y north, +Z up world axes.
 * @param {Cartesian3} options.moonDirection The finite non-zero observer-to-moon direction retained for future visual stages.
 * @param {Color} [options.sunColor=Color.WHITE] The finite directional-light color.
 * @param {number} [options.sunIntensity=2.0] The finite non-negative directional-light intensity.
 *
 * @exception {DeveloperError} The world is not a live SceneGISPlanarWorld.
 * @exception {DeveloperError} A direction is not a finite non-zero Cartesian3.
 * @exception {DeveloperError} The sun color is not finite.
 * @exception {DeveloperError} The sun intensity is not finite and non-negative.
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
  validateColor(sunColor, "sunColor");
  validateIntensity(sunIntensity);

  this._world = options.world;
  this._sunDirection = sunDirection;
  this._moonDirection = moonDirection;
  this._sunColor = Color.clone(sunColor);
  this._sunIntensity = sunIntensity;
  this._enabled = true;
  this._element = undefined;
  this._scene = undefined;
  this._capturedLight = undefined;
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
   * Its direction is the normalized negative of {@link SceneGISPlanarEnvironment#sunDirection}.
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
      syncLight(this);
      if (this._hasAuthority) {
        requestRender(this);
      }
    },
  },

  /**
   * Gets or sets the finite non-zero observer-to-moon world direction. E1
   * retains this state but does not display the Moon or create a moon light.
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
      }
      this._enabled = true;
      if (defined(this._scene)) {
        acquireAuthority(this);
        requestRender(this);
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

  this._scene = scene;
  acquireAuthority(this);
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
