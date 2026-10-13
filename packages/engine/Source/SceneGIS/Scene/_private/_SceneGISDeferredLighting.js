import Color from "../../../Core/Color.js";
import combine from "../../../Core/combine.js";
import destroyObject from "../../../Core/destroyObject.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderBuilder from "../../../Renderer/ShaderBuilder.js";
import ShaderDestination from "../../../Renderer/ShaderDestination.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import ImageBasedLightingPipelineStage from "../../../Scene/Model/ImageBasedLightingPipelineStage.js";
import LightingPipelineStage from "../../../Scene/Model/LightingPipelineStage.js";
import LightingModel from "../../../Scene/Model/LightingModel.js";
import capture from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredCapture.js";
import inputs from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredInputs.js";
import lighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredLighting.js";
import indirect from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOMain.js";
import depth from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";
import common from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOCommon.js";
import GBuffer from "./_SceneGISGBuffer.js";
import LightingMrt from "./_SceneGISLightingMrt.js";
import LocalLights from "./_SceneGISLocalLights.js";
import SurfaceWeather from "./_SceneGISSurfaceWeather.js";

const opaquePasses = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
const lightingDefine =
  /^(LIGHTING_|HAS_NORMALS$|USE_IBL_LIGHTING$|USE_CUSTOM_LIGHT_COLOR$|DIFFUSE_IBL$|SPECULAR_IBL$|CUSTOM_SPHERICAL_HARMONICS$|CUSTOM_SPECULAR_IBL$|SCENEGIS_MODEL_|SCENEGIS_SKY_REFLECTIONS$|SCENEGIS_GLOBE$)/;

function eligible(command) {
  return command.owner?._sceneGISWater !== true;
}

function shaderInfo(renderer, command) {
  const shader = command.shaderProgram;
  let info = renderer._shaders.get(shader);
  if (!info) {
    const fs = shader.fragmentShaderSource;
    info = {
      model: fs.sources.some((source) =>
        source.includes("SCENEGIS_GBUFFER_MODEL"),
      ),
      key: fs.defines.filter((define) => lightingDefine.test(define)).join(";"),
    };
    renderer._shaders.set(shader, info);
  }
  return info;
}

function sharedState(scene) {
  return [
    scene._sceneGISScreenSpaceReflections?._state,
    scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion,
    scene._sceneGISScreenSpaceIndirectLighting?._state,
  ].find((state) => state?.mainActive);
}

function release(renderer) {
  renderer._framebuffer?.destroy();
  renderer._framebuffer = undefined;
  renderer._raw?.destroy();
  renderer._raw = undefined;
  renderer._depth?.destroy();
  renderer._depth = undefined;
  renderer._copyDepth?.shaderProgram.destroy();
  renderer._copyDepth = undefined;
  renderer._waterColor?.destroy();
  renderer._waterColor = undefined;
  renderer._copyWater?.shaderProgram.destroy();
  renderer._copyWater = undefined;
  renderer._waterReady = false;
  for (const groups of renderer._models.values()) {
    for (const group of groups.values()) {
      group.command.shaderProgram.destroy();
    }
  }
  renderer._models.clear();
  renderer._groups.length = 0;
  renderer._commands = new WeakMap();
  renderer._passthrough?.command.shaderProgram.destroy();
  renderer._passthrough = undefined;
  renderer._active = renderer._ready = false;
  renderer.byteLength = 0;
}

function allocate(renderer, manager) {
  const { context, frameState } = renderer._scene;
  const width = context.drawingBufferWidth;
  const height = context.drawingBufferHeight;
  renderer._raw ??= new FramebufferManager({
    colorAttachmentsLength: 4,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
  });
  renderer._depth ??= new FramebufferManager({
    pixelFormat: PixelFormat.RED,
    pixelDatatype: PixelDatatype.FLOAT,
  });
  const source = manager.framebuffer;
  if (renderer._raw.isDirty(width, height, 1) || renderer._source !== source) {
    renderer._framebuffer?.destroy();
    renderer._raw.update(context, width, height);
    renderer._framebuffer = new Framebuffer({
      context,
      colorTextures: [0, 1, 2, 3].map((i) => renderer._raw.getColorTexture(i)),
      depthStencilTexture: source.depthStencilTexture,
      destroyAttachments: false,
    });
    renderer._source = source;
  }
  renderer._depth.update(context, width, height);
  renderer.byteLength = width * height * 36;
  const logDepth = frameState.useLogDepth;
  if (!renderer._copyDepth || renderer._logDepth !== logDepth) {
    renderer._copyDepth?.shaderProgram.destroy();
    renderer._copyDepth = context.createViewportQuadCommand(
      new ShaderSource({
        defines: logDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
        sources: [depth],
      }),
      { uniformMap: { u_depth: () => renderer._source.depthStencilTexture } },
    );
    renderer._logDepth = logDepth;
  }
}

function createGroup(renderer, model, key) {
  const scene = renderer._scene;
  const builder = new ShaderBuilder();
  const fragment = ShaderDestination.FRAGMENT;
  builder.setPositionAttribute("vec4", "position");
  builder.addVertexLines("void main() { gl_Position = position; }");
  builder.addDefine("HDR", undefined, fragment);
  builder.addDefine("SCENEGIS_DEFERRED_LIGHTING", undefined, fragment);
  builder.addDefine("SCENEGIS_GEOMETRY_SHADOW", undefined, fragment);
  builder.addFragmentLines([inputs, common]);
  if (model) {
    const resources = {
      model,
      shaderBuilder: builder,
      uniformMap: {},
      lightingOptions: {
        lightingModel: key.includes("LIGHTING_PBR")
          ? LightingModel.PBR
          : LightingModel.UNLIT,
      },
    };
    if (key.includes("HAS_NORMALS")) {
      builder.addDefine("HAS_NORMALS", undefined, fragment);
    }
    if (key.includes("USE_IBL_LIGHTING")) {
      ImageBasedLightingPipelineStage.process(
        resources,
        model,
        scene.frameState,
      );
    }
    LightingPipelineStage.process(resources, undefined, scene.frameState);
  } else {
    builder.addDefine("SCENEGIS_DEFERRED_PASSTHROUGH", undefined, fragment);
  }
  builder.addFragmentLines(lighting);
  const group = { id: -1, seen: false, sourceUniforms: undefined };
  group.uniforms = {
    u_sceneGISDeferredDiffuse: () => renderer._raw.getColorTexture(0),
    u_sceneGISDeferredNormal: () => renderer._raw.getColorTexture(1),
    u_sceneGISDeferredSpecular: () => renderer._raw.getColorTexture(2),
    u_sceneGISDeferredEmission: () => renderer._raw.getColorTexture(3),
    u_linearDepth: () => renderer._depth.getColorTexture(),
    u_sceneGISDeferredGroup: () => group.id,
  };
  group.command = new DrawCommand({
    owner: renderer,
    vertexArray: scene.context.getViewportQuadVertexArray(),
    primitiveType: PrimitiveType.TRIANGLES,
    shaderProgram: builder.buildShaderProgram(scene.context),
    uniformMap: group.uniforms,
    renderState: RenderState.fromCache({ depthMask: false }),
    pass: Pass.OPAQUE,
  });
  return group;
}

function prepareGroups(renderer, range) {
  for (const groups of renderer._models.values()) {
    for (const group of groups.values()) {
      group.seen = false;
    }
  }
  renderer._groups.length = 0;
  renderer._hasPassthrough = false;
  for (const pass of opaquePasses) {
    for (let i = 0; i < range.indices[pass]; ++i) {
      const command = range.commands[pass][i];
      if (!eligible(command)) {
        continue;
      }
      const info = shaderInfo(renderer, command);
      if (!info.model) {
        renderer._hasPassthrough = true;
        continue;
      }
      const model = command.owner;
      let groups = renderer._models.get(model);
      if (!groups) {
        groups = new Map();
        renderer._models.set(model, groups);
      }
      const key = info.key;
      let group = groups.get(key);
      if (!group) {
        group = createGroup(renderer, model, key);
        groups.set(key, group);
      }
      if (group.seen) {
        continue;
      }
      group.seen = true;
      group.id = renderer._groups.length + 1;
      if (group.id > 2048) {
        throw new DeveloperError(
          "Deferred lighting exceeds the exact half-float group capacity (2048).",
        );
      }
      if (group.sourceUniforms !== command.uniformMap) {
        group.sourceUniforms = command.uniformMap;
        group.command.uniformMap = combine(group.uniforms, command.uniformMap);
      }
      renderer._groups.push(group);
    }
  }
  for (const [model, groups] of renderer._models) {
    for (const [key, group] of groups) {
      if (!group.seen) {
        group.command.shaderProgram.destroy();
        groups.delete(key);
      }
    }
    if (groups.size === 0) {
      renderer._models.delete(model);
    }
  }
  if (renderer._hasPassthrough) {
    renderer._passthrough ??= createGroup(renderer);
  }
  renderer.groupCount = renderer._groups.length;
}

/** Private native-material lighting experiment, with no public selection API. @private */
class _SceneGISDeferredLighting {
  constructor(scene) {
    if (!scene || scene.isDestroyed() || scene._sceneGISDeferred) {
      throw new DeveloperError(
        "Deferred lighting requires an unbound live Scene.",
      );
    }
    this._scene = scene;
    this._enabled = this._active = this._ready = false;
    this._models = new Map();
    this._groups = [];
    this._commands = new WeakMap();
    this._shaders = new WeakMap();
    this._clear = new ClearCommand({ color: Color.TRANSPARENT });
    this.drawCount =
      this.groupCount =
      this.lightDrawCount =
      this.byteLength =
        0;
    scene._sceneGISDeferred = this;
  }

  get enabled() {
    return this._enabled;
  }
  set enabled(value) {
    if (typeof value !== "boolean") {
      throw new DeveloperError("enabled must be boolean.");
    }
    this._enabled = value;
    if (!value) {
      release(this);
    }
    this._scene.requestRender();
  }
  get ready() {
    return this._enabled && this._ready;
  }

  begin(passState) {
    this._active = this._ready = this._waterReady = false;
    this.drawCount = this.lightDrawCount = this.groupCount = 0;
    if (!this.enabled || !this._scene.frameState.passes.render) {
      return;
    }
    const scene = this._scene;
    if (scene.msaaSamples > 1) {
      throw new DeveloperError(
        "Deferred lighting requires msaaSamples = 1. Select TAA or FXAA explicitly.",
      );
    }
    if (scene._sceneGISGBuffer?.enabled) {
      throw new DeveloperError(
        "Disable diagnostic G-buffer replay before enabling deferred lighting.",
      );
    }
    const range = scene._view.frustumCommandsList[0];
    if (!range) {
      release(this);
      return;
    }
    GBuffer._validate(scene, range, passState);
    const layout = LightingMrt.layout(
      scene,
      passState,
      eligible,
      scene._sceneGISScreenSpaceReflections?.enabled === true,
    );
    if (!layout || scene.shadowMap.debugCascadeColors) {
      throw new DeveloperError(
        "Deferred lighting requires a supported opaque lighting layout without cascade debug tint.",
      );
    }
    allocate(this, layout.manager);
    prepareGroups(this, range);
    const original = passState.framebuffer;
    try {
      // Clear owned colors only; native Scene owns the shared depth clear.
      passState.framebuffer = this._raw.framebuffer;
      this._clear.execute(scene.context, passState);
    } finally {
      passState.framebuffer = original;
    }
    this._active = true;
  }

  draw(command, passState) {
    const scene = this._scene;
    const passes = scene.frameState.passes;
    if (
      !this._active ||
      !passes.render ||
      passes.pick ||
      passes.depth ||
      passes.pickVoxel ||
      !opaquePasses.includes(command.pass) ||
      !eligible(command)
    ) {
      return false;
    }
    const info = shaderInfo(this, command);
    const model = info.model;
    const group = model
      ? this._models.get(command.owner).get(info.key)
      : undefined;
    if (
      scene.frameState.shadowState.lightShadowsEnabled &&
      command.receiveShadows &&
      command.derivedCommands.shadows
    ) {
      command = command.derivedCommands.shadows.receiveCommand;
    }
    if (!model) {
      command = LocalLights.receiver(scene, command);
    }
    command = SurfaceWeather.receiver(scene, command);
    const shader = command.shaderProgram;
    let cached = this._commands.get(command);
    if (
      !cached ||
      cached.shader !== shader ||
      cached.sourceUniforms !== command.uniformMap
    ) {
      const name = "sceneGIS_deferred_material";
      let program = scene.context.shaderCache.getDerivedShaderProgram(
        shader,
        name,
      );
      if (!program) {
        const fs = shader.fragmentShaderSource.clone();
        if (model) {
          fs.defines.push(
            "SCENEGIS_GBUFFER_MODEL_CAPTURE",
            "SCENEGIS_DEFERRED_CAPTURE",
          );
        } else {
          fs.defines.push("SCENEGIS_AO_MAIN", "SCENEGIS_AO_LOCATION 2");
          fs.sources.unshift(indirect);
        }
        fs.sources = fs.sources.map((source) =>
          ShaderSource.replaceMain(source, "sceneGISDeferredMaterialMain"),
        );
        fs.sources.push(capture);
        fs.sources.push(
          "void main() { sceneGISDeferredMaterialMain(); sceneGISWriteDeferredMaterial(); }",
        );
        program = scene.context.shaderCache.createDerivedShaderProgram(
          shader,
          name,
          {
            vertexShaderSource: shader.vertexShaderSource,
            fragmentShaderSource: fs,
            attributeLocations: shader._attributeLocations,
          },
        );
      }
      cached = {
        shader,
        sourceUniforms: command.uniformMap,
        uniformMap: combine(
          { u_sceneGISDeferredGroup: () => cached.group.id },
          command.uniformMap,
        ),
        command: new DrawCommand(),
        program,
      };
      this._commands.set(command, cached);
    }
    cached.group = group ?? this._passthrough;
    const derived = DrawCommand.shallowClone(command, cached.command);
    derived.shaderProgram = cached.program;
    derived.uniformMap = cached.uniformMap;
    derived.framebuffer = this._framebuffer;
    derived.execute(scene.context, passState);
    ++this.drawCount;
    return true;
  }

  light(passState) {
    if (!this._active) {
      return;
    }
    const scene = this._scene;
    const original = passState.framebuffer;
    const pass = scene.context.uniformState.pass;
    try {
      passState.framebuffer = this._depth.framebuffer;
      this._copyDepth.execute(scene.context, passState);
      passState.framebuffer = original;
      const shared = sharedState(scene);
      scene.context.uniformState.updatePass(Pass.OPAQUE);
      const draw = (group) => {
        let command = LocalLights.receiver(scene, group.command);
        if (shared) {
          command = LightingMrt.command(scene, shared, command);
        }
        command.execute(scene.context, passState);
        ++this.lightDrawCount;
      };
      if (this._hasPassthrough) {
        draw(this._passthrough);
      }
      for (const group of this._groups) {
        draw(group);
      }
      if (!shared && scene.frameState._sceneGISWater.surfaces.length > 0) {
        this._waterColor ??= new FramebufferManager({
          pixelDatatype: PixelDatatype.HALF_FLOAT,
        });
        this._waterColor.update(
          scene.context,
          scene.drawingBufferWidth,
          scene.drawingBufferHeight,
        );
        this._copyWater ??= scene.context.createViewportQuadCommand(
          "uniform sampler2D u_color; uniform sampler2D u_depth; void main() { ivec2 p=ivec2(gl_FragCoord.xy); out_FragColor=texelFetch(u_depth,p,0).r>0.0 ? vec4(texelFetch(u_color,p,0).rgb,1.0) : vec4(0.0); }",
          {
            uniformMap: {
              u_color: () => this._source.getColorTexture(0),
              u_depth: () => this._depth.getColorTexture(),
            },
          },
        );
        passState.framebuffer = this._waterColor.framebuffer;
        this._copyWater.execute(scene.context, passState);
        this._waterReady = true;
      }
      this._ready = true;
    } finally {
      this._active = false;
      passState.framebuffer = original;
      scene.context.uniformState.updatePass(pass);
    }
    return true;
  }

  isDestroyed() {
    return false;
  }
  destroy() {
    release(this);
    this._scene._sceneGISDeferred = undefined;
    this._scene.requestRender();
    this._scene = undefined;
    return destroyObject(this);
  }
}

export default _SceneGISDeferredLighting;
