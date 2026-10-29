import BoundingSphere from "../../Core/BoundingSphere.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Globe from "../../Scene/Globe.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";
import SceneGISWaterSurface from "./SceneGISWaterSurface.js";
import SceneGISWindWaves from "./SceneGISWindWaves.js";
import riverSpectrum from "./_private/_SceneGISRiverSpectrum.js";
import RiverGeometry from "./_private/_SceneGISRiverGeometry.js";
import WaterMesh from "./_private/_SceneGISEllipsoidWaterMesh.js";
import WaterFrame from "./_private/_SceneGISWaterFrame.js";

function validate(river) {
  for (const [name, minimum, maximum] of [
    ["currentSpeedScale", 0, Infinity],
    ["currentRippleAmplitude", 0, Infinity],
    ["currentRippleLength", 0.01, Infinity],
    ["currentFoamIntensity", 0, 1],
  ]) {
    const value = river[name];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new DeveloperError(
        `${name} must be finite in [${minimum}, ${maximum}].`,
      );
    }
  }
}

/**
 * A single directed river with authored water levels and currents. Add to Scene.primitives.
 * The World binding is exact and immutable. Globe positions are ECEF, with ellipsoid heights;
 * Planar positions are the bound World's metric XYZ and are never automatically projected.
 * Ordered cross-sections interpolate position height, width and speed. Positive speeds follow
 * the supplied position order; zero stops current advection. Water levels are not terrain heights.
 * Optional polygonHierarchy clips the width envelope, including holes, without defining water levels.
 * Geometry inputs are copied at construction; reconstruct to edit the profile or boundary.
 *
 * Globe rivers use the regional water chart and mesh LOD, with projection distortion away from
 * its origin. Adjacent sections are joined with miters; folded or self-touching corridors are
 * rejected. This is visual current advection, not hydraulics, branching, waterfalls or global oceans.
 * Owns two random FFT wave bands, locally oriented along the river. Current speed transports
 * the waves independently of their intrinsic evolution; zero current does not freeze waves.
 * Optional caller-owned windWaves add independent wind waves; current speed does not alter them.
 * Requires SCENE3D, HDR and WebGL2 floating-point targets. Shares SceneGISWaterSurface's opaque
 * depth/color optics and optional finite underwater viewing. Water bodies must not overlap.
 *
 * @alias SceneGISRiverSurface
 * @constructor
 * @param {object} options Object with the following properties.
 * @param {Globe|SceneGISPlanarWorld} options.world Exact World receiving the river.
 * @param {Cartesian3[]} options.positions Ordered centerline positions, including water heights.
 * @param {number|number[]} options.widths Full width in meters, constant or one per position.
 * @param {number|number[]} [options.speeds=1] Horizontal current speed in meters per second, constant or one per position.
 * @param {PolygonHierarchy} [options.polygonHierarchy] Optional World-coordinate shoreline clipping mask. Heights are ignored.
 * @param {SceneGISWindWaves} [options.windWaves] Borrowed optional wind simulation, fixed at construction.
 * @param {number} [options.meshSpacing=1] Finest grid spacing in meters in [0.25, 4], fixed at construction.
 * @param {number} [options.maximumScreenSpaceError=2] Curvature error target in pixels.
 * @param {number} [options.maximumTileCount=512] Quadtree leaf budget, integer in [4, 4096].
 * @param {number} [options.currentSpeedScale=1] Nonnegative multiplier of authored current speeds.
 * @param {number} [options.currentRippleAmplitude=0.12] Maximum current-wave vertical displacement in meters. Also controls wave normals.
 * @param {number} [options.currentRippleLength=12] Dominant current-wave length in meters, at least 0.01.
 * @param {number} [options.currentFoamIntensity=0] Optional artistic current streak strength in [0, 1]; not simulated breaking foam.
 * @param {boolean} [options.show=true] Whether the river is visible.
 * @param {*} [options.id] Pick identifier.
 * @param {Color} [options.waterColor] Scene-linear deep-water scattering color; defaults to (0.015, 0.12, 0.14).
 * @param {Cartesian3} [options.absorption] RGB absorption per meter; defaults to (0.45, 0.12, 0.06).
 * @param {Cartesian3} [options.scattering] Optional nonnegative RGB scattering per meter; enables coefficient optics instead of waterColor.
 * @param {number} [options.scatteringAnisotropy=0] Scattering mean cosine in [-0.9, 0.9]; positive favors forward light travel.
 * @param {Color} [options.reflectionColor] Scene-linear environment radiance without physical sky; defaults to (0.2, 0.3, 0.4).
 * @param {number} [options.roughness=0.12] Perceptual roughness in [0.02, 1].
 * @param {number} [options.foamWidth=0.3] Shallow contact foam depth range in meters.
 * @param {number} [options.foamIntensity=0.5] Contact foam strength in [0, 1].
 * @param {number} [options.underwaterDepth=0] Finite vertical depth below the interpolated river profile in meters. Zero disables underwater viewing. Up to 256 source shore segments and 1024 prepared triangles; curved optics use a local sphere approximation.
 * @param {SceneGISWaterSurface.Bathymetry} [options.bathymetry] Explicit regional depth patch with an upright field-to-World modelMatrix.
 * @param {number} [options.causticsIntensity=0] Actual-wave caustic strength in [0, 2]; requires bathymetry.
 * @param {number} [options.refractionStrength=0.2] Screen-space refraction distortion in [0, 1].
 * @param {boolean} [options.reflections=true] Whether to trace scene reflections.
 * @param {number} [options.maximumReflectionDistance=100] Maximum reflected ray length in meters.
 * @param {number} [options.reflectionThickness=0.5] Reflected hit depth tolerance in meters.
 * @param {number} [options.reflectionSteps=64] Integer reflection traversal budget in [16, 256].
 * @example
 * const river = viewer.scene.primitives.add(new Cesium.SceneGISRiverSurface({
 *   world: viewer.scene.world,
 *   positions: Cesium.Cartesian3.fromDegreesArrayHeights([
 *     118.70, 32.10, 25, 118.72, 32.11, 22, 118.75, 32.10, 20,
 *   ]),
 *   widths: [120, 180, 140], speeds: [0.6, 1.2, 0.8],
 * }));
 */
function SceneGISRiverSurface(options = {}) {
  const world = options.world;
  if (
    !(world instanceof Globe || world instanceof SceneGISPlanarWorld) ||
    world.isDestroyed()
  ) {
    throw new DeveloperError(
      "world must be a live Globe or SceneGISPlanarWorld.",
    );
  }
  this._world = world;
  /**
   * Nonnegative multiplier of authored current speeds. Zero freezes current advection.
   * @type {number}
   */
  this.currentSpeedScale = options.currentSpeedScale ?? 1;
  /**
   * Maximum current-wave vertical displacement in meters. Also controls wave normals.
   * @type {number}
   */
  this.currentRippleAmplitude = options.currentRippleAmplitude ?? 0.12;
  /**
   * Dominant current-wave length in meters, at least 0.01.
   * @type {number}
   */
  this.currentRippleLength = options.currentRippleLength ?? 12;
  /**
   * Optional artistic current streak strength in [0, 1]; not simulated breaking foam.
   * @type {number}
   */
  this.currentFoamIntensity = options.currentFoamIntensity ?? 0;
  validate(this);
  const ellipsoid = world instanceof Globe ? world.ellipsoid : undefined;
  const domain = new RiverGeometry(options, ellipsoid);
  const spacing = options.meshSpacing ?? 1;
  if (!Number.isFinite(spacing) || spacing < 0.25 || spacing > 4) {
    throw new DeveloperError("meshSpacing must be finite in [0.25, 4].");
  }
  this._mesh = new WaterMesh(undefined, ellipsoid, 0, true, spacing, domain);
  this._surface = new SceneGISWaterSurface({
    ...options,
    geometryMode: "local",
    modelMatrix: undefined,
    _riverMesh: this._mesh,
    _river: this,
  });
  this._waves = new SceneGISWindWaves({
    resolution: 128,
    choppiness: 0,
    whitecapIntensity: 0,
    _spectrum: riverSpectrum,
  });
}

Object.defineProperties(SceneGISRiverSurface.prototype, {
  /**
   * Actual-wave caustic strength in [0, 2]; requires explicit bathymetry.
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  causticsIntensity: {
    get() {
      return this._surface.causticsIntensity;
    },
    set(value) {
      this._surface.causticsIntensity = value;
    },
  },
  /**
   * Finite vertical depth below the interpolated mean river profile, in meters. Zero disables underwater viewing.
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  underwaterDepth: {
    get() {
      return this._surface.underwaterDepth;
    },
    set(value) {
      this._surface.underwaterDepth = value;
    },
  },
  /**
   * Whether the river is visible.
   * @memberof SceneGISRiverSurface.prototype
   * @type {boolean}
   */
  show: {
    get() {
      return this._surface.show;
    },
    set(value) {
      this._surface.show = value;
    },
  },
  /**
   * Pick identifier.
   * @memberof SceneGISRiverSurface.prototype
   * @type {*}
   */
  id: {
    get() {
      return this._surface.id;
    },
    set(value) {
      this._surface.id = value;
    },
  },
  /**
   * Legacy scene-linear deep-water scattering color; ignored when scattering is defined.
   * @memberof SceneGISRiverSurface.prototype
   * @type {Color}
   */
  waterColor: {
    get() {
      return this._surface.waterColor;
    },
    set(value) {
      this._surface.waterColor = value;
    },
  },
  /**
   * RGB absorption coefficients per meter.
   * @memberof SceneGISRiverSurface.prototype
   * @type {Cartesian3}
   */
  absorption: {
    get() {
      return this._surface.absorption;
    },
    set(value) {
      this._surface.absorption = value;
    },
  },
  /**
   * Optional nonnegative RGB scattering coefficients per meter. Undefined restores legacy optics.
   * @memberof SceneGISRiverSurface.prototype
   * @type {Cartesian3|undefined}
   */
  scattering: {
    get() {
      return this._surface.scattering;
    },
    set(value) {
      this._surface.scattering = value;
    },
  },
  /**
   * Henyey-Greenstein mean cosine in [-0.9, 0.9]; positive favors forward light travel.
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  scatteringAnisotropy: {
    get() {
      return this._surface.scatteringAnisotropy;
    },
    set(value) {
      this._surface.scatteringAnisotropy = value;
    },
  },
  /**
   * Environment radiance without physical sky.
   * @memberof SceneGISRiverSurface.prototype
   * @type {Color}
   */
  reflectionColor: {
    get() {
      return this._surface.reflectionColor;
    },
    set(value) {
      this._surface.reflectionColor = value;
    },
  },
  /**
   * Perceptual roughness in [0.02, 1].
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  roughness: {
    get() {
      return this._surface.roughness;
    },
    set(value) {
      this._surface.roughness = value;
    },
  },
  /**
   * Nonnegative contact foam depth range in meters.
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  foamWidth: {
    get() {
      return this._surface.foamWidth;
    },
    set(value) {
      this._surface.foamWidth = value;
    },
  },
  /**
   * Contact foam strength in [0, 1].
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  foamIntensity: {
    get() {
      return this._surface.foamIntensity;
    },
    set(value) {
      this._surface.foamIntensity = value;
    },
  },
  /**
   * Screen-space refraction distortion in [0, 1].
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  refractionStrength: {
    get() {
      return this._surface.refractionStrength;
    },
    set(value) {
      this._surface.refractionStrength = value;
    },
  },
  /**
   * Whether to trace scene reflections.
   * @memberof SceneGISRiverSurface.prototype
   * @type {boolean}
   */
  reflections: {
    get() {
      return this._surface.reflections;
    },
    set(value) {
      this._surface.reflections = value;
    },
  },
  /**
   * Positive maximum reflected ray length in meters.
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  maximumReflectionDistance: {
    get() {
      return this._surface.maximumReflectionDistance;
    },
    set(value) {
      this._surface.maximumReflectionDistance = value;
    },
  },
  /**
   * Positive reflected hit depth tolerance in meters.
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  reflectionThickness: {
    get() {
      return this._surface.reflectionThickness;
    },
    set(value) {
      this._surface.reflectionThickness = value;
    },
  },
  /**
   * Integer reflection traversal budget in [16, 256].
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  reflectionSteps: {
    get() {
      return this._surface.reflectionSteps;
    },
    set(value) {
      this._surface.reflectionSteps = value;
    },
  },
  /**
   * Curvature error target in pixels, at least 0.1.
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  maximumScreenSpaceError: {
    get() {
      return this._surface.maximumScreenSpaceError;
    },
    set(value) {
      this._surface.maximumScreenSpaceError = value;
    },
  },
  /**
   * Quadtree leaf budget, integer in [4, 4096].
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  maximumTileCount: {
    get() {
      return this._surface.maximumTileCount;
    },
    set(value) {
      this._surface.maximumTileCount = value;
    },
  },
  /**
   * Exact World binding.
   * @memberof SceneGISRiverSurface.prototype
   * @type {Globe|SceneGISPlanarWorld}
   * @readonly
   */
  world: {
    get() {
      return this._world;
    },
  },
  /**
   * Whether render resources have been created.
   * @memberof SceneGISRiverSurface.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get() {
      return this._surface.ready;
    },
  },
  /**
   * A snapshot of shared water LOD and cache statistics.
   * @memberof SceneGISRiverSurface.prototype
   * @type {SceneGISWaterSurface.MeshStatistics}
   * @readonly
   */
  statistics: {
    get() {
      return this._surface.statistics;
    },
  },
  /**
   * Borrowed wind simulation; not destroyed with this river.
   * @memberof SceneGISRiverSurface.prototype
   * @type {SceneGISWindWaves|undefined}
   * @readonly
   */
  windWaves: {
    get() {
      return this._surface.windWaves;
    },
  },
  /**
   * Finest grid spacing in meters.
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   * @readonly
   */
  meshSpacing: {
    get() {
      return this._surface.meshSpacing;
    },
  },
});

/**
 * Gets a conservative World-space bound including current and optional wind displacement.
 * @param {BoundingSphere} [result] Object receiving the bound.
 * @returns {BoundingSphere} The bound.
 */
SceneGISRiverSurface.prototype.getBoundingSphere = function (result) {
  result = BoundingSphere.clone(this._mesh.root.bounds, result);
  result.radius += this.windWaves?._maximumDisplacement ?? 0;
  result.radius += this.currentRippleAmplitude;
  return result;
};

/**
 * Updates the primitive. Called by PrimitiveCollection; do not call directly.
 * @param {FrameState} frameState The frame state.
 * @private
 */
SceneGISRiverSurface.prototype.update = function (frameState) {
  if (
    this._world.isDestroyed() ||
    WaterFrame.get(frameState).world !== this._world
  ) {
    throw new DeveloperError(
      "The river must be rendered in its exact, live World.",
    );
  }
  validate(this);
  this._surface.update(frameState);
};

/**
 * @returns {boolean} Whether this river has been destroyed.
 */
SceneGISRiverSurface.prototype.isDestroyed = function () {
  return false;
};

/**
 * Releases owned geometry, river FFT, shaders and picking resources. The World and optional wind simulation are borrowed.
 * @returns {undefined}
 */
SceneGISRiverSurface.prototype.destroy = function () {
  this._surface.destroy();
  this._waves.destroy();
  return destroyObject(this);
};

export default SceneGISRiverSurface;
