import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import CoplanarPolygonGeometry from "../../Core/CoplanarPolygonGeometry.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Ellipsoid from "../../Core/Ellipsoid.js";
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
import Globe from "../../Scene/Globe.js";
import ray from "../../Shaders/SceneGIS/Reflections/SceneGISSSRRay.js";
import vertex from "../../Shaders/SceneGIS/Water/SceneGISWaterVS.js";
import fragment from "../../Shaders/SceneGIS/Water/SceneGISWaterFS.js";
import optics from "../../Shaders/SceneGIS/Water/SceneGISWaterOptics.js";
import foamMaterial from "../../Shaders/SceneGIS/Water/SceneGISWaterFoam.js";
import WaterFoam from "./_private/_SceneGISWaterFoam.js";
import waterEffects from "../../Shaders/SceneGIS/Water/SceneGISWaterEffects.js";
import fieldWaves from "../../Shaders/SceneGIS/Water/SceneGISWaterFieldWaves.js";
import WaterField from "./_private/_SceneGISWaterField.js";
import Cartesian4 from "../../Core/Cartesian4.js";
import Underwater from "./_private/_SceneGISUnderwater.js";
import riverFlow from "../../Shaders/SceneGIS/Water/SceneGISRiverFlow.js";
import curvedSurface from "../../Shaders/SceneGIS/Water/SceneGISWaterCurvedSurface.js";
import WaterFrame from "./_private/_SceneGISWaterFrame.js";
import WindWaves from "./SceneGISWindWaves.js";
import WaterMesh from "./_private/_SceneGISWaterMesh.js";
import EllipsoidWaterMesh from "./_private/_SceneGISEllipsoidWaterMesh.js";
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
  if (surface._gridMesh) {
    if (!Matrix4.equals(surface.modelMatrix, Matrix4.IDENTITY)) {
      throw new DeveloperError(
        "Ellipsoid water requires identity modelMatrix. Author ECEF positions and ellipsoid heights instead.",
      );
    }
    number(surface.maximumScreenSpaceError, "maximumScreenSpaceError", 0.1);
    number(surface.maximumTileCount, "maximumTileCount", 4, 4096);
    if (!Number.isInteger(surface.maximumTileCount)) {
      throw new DeveloperError("maximumTileCount must be an integer.");
    }
  }
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
  number(surface.underwaterDepth, "underwaterDepth", 0);
  number(surface.causticsIntensity, "causticsIntensity", 0, 2);
  if (surface.causticsIntensity > 0 && !surface._field) {
    throw new DeveloperError("Caustics require explicit bathymetry.");
  }
  if (
    surface._gridMesh &&
    (surface.underwaterDepth > 0 || surface.causticsIntensity > 0)
  ) {
    throw new DeveloperError(
      "Underwater volumes and caustics require local water geometry.",
    );
  }
  number(surface.scatteringAnisotropy, "scatteringAnisotropy", -0.9, 0.9);
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
    if (surface.scattering !== undefined) {
      number(surface.scattering?.[channel], `scattering.${channel}`, 0);
    }
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
 * An above-water lake, river or pool surface with depth-based transmission,
 * animated normal waves, dielectric reflection and shallow contact foam.
 * Add it to Scene.primitives. PolygonHierarchy positions are local XY meters with z = 0;
 * modelMatrix places the plane in either World. Globe callers normally use an ENU transform.
 * Explicit geometryMode "ellipsoid" instead accepts ECEF positions and a constant ellipsoid
 * height, or per-position heights interpolated in a fixed regional chart. It requires windWaves,
 * an identity modelMatrix and a matching Globe ellipsoid. Rings must fit one open tangent
 * hemisphere; their edges are straight in the regional gnomonic chart. This is regional visual
 * wind synthesis with projection distortion, not global ocean or hydraulic simulation.
 * Requires SCENE3D, HDR and WebGL2 floating-point targets. Native Water materials are unchanged.
 * Uses opaque scene depth/color. Local underwater viewing is opt-in through underwaterDepth;
 * overlapping water layers and translucent submerged objects are not supported. Reflection misses use the physical sky when active,
 * otherwise reflectionColor. The scattering tint and foam follow physical lighting when active.
 * Animation follows Scene time; no render loop is started. In requestRenderMode, request a frame
 * after editing these properties, just as for other application-managed primitives.
 * The collection owns the primitive; its Scene owns the shared capture targets and foam texture.
 * Foam detail loads asynchronously from the packaged Assets/SceneGIS/Water/Foam resource.
 * Water geometry remains visible while loading; failures are reported through Scene rendering errors.
 * @alias SceneGISWaterSurface
 * @constructor
 * @param {object} options Initialization options.
 * @param {PolygonHierarchy} options.polygonHierarchy Local XY or explicit ellipsoid-mode ECEF polygon, including holes. Copied at construction.
 * @param {string} [options.geometryMode="local"] "local" or "ellipsoid"; fixed at construction.
 * @param {Ellipsoid} [options.ellipsoid=Ellipsoid.WGS84] Curved-mode ellipsoid, copied at construction. Must match the Globe.
 * @param {number} [options.height=0] Curved-mode ellipsoid height in meters, fixed at construction.
 * @param {boolean} [options.perPositionHeight=false] Use ECEF boundary heights instead of height in curved mode. Fixed at construction.
 * @param {number} [options.maximumScreenSpaceError=2] Curved grid curvature error target in pixels, at least 0.1.
 * @param {number} [options.maximumTileCount=512] Curved quadtree leaf budget, integer in [4, 4096]. The budget can limit requested accuracy.
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] Rigid local-to-world transform.
 * @param {*} [options.id] Pick identifier.
 * @param {boolean} [options.show=true] Whether to draw the surface.
 * @param {Color} [options.waterColor] Legacy scene-linear deep-water scattering color; defaults to (0.015, 0.12, 0.14). Ignored when scattering is defined. Alpha is ignored.
 * @param {Cartesian3} [options.absorption] RGB absorption per meter; defaults to (0.45, 0.12, 0.06).
 * @param {Cartesian3} [options.scattering] Optional nonnegative RGB scattering per meter. Enables homogeneous single-scattering optics; undefined retains waterColor optics. Zero enables absorption-only optics.
 * @param {number} [options.scatteringAnisotropy=0] Henyey-Greenstein mean cosine in [-0.9, 0.9]; positive favors forward light travel. Used only with scattering.
 * @param {Color} [options.reflectionColor] Scene-linear environment radiance without physical sky; defaults to (0.2, 0.3, 0.4).
 * @param {number} [options.roughness=0.12] Perceptual roughness in [0.02, 1].
 * @param {SceneGISWindWaves} [options.windWaves] Optional caller-owned wind simulation. Fixed at construction; replaces normal-only waves.
 * @param {number} [options.meshSpacing=1] Finest wind-wave grid spacing in meters, in [0.25, 4]. Fixed at construction; ignored without windWaves.
 * @param {number} [options.waveAmplitude=0.05] Normal-only wave height in meters; ignored when windWaves is supplied.
 * @param {number} [options.waveLength=3.0] Largest normal-wave wavelength in meters.
 * @param {Cartesian2} [options.flowDirection=Cartesian2.UNIT_X] Local flow direction; need not be normalized.
 * @param {number} [options.flowSpeed=0.6] Wave phase speed in meters per second.
 * @param {number} [options.foamWidth=0.3] Shallow contact depth range in meters; with bathymetry also the horizontal shoreline range. Zero disables it.
 * @param {number} [options.foamIntensity=0.5] Contact foam strength in [0, 1].
 * @param {number} [options.underwaterDepth=0] Local volume depth below the mean surface in meters; zero disables underwater viewing. Local geometry only, at most 256 boundary segments including holes. Mean-height immersion, not a wave-exact meniscus.
 * @param {SceneGISWaterSurface.Bathymetry} [options.bathymetry] Immutable copied local depth field for camera-independent shore foam and caustics.
 * @param {number} [options.causticsIntensity=0] Approximate bottom light focusing strength in [0, 2]. Local geometry only.
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
  this._geometryMode = options.geometryMode ?? "local";
  if (this._geometryMode !== "local" && this._geometryMode !== "ellipsoid") {
    throw new DeveloperError('geometryMode must be "local" or "ellipsoid".');
  }
  this._windWaves = options.windWaves;
  this._meshSpacing = options.meshSpacing ?? 1;
  number(this._meshSpacing, "meshSpacing", 0.25, 4);
  if (
    this._windWaves !== undefined &&
    !(this._windWaves instanceof WindWaves)
  ) {
    throw new DeveloperError("windWaves must be a SceneGISWindWaves instance.");
  }
  this._gridMesh = options._riverMesh;
  this._river = options._river;
  this._pickOwner = options._river ?? this;
  if (this._gridMesh) {
    // Prepared river geometry shares the water renderer without changing its public coordinate modes.
  } else if (this._geometryMode === "ellipsoid") {
    if (!this._windWaves) {
      throw new DeveloperError("Ellipsoid water requires windWaves.");
    }
    const ellipsoid = options.ellipsoid ?? Ellipsoid.WGS84;
    if (!(ellipsoid instanceof Ellipsoid) || ellipsoid.minimumRadius <= 0) {
      throw new DeveloperError("ellipsoid must have positive radii.");
    }
    const height = options.height ?? 0,
      perPositionHeight = options.perPositionHeight ?? false;
    if (!Number.isFinite(height) || typeof perPositionHeight !== "boolean") {
      throw new DeveloperError(
        "height must be finite and perPositionHeight must be boolean.",
      );
    }
    this._ellipsoidMesh = new EllipsoidWaterMesh(
      options.polygonHierarchy,
      Ellipsoid.clone(ellipsoid),
      height,
      perPositionHeight,
      this._meshSpacing,
    );
  } else {
    this._hierarchy = cloneHierarchy(options.polygonHierarchy);
  }
  this._gridMesh ??= this._ellipsoidMesh;
  if (options.bathymetry !== undefined) {
    if (this._gridMesh) {
      throw new DeveloperError("Bathymetry requires local water geometry.");
    }
    this._field = new WaterField(options.bathymetry, this._hierarchy);
  }
  /**
   * Curved grid curvature error target in pixels.
   * @type {number}
   */
  this.maximumScreenSpaceError = options.maximumScreenSpaceError ?? 2;
  /**
   * Curved quadtree leaf budget.
   * @type {number}
   */
  this.maximumTileCount = options.maximumTileCount ?? 512;
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
   * Legacy scene-linear deep-water scattering color. Ignored when scattering is defined.
   * Alpha is ignored.
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
   * Nonnegative finite RGB scattering coefficients in inverse meters. Copied at construction.
   * Defined values enable homogeneous single scattering; undefined restores legacy waterColor optics.
   * Zero means absorption only. Changing this property updates uniforms without reallocating resources.
   * @type {Cartesian3|undefined}
   */
  this.scattering = Cartesian3.clone(options.scattering);
  /**
   * Henyey-Greenstein mean cosine in [-0.9, 0.9]. Positive favors forward light travel.
   * Only affects the direct single-scattering source when scattering is defined.
   * @type {number}
   */
  this.scatteringAnisotropy = options.scatteringAnisotropy ?? 0;
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
   * Contact foam depth range in meters; with bathymetry also the horizontal shoreline range.
   * @type {number}
   */
  this.foamWidth = options.foamWidth ?? 0.3;
  /**
   * Contact foam intensity in [0, 1].
   * @type {number}
   */
  this.foamIntensity = options.foamIntensity ?? 0.5;
  /**
   * Finite local underwater volume depth in meters. Zero disables the effect. Requires local geometry.
   * Uses mean-height immersion; concave boundaries and holes are supported, up to 256 segments.
   * @type {number}
   */
  this.underwaterDepth = options.underwaterDepth ?? 0;
  /**
   * Approximate animated bottom-caustics strength in [0, 2]. Requires local geometry.
   * @type {number}
   */
  this.causticsIntensity = options.causticsIntensity ?? 0;
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

function waterVertex(surface) {
  return new ShaderSource({
    defines: [...waterDefines(surface), "SCENEGIS_RIVER_VERTEX"],
    sources: [riverFlow, vertex],
  });
}
function waterDefines(surface) {
  const defines = surface._windWaves ? ["SCENEGIS_WIND_WAVES"] : [];
  if (surface._gridMesh) {
    defines.push("SCENEGIS_CURVED_WATER");
  }
  if (surface._river) {
    defines.push("SCENEGIS_RIVER_WATER");
  }
  return defines;
}
function waterAttributes(surface) {
  return surface._gridMesh
    ? EllipsoidWaterMesh.attributeLocations
    : { position: 0, waveData: 1 };
}
const inverseScratch = new Matrix4();
const cameraScratch = new Cartesian3();
function updateTiles(surface, frameState) {
  const mesh = surface._mesh;
  const camera = Matrix4.multiplyByPoint(
    Matrix4.inverseTransformation(surface.modelMatrix, inverseScratch),
    frameState.camera.positionWC,
    cameraScratch,
  );
  surface._commands ??= [];
  surface._commands.length = 0;
  for (const tile of mesh.tiles) {
    tile.worldBounds = BoundingSphere.transform(
      tile.bounds,
      surface.modelMatrix,
      tile.worldBounds,
    );
    tile.worldBounds.radius += surface._windWaves._maximumDisplacement;
    if (frameState.cullingVolume.computeVisibility(tile.worldBounds) === -1) {
      continue;
    }
    const distance = Math.hypot(
      Math.max(tile.x - camera.x, 0, camera.x - tile.x - mesh.size),
      Math.max(tile.y - camera.y, 0, camera.y - tile.y - mesh.size),
      camera.z,
    );
    const level = Math.max(
      0,
      Math.min(6, Math.floor(Math.log2(Math.max(1, distance * mesh.lodScale)))),
    );
    let entry = tile.cache.find((e) => e.level === level);
    if (!entry) {
      const geometry = mesh.createGeometry(tile, level);
      entry = {
        level,
        vertexArray: VertexArray.fromGeometry({
          context: frameState.context,
          geometry,
          attributeLocations: { position: 0, waveData: 1 },
          bufferUsage: BufferUsage.STATIC_DRAW,
        }),
        triangles: geometry.indices.length / 3,
        bytes:
          geometry.attributes.position.values.byteLength +
          geometry.attributes.waveData.values.byteLength +
          geometry.indices.byteLength,
      };
      if (tile.cache.length === 2) {
        tile.cache.shift().vertexArray.destroy();
      }
      tile.cache.push(entry);
    }
    entry.lastUsed = frameState.frameNumber;
    tile.command ??= new DrawCommand({
      owner: surface,
      pass: Pass.OPAQUE,
      pickId: "u_pickColor",
    });
    const command = tile.command,
      base = surface._command;
    command.vertexArray = entry.vertexArray;
    command.shaderProgram = base.shaderProgram;
    command.uniformMap = base.uniformMap;
    command.renderState = base.renderState;
    command.modelMatrix = surface.modelMatrix;
    command.boundingVolume = tile.worldBounds;
    tile.level = level;
    tile.triangles = entry.triangles;
    surface._commands.push(command);
    frameState.commandList.push(command);
  }
  // Keep active geometry plus at most 16 MiB of inactive LODs, even after touring the lake.
  const inactive = [];
  let inactiveBytes = 0;
  for (const tile of mesh.tiles) {
    for (const entry of tile.cache) {
      if (entry.lastUsed !== frameState.frameNumber) {
        inactive.push({ tile, entry });
        inactiveBytes += entry.bytes;
      }
    }
  }
  if (inactiveBytes > 16 * 1024 * 1024) {
    inactive.sort((a, b) => a.entry.lastUsed - b.entry.lastUsed);
    for (const { tile, entry } of inactive) {
      if (inactiveBytes <= 16 * 1024 * 1024) {
        break;
      }
      tile.cache.splice(tile.cache.indexOf(entry), 1);
      entry.vertexArray.destroy();
      inactiveBytes -= entry.bytes;
    }
  }
}

function createResources(surface, frameState) {
  const context = frameState.context;
  const curved = surface._gridMesh;
  const geometry = curved
    ? undefined
    : CoplanarPolygonGeometry.createGeometry(
        new CoplanarPolygonGeometry({
          polygonHierarchy: surface._hierarchy,
          vertexFormat: VertexFormat.POSITION_ONLY,
        }),
      );
  if (!curved && !geometry) {
    throw new DeveloperError("The water polygon must have a nonzero area.");
  }
  surface._localBounds = curved ? curved.root.bounds : geometry.boundingSphere;
  if (surface._windWaves && !curved) {
    surface._mesh = new WaterMesh(
      geometry,
      surface._hierarchy,
      surface._meshSpacing,
    );
  }
  surface._pickId = context.createPickId({
    primitive: surface._pickOwner,
    id: surface.id,
  });
  const state = WaterFrame.get(frameState);
  surface._command = new DrawCommand({
    owner: surface,
    vertexArray: curved
      ? undefined
      : VertexArray.fromGeometry({
          context,
          geometry,
          attributeLocations: { position: 0, waveData: 1 },
          bufferUsage: BufferUsage.STATIC_DRAW,
        }),
    shaderProgram: ShaderProgram.fromCache({
      context,
      vertexShaderSource: waterVertex(surface),
      fragmentShaderSource: new ShaderSource({
        defines: waterDefines(surface),
        sources: [
          curvedSurface,
          ray,
          riverFlow,
          optics,
          fieldWaves,
          waterEffects,
          foamMaterial,
          fragment,
        ],
      }),
      attributeLocations: waterAttributes(surface),
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
      u_mediumOptics: () => surface.scattering !== undefined,
      u_scattering: () => surface.scattering ?? Cartesian3.ZERO,
      u_scatteringAnisotropy: () => surface.scatteringAnisotropy,
      u_reflectionColor: () => surface.reflectionColor,
      u_sky: () => surface._sky?.texture ?? context.defaultCubeMap,
      u_hasSky: () => !!surface._sky?.texture,
      u_skyWorldToLocal: () => surface._sky?.worldToLocal ?? Matrix3.IDENTITY,
      u_skyLod: () => surface._sky?.maximumMipmapLevel ?? 0,
      u_radianceScale: () => surface._radianceScale,
      u_roughness: () => surface.roughness,
      u_waveAmplitude: () => surface.waveAmplitude,
      u_waveLength: () => surface.waveLength,
      u_flowDirection: () =>
        surface._windWaves?.windDirection ?? surface.flowDirection,
      u_wavePeriod: () => surface._windWaves.patchLength,
      u_waveResolution: () => surface._windWaves.resolution,
      u_waveLodScale: () => surface._mesh.lodScale,
      u_waterCurvatureRadius: () => surface._gridMesh.radius,
      u_riverTime: () => surface._time % 32,
      u_currentSpeedScale: () => surface._river.currentSpeedScale,
      u_currentRippleLength: () => surface._river.currentRippleLength,
      u_currentRippleAmplitude: () => surface._river.currentRippleAmplitude,
      u_currentFoamIntensity: () => surface._river.currentFoamIntensity,
      u_riverDisplacement0: () =>
        surface._river._waves._state.bands[0].output.getColorTexture(0),
      u_riverDisplacement1: () =>
        surface._river._waves._state.bands[1].output.getColorTexture(0),
      u_displacement0: () =>
        surface._windWaves._state.bands[0].output.getColorTexture(0),
      u_displacement1: () =>
        surface._windWaves._state.bands[1].output.getColorTexture(0),
      u_displacement2: () =>
        surface._windWaves._state.bands[2].output.getColorTexture(0),
      u_waveNormal0: () =>
        surface._windWaves._state.bands[0].output.getColorTexture(1),
      u_waveNormal1: () =>
        surface._windWaves._state.bands[1].output.getColorTexture(1),
      u_waveNormal2: () =>
        surface._windWaves._state.bands[2].output.getColorTexture(1),
      u_time: () =>
        (surface._time * surface.flowSpeed * Math.PI * 2) / surface.waveLength,
      u_foamWidth: () => surface.foamWidth,
      u_foamIntensity: () => surface.foamIntensity,
      u_foamDetail: () => state.foamMaterial?.texture ?? context.defaultTexture,
      u_hasFoamDetail: () => !!state.foamMaterial?.texture,
      u_shoreFoamOffset: () => surface._field?.offset ?? Cartesian2.ZERO,
      u_underwaterDepth: () => surface.underwaterDepth,
      u_cameraDepth: () =>
        surface._underwater?.active ? -surface._underwater.camera.z : 0,
      u_causticsIntensity: () => surface.causticsIntensity,
      u_hasWaterField: () => !!surface._field,
      u_fieldRectangle: () => surface._field?.rectangle ?? Cartesian4.ZERO,
      u_causticsMap: () =>
        surface._field?.caustics?.getColorTexture(0) ?? context.defaultTexture,
      u_shoreFoam: () =>
        surface._field?.foam?.[surface._field.index].getColorTexture(0) ??
        context.defaultTexture,
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
   * Geometry coordinate contract.
   * @memberof SceneGISWaterSurface.prototype
   * @type {string}
   * @readonly
   */
  geometryMode: {
    get() {
      return this._geometryMode;
    },
  },
  /**
   * A snapshot of curved mesh selection and cache statistics; undefined for local water.
   * @memberof SceneGISWaterSurface.prototype
   * @type {SceneGISWaterSurface.MeshStatistics|undefined}
   * @readonly
   */
  statistics: {
    get() {
      return this._gridMesh ? { ...this._gridMesh.statistics } : undefined;
    },
  },
  /**
   *  Borrowed wind simulation; destroy it only after removing its surfaces.
   * @memberof SceneGISWaterSurface.prototype
   * @type {SceneGISWindWaves|undefined}
   * @readonly
   */
  windWaves: {
    get() {
      return this._windWaves;
    },
  },
  /**
   *  Finest grid spacing in meters.
   * @memberof SceneGISWaterSurface.prototype
   * @type {number}
   * @readonly
   */
  meshSpacing: {
    get() {
      return this._meshSpacing;
    },
  },
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
    this._ellipsoidMesh &&
    (!(state.world instanceof Globe) ||
      !Cartesian3.equals(
        state.ellipsoid.radii,
        this._ellipsoidMesh.ellipsoid.radii,
      ))
  ) {
    throw new DeveloperError(
      "Ellipsoid water requires a Globe with the configured ellipsoid.",
    );
  }
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
  if (this._windWaves && frameState.passes.render) {
    this._windWaves._update(frameState);
  }
  if (this._river && frameState.passes.render) {
    this._river._waves._update(
      frameState,
      Math.sqrt(12 / this._river.currentRippleLength),
    );
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
    const foamEnabled =
      (this.foamIntensity > 0 && this.foamWidth > 0) ||
      this._windWaves?.whitecapIntensity > 0 ||
      this._river?.currentFoamIntensity > 0;
    if (foamEnabled) {
      state.foamMaterial ??= new WaterFoam(state.requestRender);
      state.foamMaterial.update(c);
    }
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
      source.defines.push(...waterDefines(this));
      source.sources.push(
        curvedSurface,
        ray,
        riverFlow,
        optics,
        fieldWaves,
        waterEffects,
        foamMaterial,
        fragment,
      );
      const previous = command.shaderProgram;
      command.shaderProgram = ShaderProgram.fromCache({
        context: c,
        vertexShaderSource: waterVertex(this),
        fragmentShaderSource: source,
        attributeLocations: waterAttributes(this),
      });
      previous.destroy();
      this._lightingMode = lightingMode;
    }
    if (this.underwaterDepth > 0) {
      this._underwater ??= new Underwater(this._hierarchy);
    }
    this._underwater?.update(this, frameState);
    this._field?.update(this, frameState);
    state.surfaces.push(this);
  }
  if (this._gridMesh) {
    this._gridMesh.update(this, frameState);
  } else if (this._mesh) {
    updateTiles(this, frameState);
  } else {
    frameState.commandList.push(command);
  }
};

/**
 *  @returns {boolean} Whether this surface has been destroyed.
 */
SceneGISWaterSurface.prototype.isDestroyed = function () {
  return false;
};

/**
 * Releases the surface geometry, shaders and pick ID. Shared Scene inputs are not owned here.
 * @returns {undefined}
 */
SceneGISWaterSurface.prototype.destroy = function () {
  this._underwater?.destroy();
  this._field?.destroy();
  this._gridMesh?.destroy();
  if (this._mesh) {
    for (const tile of this._mesh.tiles) {
      for (const entry of tile.cache) {
        entry.vertexArray.destroy();
      }
    }
  }
  this._command?.vertexArray?.destroy();
  this._command?.shaderProgram.destroy();
  this._pickId?.destroy();
  return destroyObject(this);
};
/**
 * Curved-water mesh statistics from the most recent render update. Counts start at zero
 * before the first update, except for the single CPU root. Byte counts exclude FFT and
 * Scene-owned capture textures. A pick pass does not change this snapshot.
 * @typedef {object} SceneGISWaterSurface.MeshStatistics
 * @property {number} visitedTiles Number of CPU nodes considered in selection.
 * @property {number} selectedTiles Number of visible mesh draw commands.
 * @property {boolean} budgetLimited Whether the leaf budget prevented further refinement.
 * @property {number} cachedTiles Retained CPU nodes, including nodes without a GPU mesh.
 * @property {number} geometryBytes Total retained GPU mesh bytes.
 * @property {number} inactiveGeometryBytes GPU bytes not drawn in the last update, capped at 16 MiB.
 * @property {number} triangles Number of selected triangles.
 * @property {number} geometryBuilds Number of GPU meshes built in the last update.
 */
/**
 * Immutable local bathymetry. Depths are positive below the mean plane, zero at the
 * shoreline and negative on dry land. Grid vertices span rectangle edges; rows run
 * from minimum to maximum local Y. Data is copied, and GPU resources belong to the surface.
 * @typedef {object} SceneGISWaterSurface.Bathymetry
 * @property {BoundingRectangle} rectangle Local XY footprint in meters.
 * @property {number} width Grid columns, integer in [2, 1024].
 * @property {number} height Grid rows, integer in [2, 1024].
 * @property {Float32Array} depths Row-major signed water depths, width * height entries.
 */
export default SceneGISWaterSurface;
