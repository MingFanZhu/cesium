import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import CoplanarPolygonGeometry from "../../Core/CoplanarPolygonGeometry.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import JulianDate from "../../Core/JulianDate.js";
import Matrix3 from "../../Core/Matrix3.js";
import Matrix4 from "../../Core/Matrix4.js";
import PolygonHierarchy from "../../Core/PolygonHierarchy.js";
import RuntimeError from "../../Core/RuntimeError.js";
import VertexFormat from "../../Core/VertexFormat.js";
import BufferUsage from "../../Renderer/BufferUsage.js";
import DrawCommand from "../../Renderer/DrawCommand.js";
import Pass from "../../Renderer/Pass.js";
import RenderState from "../../Renderer/RenderState.js";
import ShaderProgram from "../../Renderer/ShaderProgram.js";
import ShaderSource from "../../Renderer/ShaderSource.js";
import VertexArray from "../../Renderer/VertexArray.js";
import SceneMode from "../../Scene/SceneMode.js";
import ray from "../../Shaders/SceneGIS/Reflections/SceneGISSSRRay.js";
import vertex from "../../Shaders/SceneGIS/Water/SceneGISWaterVS.js";
import fragment from "../../Shaders/SceneGIS/Water/SceneGISWaterFS.js";
import WaterFrame from "./_private/_SceneGISWaterFrame.js";
import EnvironmentLighting from "./_private/_SceneGISModelEnvironmentLighting.js";

function cloneHierarchy(hierarchy) {
  if (!hierarchy?.positions || hierarchy.positions.length < 3) {
    throw new DeveloperError(
      "polygonHierarchy requires at least three positions per ring.",
    );
  }
  const positions = hierarchy.positions.map((p) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.z !== 0) {
      throw new DeveloperError(
        "Water positions must be finite local XY meters with z = 0. Use modelMatrix for placement.",
      );
    }
    return Cartesian3.clone(p);
  });
  return new PolygonHierarchy(
    positions,
    (hierarchy.holes ?? []).map(cloneHierarchy),
  );
}

function number(value, name, minimum, maximum = Infinity) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DeveloperError(
      `${name} must be finite in [${minimum}, ${maximum}].`,
    );
  }
}

const rotationScratch = new Matrix3();
const transposeScratch = new Matrix3();
const orthogonalScratch = new Matrix3();

function validate(surface) {
  if (
    typeof surface.show !== "boolean" ||
    typeof surface.reflections !== "boolean"
  ) {
    throw new DeveloperError("show and reflections must be boolean.");
  }
  number(surface.roughness, "roughness", 0.02, 1);
  number(surface.waveAmplitude, "waveAmplitude", 0);
  number(surface.waveLength, "waveLength", 0.001);
  number(surface.flowSpeed, "flowSpeed", 0);
  number(surface.foamWidth, "foamWidth", 0);
  number(surface.foamIntensity, "foamIntensity", 0, 1);
  number(surface.refractionStrength, "refractionStrength", 0, 1);
  number(surface.maximumReflectionDistance, "maximumReflectionDistance", 0.001);
  number(surface.reflectionThickness, "reflectionThickness", 0.001);
  number(surface.reflectionSteps, "reflectionSteps", 16, 256);
  if (!Number.isInteger(surface.reflectionSteps)) {
    throw new DeveloperError("reflectionSteps must be an integer.");
  }
  for (const color of [surface.waterColor, surface.reflectionColor]) {
    for (const channel of ["red", "green", "blue"]) {
      number(color?.[channel], channel, 0);
    }
  }
  for (const channel of ["x", "y", "z"]) {
    number(surface.absorption?.[channel], `absorption.${channel}`, 0);
  }
  if (
    !Number.isFinite(surface.flowDirection?.x) ||
    !Number.isFinite(surface.flowDirection?.y) ||
    Cartesian2.magnitudeSquared(surface.flowDirection) === 0
  ) {
    throw new DeveloperError(
      "flowDirection must be a finite nonzero Cartesian2.",
    );
  }
  const m = surface.modelMatrix;
  const rotation = Matrix4.getMatrix3(m, rotationScratch);
  const orthogonal = Matrix3.multiply(
    Matrix3.transpose(rotation, transposeScratch),
    rotation,
    orthogonalScratch,
  );
  if (
    !Matrix3.equalsEpsilon(orthogonal, Matrix3.IDENTITY, 1e-7) ||
    Math.abs(Matrix3.determinant(rotation) - 1) > 1e-7 ||
    m[3] !== 0 ||
    m[7] !== 0 ||
    m[11] !== 0 ||
    m[15] !== 1 ||
    !Number.isFinite(m[12]) ||
    !Number.isFinite(m[13]) ||
    !Number.isFinite(m[14])
  ) {
    throw new DeveloperError(
      "modelMatrix must be a finite rigid transform without scale or reflection.",
    );
  }
}

/**
 * A local, above-water lake, river or pool surface with depth-based transmission,
 * animated normal waves, dielectric reflection and shallow contact foam.
 * Add it to Scene.primitives. PolygonHierarchy positions are local XY meters with z = 0;
 * modelMatrix places the plane in either World. Globe callers normally use an ENU transform.
 * Requires SCENE3D, HDR and WebGL2 floating-point targets. Native Water materials are unchanged.
 * Uses opaque scene depth/color, so underwater viewing, overlapping water layers and translucent
 * submerged objects are not supported. Reflection misses use the physical sky when active,
 * otherwise reflectionColor. The scattering tint and foam follow physical lighting when active.
 * Animation follows Scene time; no render loop is started. In requestRenderMode, request a frame
 * after editing these properties, just as for other application-managed primitives.
 * The collection owns the primitive; its Scene owns the shared capture targets.
 *
 * @alias SceneGISWaterSurface
 * @constructor
 * @param {object} options Initialization options.
 * @param {PolygonHierarchy} options.polygonHierarchy Local plane polygon, including optional holes. Copied at construction.
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] Rigid local-to-world transform.
 * @param {*} [options.id] Pick identifier.
 * @param {boolean} [options.show=true] Whether to draw the surface.
 * @param {Color} [options.waterColor] Scene-linear deep-water scattering color; defaults to (0.015, 0.12, 0.14). Alpha is ignored.
 * @param {Cartesian3} [options.absorption] RGB absorption per meter; defaults to (0.45, 0.12, 0.06).
 * @param {Color} [options.reflectionColor] Scene-linear environment radiance without physical sky; defaults to (0.2, 0.3, 0.4).
 * @param {number} [options.roughness=0.12] Perceptual roughness in [0.02, 1].
 * @param {number} [options.waveAmplitude=0.05] Normal-wave height scale in meters; geometry is not displaced.
 * @param {number} [options.waveLength=3.0] Largest normal-wave wavelength in meters.
 * @param {Cartesian2} [options.flowDirection=Cartesian2.UNIT_X] Local flow direction; need not be normalized.
 * @param {number} [options.flowSpeed=0.6] Wave phase speed in meters per second.
 * @param {number} [options.foamWidth=0.3] Depth range of shallow contact foam in meters; zero disables it.
 * @param {number} [options.foamIntensity=0.5] Contact foam strength in [0, 1].
 * @param {number} [options.refractionStrength=0.2] Screen-space refraction distortion in [0, 1].
 * @param {boolean} [options.reflections=true] Whether to trace scene reflections. Sky reflection remains enabled.
 * @param {number} [options.maximumReflectionDistance=100.0] Maximum reflected ray length in meters.
 * @param {number} [options.reflectionThickness=0.5] Reflected hit depth tolerance in meters.
 * @param {number} [options.reflectionSteps=64] Integer reflection traversal budget in [16, 256].
 * @example
 * viewer.scene.highDynamicRange = true;
 * const water = viewer.scene.primitives.add(new Cesium.SceneGISWaterSurface({
 *   polygonHierarchy: new Cesium.PolygonHierarchy([
 *     new Cesium.Cartesian3(-20, -20, 0), new Cesium.Cartesian3(20, -20, 0),
 *     new Cesium.Cartesian3(20, 20, 0), new Cesium.Cartesian3(-20, 20, 0),
 *   ]),
 *   modelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, 2)),
 * }));
 */
function SceneGISWaterSurface(options = {}) {
  this._hierarchy = cloneHierarchy(options.polygonHierarchy);
  /**
   * Rigid local-to-world transform.
   * @type {Matrix4}
   */
  this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  /**
   * Pick identifier.
   * @type {*}
   */
  this.id = options.id;
  /**
   * Whether the surface is visible.
   * @type {boolean}
   */
  this.show = options.show ?? true;
  /**
   * Scene-linear deep-water scattering color. Alpha is ignored.
   * @type {Color}
   */
  this.waterColor = Color.clone(
    options.waterColor ?? new Color(0.015, 0.12, 0.14),
  );
  /**
   * RGB absorption coefficients in inverse meters.
   * @type {Cartesian3}
   */
  this.absorption = Cartesian3.clone(
    options.absorption ?? new Cartesian3(0.45, 0.12, 0.06),
  );
  /**
   * Environment radiance when no physical sky is active.
   * @type {Color}
   */
  this.reflectionColor = Color.clone(
    options.reflectionColor ?? new Color(0.2, 0.3, 0.4),
  );
  /**
   * Perceptual roughness in [0.02, 1].
   * @type {number}
   */
  this.roughness = options.roughness ?? 0.12;
  /**
   * Normal-wave height scale in meters.
   * @type {number}
   */
  this.waveAmplitude = options.waveAmplitude ?? 0.05;
  /**
   * Largest normal-wave wavelength in meters.
   * @type {number}
   */
  this.waveLength = options.waveLength ?? 3;
  /**
   * Local flow direction.
   * @type {Cartesian2}
   */
  this.flowDirection = Cartesian2.clone(
    options.flowDirection ?? Cartesian2.UNIT_X,
  );
  /**
   * Phase speed in meters per second.
   * @type {number}
   */
  this.flowSpeed = options.flowSpeed ?? 0.6;
  /**
   * Contact foam depth range in meters.
   * @type {number}
   */
  this.foamWidth = options.foamWidth ?? 0.3;
  /**
   * Contact foam intensity in [0, 1].
   * @type {number}
   */
  this.foamIntensity = options.foamIntensity ?? 0.5;
  /**
   * Refraction distortion in [0, 1].
   * @type {number}
   */
  this.refractionStrength = options.refractionStrength ?? 0.2;
  /**
   * Whether to trace screen-space scene reflections.
   * @type {boolean}
   */
  this.reflections = options.reflections ?? true;
  /**
   * Maximum reflected ray length in meters.
   * @type {number}
   */
  this.maximumReflectionDistance = options.maximumReflectionDistance ?? 100;
  /**
   * Reflected hit depth tolerance in meters.
   * @type {number}
   */
  this.reflectionThickness = options.reflectionThickness ?? 0.5;
  /**
   * Integer traversal budget in [16, 256].
   * @type {number}
   */
  this.reflectionSteps = options.reflectionSteps ?? 64;
  validate(this);
  this._sceneGISWater = true;
  this._context = undefined;
  this._command = undefined;
  this._epoch = undefined;
  this._time = 0;
  this._sky = undefined;
}

function createResources(surface, frameState) {
  const context = frameState.context;
  const geometry = CoplanarPolygonGeometry.createGeometry(
    new CoplanarPolygonGeometry({
      polygonHierarchy: surface._hierarchy,
      vertexFormat: VertexFormat.POSITION_ONLY,
    }),
  );
  if (!geometry) {
    throw new DeveloperError("The water polygon must have a nonzero area.");
  }
  surface._localBounds = geometry.boundingSphere;
  surface._pickId = context.createPickId({
    primitive: surface,
    id: surface.id,
  });
  const state = WaterFrame.get(frameState);
  surface._command = new DrawCommand({
    owner: surface,
    vertexArray: VertexArray.fromGeometry({
      context,
      geometry,
      attributeLocations: { position: 0 },
      bufferUsage: BufferUsage.STATIC_DRAW,
    }),
    shaderProgram: ShaderProgram.fromCache({
      context,
      vertexShaderSource: vertex,
      fragmentShaderSource: new ShaderSource({ sources: [ray, fragment] }),
      attributeLocations: { position: 0 },
    }),
    renderState: RenderState.fromCache({
      depthTest: { enabled: true },
      depthMask: true,
    }),
    pass: Pass.OPAQUE,
    pickId: "u_pickColor",
    uniformMap: {
      u_pickColor: () => surface._pickId.color,
      u_depth: () => state.depthTexture ?? context.defaultTexture,
      u_color: () => state.colorTexture ?? context.defaultTexture,
      u_waterColor: () => surface.waterColor,
      u_absorption: () => surface.absorption,
      u_reflectionColor: () => surface.reflectionColor,
      u_sky: () => surface._sky?.texture ?? context.defaultCubeMap,
      u_hasSky: () => !!surface._sky?.texture,
      u_skyWorldToLocal: () => surface._sky?.worldToLocal ?? Matrix3.IDENTITY,
      u_skyLod: () => surface._sky?.maximumMipmapLevel ?? 0,
      u_radianceScale: () => surface._radianceScale,
      u_roughness: () => surface.roughness,
      u_waveAmplitude: () => surface.waveAmplitude,
      u_waveLength: () => surface.waveLength,
      u_flowDirection: () => surface.flowDirection,
      u_time: () =>
        (surface._time * surface.flowSpeed * Math.PI * 2) / surface.waveLength,
      u_foamWidth: () => surface.foamWidth,
      u_foamIntensity: () => surface.foamIntensity,
      u_refractionStrength: () => surface.refractionStrength,
      u_reflections: () => surface.reflections,
      u_maximumDistance: () => surface.maximumReflectionDistance,
      u_thickness: () => surface.reflectionThickness,
      u_maximumRoughness: () => 0.6,
      u_stepCount: () => surface.reflectionSteps,
      u_rayNear: () => state.near,
    },
  });
  surface._context = context;
  surface._lightingMode = "none";
}

Object.defineProperties(SceneGISWaterSurface.prototype, {
  /**
   * Whether the geometry is ready to draw.
   * @memberof SceneGISWaterSurface.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return !!this._command;
    },
  },
});

/**
 * Updates the primitive. Called by PrimitiveCollection; do not call directly.
 * @param {FrameState} frameState The frame state.
 * @private
 */
SceneGISWaterSurface.prototype.update = function (frameState) {
  if (!this.show || (!frameState.passes.render && !this._command)) {
    return;
  }
  const c = frameState.context;
  const state = WaterFrame.get(frameState);
  if (
    frameState.mode !== SceneMode.SCENE3D ||
    !state.hdr ||
    !c.webgl2 ||
    !c.depthTexture ||
    !c.colorBufferFloat ||
    !c.colorBufferHalfFloat ||
    !c.textureHalfFloatLinear
  ) {
    throw new RuntimeError(
      "SceneGISWaterSurface requires SCENE3D, HDR and WebGL2 floating-point color/depth textures.",
    );
  }
  if (this._context && this._context !== c) {
    throw new DeveloperError("A water surface belongs to one Scene context.");
  }
  validate(this);
  if (!this._command) {
    createResources(this, frameState);
  }
  const command = this._command;
  command.modelMatrix = this.modelMatrix;
  command.boundingVolume = BoundingSphere.transform(
    this._localBounds,
    this.modelMatrix,
    command.boundingVolume,
  );
  this._pickId.object.id = this.id;
  if (frameState.passes.render) {
    this._epoch ??= JulianDate.clone(frameState.time);
    this._time = JulianDate.secondsDifference(frameState.time, this._epoch);
    const record = frameState._sceneGISPlanarLighting?.active
      ? frameState._sceneGISPlanarLighting
      : frameState._sceneGISGlobeLighting;
    this._sky = record?.active ? record.skyReflections : undefined;
    this._sky?.update(frameState);
    this._radianceScale = record?.surfaceRadianceScale ?? 1;
    const lightingMode = record?.active
      ? frameState._sceneGISPlanarLighting?.active
        ? "planar"
        : "globe"
      : "none";
    if (this._lightingMode !== lightingMode) {
      const source =
        lightingMode === "none"
          ? new ShaderSource()
          : EnvironmentLighting.surfaceSource(lightingMode === "planar");
      if (lightingMode !== "none") {
        source.defines.push("SCENEGIS_WATER_PHYSICAL");
        Object.assign(
          command.uniformMap,
          EnvironmentLighting.surfaceUniforms(
            frameState,
            lightingMode === "planar",
          ),
        );
      }
      source.sources.push(ray, fragment);
      const previous = command.shaderProgram;
      command.shaderProgram = ShaderProgram.fromCache({
        context: c,
        vertexShaderSource: vertex,
        fragmentShaderSource: source,
        attributeLocations: { position: 0 },
      });
      previous.destroy();
      this._lightingMode = lightingMode;
    }
    state.surfaces.push(this);
  }
  frameState.commandList.push(command);
};

/** @returns {boolean} Whether this surface has been destroyed. */
SceneGISWaterSurface.prototype.isDestroyed = function () {
  return false;
};

/**
 * Releases the surface geometry, shaders and pick ID. Shared Scene inputs are not owned here.
 * @returns {undefined}
 */
SceneGISWaterSurface.prototype.destroy = function () {
  this._command?.vertexArray.destroy();
  this._command?.shaderProgram.destroy();
  this._pickId?.destroy();
  return destroyObject(this);
};
export default SceneGISWaterSurface;
