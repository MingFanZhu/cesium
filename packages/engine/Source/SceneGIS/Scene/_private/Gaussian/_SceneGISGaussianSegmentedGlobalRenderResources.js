/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import ComponentDatatype from "../../../../Core/ComponentDatatype.js";
import DeveloperError from "../../../../Core/DeveloperError.js";
import Geometry from "../../../../Core/Geometry.js";
import GeometryAttribute from "../../../../Core/GeometryAttribute.js";
import PrimitiveType from "../../../../Core/PrimitiveType.js";
import BufferUsage from "../../../../Renderer/BufferUsage.js";
import DrawCommand from "../../../../Renderer/DrawCommand.js";
import Pass from "../../../../Renderer/Pass.js";
import RenderState from "../../../../Renderer/RenderState.js";
import ShaderBuilder from "../../../../Renderer/ShaderBuilder.js";
import ShaderDestination from "../../../../Renderer/ShaderDestination.js";
import VertexArray from "../../../../Renderer/VertexArray.js";
import GaussianStreamFS from "../../../../Shaders/SceneGIS/Gaussian/SceneGISGaussianStreamFS.js";
import GaussianStreamVS from "../../../../Shaders/SceneGIS/Gaussian/SceneGISGaussianStreamVS.js";
import GaussianVideo from "./_SceneGISGaussianVideo.js";
import BlendingState from "../../../../Scene/BlendingState.js";

/** Shared off-route renderer for exactly one global DrawCommand. @private */
export default class _SceneGISGaussianSegmentedGlobalRenderResources {
  constructor(options = {}) {
    const frameState = options.frameState;
    const primitive = options.primitive;
    if (!frameState?.context || !primitive) {
      throw new DeveloperError("Segmented global render options are invalid");
    }
    this._primitive = primitive;
    this._buildShaderProgram = options.buildShaderProgram;
    this._createVertexArray = options.createVertexArray;
    this._shaderProgram = undefined;
    this._videoPrograms = new Map();
    this._vertexArray = undefined;
    this._destroyed = false;
    this._destroyCursor = 0;
    this._constructionError = undefined;
    this._constructionCleanupCursor = 0;
    try {
      const builder = new ShaderBuilder();
      builder.addDefine("GAUSSIAN_STREAM_SPLATS", "1", ShaderDestination.BOTH);
      builder.addDefine(
        "GAUSSIAN_SEGMENTED_GLOBAL",
        "1",
        ShaderDestination.BOTH,
      );
      builder.setPositionAttribute("vec2", "a_screenQuadPosition");
      builder.addVarying("vec4", "v_splatColor");
      builder.addVarying("vec2", "v_vertPos");
      builder.addVarying("vec2", "v_tileCropPosition");
      builder.addVarying("float", "v_adjustedStdDev", "flat");
      builder.addVarying("vec4", "v_globalCropBounds", "flat");
      for (const name of ["u_coreTexture", "u_shTexture"]) {
        builder.addUniform(
          "highp usampler2DArray",
          name,
          ShaderDestination.VERTEX,
        );
      }
      for (const name of ["u_renderIndices", "u_ordering"]) {
        builder.addUniform("highp usampler2D", name, ShaderDestination.VERTEX);
      }
      builder.addUniform(
        "highp sampler2D",
        "u_globalCropTexture",
        ShaderDestination.VERTEX,
      );
      builder.addUniform("int", "u_globalShDegree", ShaderDestination.VERTEX);
      builder.addUniform("vec3", "u_viewOriginLocal", ShaderDestination.VERTEX);
      builder.addUniform(
        "vec3",
        "u_sourceRenderToViewPosition",
        ShaderDestination.VERTEX,
      );
      builder.addUniform(
        "vec4",
        "u_sourceRenderToViewQuaternion",
        ShaderDestination.VERTEX,
      );
      builder.addUniform("vec4", "u_color", ShaderDestination.VERTEX);
      builder.addUniform("vec4", "u_renderTuning0", ShaderDestination.BOTH);
      builder.addUniform("vec4", "u_renderTuning1", ShaderDestination.VERTEX);
      builder.addUniform("float", "u_falloff", ShaderDestination.FRAGMENT);
      this._videoBuilder = builder.clone();
      this._context = frameState.context;
      builder.addVertexLines(GaussianStreamVS);
      builder.addFragmentLines(GaussianStreamFS);
      this._shaderProgram = this._buildShaderProgram
        ? this._buildShaderProgram(builder, frameState.context)
        : builder.buildShaderProgram(frameState.context);
      const geometry = new Geometry({
        attributes: {
          screenQuadPosition: new GeometryAttribute({
            componentDatatype: ComponentDatatype.FLOAT,
            componentsPerAttribute: 2,
            values: [-1, -1, 1, -1, 1, 1, -1, 1],
          }),
        },
        primitiveType: PrimitiveType.TRIANGLE_STRIP,
      });
      const vertexOptions = {
        context: frameState.context,
        geometry,
        attributeLocations: { screenQuadPosition: 0 },
        bufferUsage: BufferUsage.STATIC_DRAW,
        interleave: false,
      };
      this._vertexArray = this._createVertexArray
        ? this._createVertexArray(vertexOptions)
        : VertexArray.fromGeometry(vertexOptions);
      this._renderState = RenderState.fromCache({
        depthTest: { enabled: true, func: 0x0203 },
        depthMask: false,
        blending: BlendingState.PRE_MULTIPLIED_ALPHA_BLEND,
        cull: { enabled: false },
      });
    } catch (error) {
      this._constructionError = error;
      try {
        this._settleConstructionCleanup();
      } catch (cleanupError) {
        this._constructionCleanupError = cleanupError;
      }
    }
  }

  _settleConstructionCleanup() {
    const resources = [this._vertexArray, this._shaderProgram];
    while (this._constructionCleanupCursor < resources.length) {
      const resource = resources[this._constructionCleanupCursor];
      if (
        resource &&
        (typeof resource.isDestroyed !== "function" || !resource.isDestroyed())
      ) {
        resource.destroy();
      }
      this._constructionCleanupCursor++;
    }
    return true;
  }

  createCommand(resources, boundingVolume) {
    if (
      this._destroyed ||
      this._constructionError ||
      !resources ||
      !Number.isSafeInteger(resources.selectedSplatCount) ||
      resources.selectedSplatCount < 1 ||
      !boundingVolume
    ) {
      throw new DeveloperError("Segmented global command authority is invalid");
    }
    const primitive = this._primitive;
    const uniformMap = {
      u_coreTexture: () => resources.coreTexture,
      u_shTexture: () => resources.shTexture ?? resources.coreTexture,
      u_renderIndices: () => resources.mappingTexture,
      u_ordering: () => resources.orderingTexture,
      u_globalCropTexture: () => resources.cropTexture,
      u_globalShDegree: () => primitive._maxShDegree ?? 0,
      u_viewOriginLocal: () => primitive._viewOriginLocal,
      u_sourceRenderToViewPosition: () => primitive._sourceRenderToViewPosition,
      u_sourceRenderToViewQuaternion: () =>
        primitive._sourceRenderToViewQuaternion,
      u_color: () => primitive._color,
      u_renderTuning0: () => primitive._renderTuning0,
      u_renderTuning1: () => primitive._renderTuning1,
      u_falloff: () => primitive._falloff,
      ...GaussianVideo.uniforms(primitive, this._context),
    };
    const command = new DrawCommand({
      modelMatrix: primitive._effectiveModelMatrix,
      vertexArray: this._vertexArray,
      shaderProgram: this._shaderProgram,
      uniformMap,
      renderState: this._renderState,
      pass: Pass.GAUSSIAN_SPLATS,
      count: 4,
      instanceCount: resources.selectedSplatCount,
      primitiveType: PrimitiveType.TRIANGLE_STRIP,
      owner: primitive,
      boundingVolume,
      cull: true,
      occlude: false,
    });

    return command;
  }

  getVideoProgram(mode) {
    if (mode === "base") {
      return this._shaderProgram;
    }
    if (!this._videoPrograms.has(mode)) {
      const builder = this._videoBuilder.clone();
      GaussianVideo.configure(builder, mode === "depth");
      builder.addVertexLines(GaussianStreamVS);
      builder.addFragmentLines(GaussianStreamFS);
      this._videoPrograms.set(mode, builder.buildShaderProgram(this._context));
    }
    return this._videoPrograms.get(mode);
  }

  destroy() {
    if (this._destroyed) {
      return false;
    }
    for (const [mode, program] of this._videoPrograms) {
      program.destroy();
      this._videoPrograms.delete(mode);
    }
    if (this._constructionError) {
      this._settleConstructionCleanup();
      this._destroyed = true;
      return true;
    }
    if (this._destroyCursor === 0) {
      if (
        this._vertexArray &&
        (typeof this._vertexArray.isDestroyed !== "function" ||
          !this._vertexArray.isDestroyed())
      ) {
        this._vertexArray.destroy();
      }
      this._destroyCursor++;
    }
    if (this._destroyCursor === 1) {
      if (
        this._shaderProgram &&
        (typeof this._shaderProgram.isDestroyed !== "function" ||
          !this._shaderProgram.isDestroyed())
      ) {
        this._shaderProgram.destroy();
      }
      this._destroyCursor++;
    }
    this._destroyed = true;
    return true;
  }

  get statistics() {
    return Object.freeze({
      sharedShaderCount: this._destroyed ? 0 : 1 + this._videoPrograms.size,
      drawCommandCount: 0,
      destroyed: this._destroyed,
    });
  }
}
