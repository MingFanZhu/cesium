import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Matrix4 from "../../Core/Matrix4.js";
import PrimitiveType from "../../Core/PrimitiveType.js";
import BlendingState from "../../Scene/BlendingState.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import Buffer from "../../Renderer/Buffer.js";
import BufferUsage from "../../Renderer/BufferUsage.js";
import DrawCommand from "../../Renderer/DrawCommand.js";
import Pass from "../../Renderer/Pass.js";
import RenderState from "../../Renderer/RenderState.js";
import ShaderProgram from "../../Renderer/ShaderProgram.js";
import ShaderSource from "../../Renderer/ShaderSource.js";
import VertexArray from "../../Renderer/VertexArray.js";
import sampling from "./SceneGISWindFieldSampling.js";
import model from "../Core/_private/_SceneGISWindModel.js";
import display from "../../Shaders/SceneGIS/Wind/SceneGISWindDisplay.js";
import volume from "../../Shaders/SceneGIS/Wind/SceneGISWindVolume.js";
import vertex from "../../Shaders/SceneGIS/Wind/SceneGISWindStreamlineVS.js";
import fragment from "../../Shaders/SceneGIS/Wind/SceneGISWindStreamlineFS.js";

function validate(v) {
  if (
    typeof v.show !== "boolean" ||
    typeof v.showStreamlines !== "boolean" ||
    !["volume", "slice", "none"].includes(v.mode) ||
    !["speed", "concentration"].includes(v.colorBy) ||
    !Number.isFinite(v.colorMaximum) ||
    v.colorMaximum <= 0 ||
    !Number.isFinite(v.extinction) ||
    v.extinction < 0 ||
    !Number.isFinite(v.sliceHeight)
  ) {
    throw new DeveloperError("Invalid wind display controls.");
  }
}
function release(v) {
  if (v._stage && !v._scene.isDestroyed()) {
    v._scene.postProcessStages.remove(v._stage);
  } else if (v._stage && !v._stage.isDestroyed()) {
    v._stage.destroy();
  }
  v._stage = undefined;
  v._command?.shaderProgram.destroy();
  v._array?.destroy();
  v._command = v._array = undefined;
}
function create(v, context, field) {
  const n = field.dimensions,
    dx = field.cellSize,
    min = field.minimum;
  const uniforms = {
    ...sampling.createUniformMap(field),
    u_colorMaximum: () => v.colorMaximum,
    u_colorConcentration: () => v.colorBy === "concentration",
    u_eyeToLocal: () => v._eyeToLocal,
    u_extinction: () => v.extinction,
    u_slice: () => v.mode === "slice",
    u_sliceHeight: () => v.sliceHeight,
    u_lineStep: () => dx * 0.5,
  };
  const seedList =
    v._seeds ??
    Array.from(
      { length: 32 },
      (_, i) =>
        new Cartesian3(
          min.x + dx * 1.5,
          min.y + (((i % 8) + 0.5) * n.y * dx) / 8,
          min.z + ((Math.floor(i / 8) + 0.5) * n.z * dx) / 4,
        ),
    );
  const seedData = new Float32Array(seedList.length * 3);
  seedList.forEach((p, i) => Cartesian3.pack(p, seedData, i * 3));
  const steps = new Float32Array(v._segments * 2);
  for (let i = 0; i < v._segments; i++) {
    steps[2 * i] = i;
    steps[2 * i + 1] = i + 1;
  }
  const buffers = [];
  try {
    buffers.push(
      Buffer.createVertexBuffer({
        context,
        typedArray: steps,
        usage: BufferUsage.STATIC_DRAW,
      }),
    );
    buffers.push(
      Buffer.createVertexBuffer({
        context,
        typedArray: seedData,
        usage: BufferUsage.STATIC_DRAW,
      }),
    );
    v._array = new VertexArray({
      context,
      attributes: [
        {
          index: 0,
          vertexBuffer: buffers[0],
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 1,
        },
        {
          index: 1,
          vertexBuffer: buffers[1],
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          instanceDivisor: 1,
        },
      ],
    });
    v._command = new DrawCommand({
      owner: v,
      vertexArray: v._array,
      count: steps.length,
      instanceCount: seedList.length,
      primitiveType: PrimitiveType.LINES,
      pass: Pass.TRANSLUCENT,
      shaderProgram: ShaderProgram.fromCache({
        context,
        vertexShaderSource: new ShaderSource({
          sources: [sampling.shaderSource, display, vertex],
        }),
        fragmentShaderSource: fragment,
        attributeLocations: { a_step: 0, a_seed: 1 },
      }),
      uniformMap: uniforms,
      modelMatrix: field.modelMatrix,
      boundingVolume: new BoundingSphere(),
      renderState: RenderState.fromCache({
        depthTest: { enabled: true },
        depthMask: false,
        blending: BlendingState.ALPHA_BLEND,
      }),
    });
    void v._command.shaderProgram.allUniforms;
    v._stage = v._scene.postProcessStages.add(
      new PostProcessStage({
        fragmentShader: [sampling.shaderSource, display, volume].join("\n"),
        uniforms,
      }),
    );
    const size = Cartesian3.multiplyByScalar(n, dx, new Cartesian3());
    v._bounds = new BoundingSphere(
      Cartesian3.add(
        min,
        Cartesian3.multiplyByScalar(size, 0.5, new Cartesian3()),
        new Cartesian3(),
      ),
      Cartesian3.magnitude(size) * 0.5,
    );
  } catch (error) {
    if (!v._array) {
      buffers.forEach((b) => b.destroy());
    }
    release(v);
    throw error;
  }
}

/**
 * GPU wind volume, horizontal tracer slice and instantaneous streamlines. Add to Scene.primitives
 * after the simulation. It owns one post-process stage and line resources, never the simulation.
 * Volume/slice alpha derives only from computed dimensionless tracer. Color may show speed or tracer.
 * Opaque buildings/terrain terminate volume rays; transparent surfaces do not occlude this post stage.
 * Streamlines follow the current field with midpoint integration at half-cell arclength, terminating
 * at solids/domain limits. They are not particle trajectories or extra turbulence.
 * No wall-clock animation or field stepping occurs here. Destroy this consumer before the producer.
 * @alias SceneGISWindVisualization
 * @constructor
 * @param {object} options Configuration.
 * @param {Scene} options.scene Scene owning the post-process collection.
 * @param {SceneGISWindSimulation} options.simulation Ready or pending field producer.
 * @param {boolean} [options.show=true] Display enabled.
 * @param {string} [options.mode="volume"] "volume", "slice" or "none".
 * @param {boolean} [options.showStreamlines=true] Show instantaneous lines.
 * @param {string} [options.colorBy="speed"] "speed" or "concentration".
 * @param {number} [options.colorMaximum=10] Color scale maximum, m/s or tracer units.
 * @param {number} [options.extinction=0.15] Visual opacity coefficient per meter per tracer unit.
 * @param {number} [options.sliceHeight=4] Simulation-local horizontal slice Z in meters.
 * @param {Cartesian3[]} [options.streamlineSeeds] 1..256 local-meter seeds, copied; default 32 on the minimum-X side.
 * @param {number} [options.streamlineSegments=64] 1..64 half-cell segments, construction snapshot.
 * @experimental This API is subject to change during urban-flow qualification.
 */
function SceneGISWindVisualization(options) {
  if (!options?.scene || !options.simulation) {
    throw new DeveloperError("scene and simulation are required.");
  }
  this._scene = options.scene;
  this._simulation = options.simulation;
  /** @type {boolean} */ this.show = options.show ?? true;
  /** @type {string} */ this.mode = options.mode ?? "volume";
  /** @type {boolean} */ this.showStreamlines = options.showStreamlines ?? true;
  /** @type {string} */ this.colorBy = options.colorBy ?? "speed";
  /** @type {number} */ this.colorMaximum = options.colorMaximum ?? 10;
  /** @type {number} */ this.extinction = options.extinction ?? 0.15;
  /** @type {number} */ this.sliceHeight = options.sliceHeight ?? 4;
  this._segments = options.streamlineSegments ?? 64;
  if (
    !Number.isInteger(this._segments) ||
    this._segments < 1 ||
    this._segments > 64
  ) {
    throw new DeveloperError("streamlineSegments must be an integer 1..64.");
  }
  if (options.streamlineSeeds !== undefined) {
    if (
      !Array.isArray(options.streamlineSeeds) ||
      options.streamlineSeeds.length < 1 ||
      options.streamlineSeeds.length > 256
    ) {
      throw new DeveloperError(
        "streamlineSeeds must contain 1..256 positions.",
      );
    }
    this._seeds = options.streamlineSeeds.map((p) => {
      model.finiteVector("streamline seed", p);
      return Cartesian3.clone(p);
    });
  }
  this._eyeToLocal = new Matrix4();
  this._inverseModel = new Matrix4();
  this._stage = this._command = this._array = undefined;
  validate(this);
}
/** @private */
SceneGISWindVisualization.prototype.update = function (frameState) {
  if (!frameState.passes.render) {
    return;
  }
  validate(this);
  const field = this._simulation.getGpuField();
  if (!field) {
    return;
  }
  if (
    frameState.context !== this._scene.context ||
    field.contextId !== frameState.context.id
  ) {
    throw new DeveloperError(
      "Wind producer and visualization must belong to the same Scene context.",
    );
  }
  if (!this._command) {
    create(this, frameState.context, field);
  }
  Matrix4.inverseTransformation(field.modelMatrix, this._inverseModel);
  Matrix4.multiply(
    this._inverseModel,
    this._scene.camera.inverseViewMatrix,
    this._eyeToLocal,
  );
  this._stage.enabled = this.show && this.mode !== "none";
  if (this.show && this.showStreamlines) {
    this._command.modelMatrix = field.modelMatrix;
    BoundingSphere.transform(
      this._bounds,
      field.modelMatrix,
      this._command.boundingVolume,
    );
    frameState.commandList.push(this._command);
  }
};
/** @returns {boolean} Whether destroyed. */
SceneGISWindVisualization.prototype.isDestroyed = function () {
  return false;
};
/** @returns {undefined} Releases only owned display resources. */
SceneGISWindVisualization.prototype.destroy = function () {
  release(this);
  return destroyObject(this);
};
export default SceneGISWindVisualization;
