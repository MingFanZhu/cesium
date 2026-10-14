import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Color from "../../../Core/Color.js";
import combine from "../../../Core/combine.js";
import Intersect from "../../../Core/Intersect.js";
import Interval from "../../../Core/Interval.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import DepthFunction from "../../../Scene/DepthFunction.js";
import clipping from "../../../Shaders/SceneGIS/PlanarSurface/SceneGISPlanarClippingFS.js";

const distance = new Interval();
const depthUniform = `uniform sampler2D u_sceneGISPlanarVectorDepth;
uniform vec2 u_sceneGISPlanarVectorRange;
vec4 sceneGISPlanarVectorEye(vec2 pixel, float depth) {
    float eyeDepth = exp2(depth * u_sceneGISPlanarVectorRange.y) - 1.0 + u_sceneGISPlanarVectorRange.x;
    vec4 a = czm_windowToEyeCoordinates(vec4(pixel, 0.0, 1.0));
    vec4 b = czm_windowToEyeCoordinates(vec4(pixel, 0.5, 1.0));
    a /= a.w;
    b /= b.w;
    return vec4(a.xyz + (b.xyz - a.xyz) * ((-eyeDepth - a.z) / (b.z - a.z)), 1.0);
}`;

function isMap(command, world) {
  return command.owner?._world === world && !command.owner._globe;
}

function currentCommand(scene, command) {
  scene.updateDerivedCommands(command);
  if (scene.frameState.useLogDepth) {
    command = command.derivedCommands.logDepth.command;
  }
  if (scene._hdr && !scene.frameState.passes.pick) {
    command = command.derivedCommands.hdr?.command ?? command;
  }
  return command;
}

/** Conditional first-surface depth and ordered maps for translucent Planar. @private */
class PlanarVectorOverlays {
  constructor(renderer) {
    this.renderer = renderer;
    this.depth = new FramebufferManager({
      color: false,
      depthStencil: true,
      supportsDepthTexture: true,
    });
    this.raw = new FramebufferManager({
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    this.clearDepth = new ClearCommand({ depth: 1, stencil: 0 });
    this.clearColor = new ClearCommand({ color: Color.TRANSPARENT });
    this.commands = new WeakMap();
    this.originals = [];
    this.tiles = [];
    this.range = new Cartesian2();
    this.depthDrawCount = this.pickDepthDrawCount = this.mapDrawCount = 0;
    this.uniforms = {
      u_sceneGISPlanarVectorDepth: () => this.depth.getDepthStencilTexture(),
      u_sceneGISPlanarVectorRange: () => this.range,
      u_sceneGISPlanarVectorColor: () => this.raw.getColorTexture(),
      u_sceneGISPlanarVectorOpaqueDepth: () => this.opaqueDepth,
    };
  }

  static prepare(renderer, passState) {
    const scene = renderer._scene;
    const world = scene.world;
    const surface = world?._surface;
    const needed =
      surface?._opacity < 1 &&
      scene._view.frustumCommandsList.some((range) =>
        range.commands[Pass.TERRAIN_CLASSIFICATION].some(
          (command, index) =>
            index < range.indices[Pass.TERRAIN_CLASSIFICATION] &&
            isMap(command, world),
        ),
      );
    if (!needed) {
      renderer._planarVectors?.destroy();
      renderer._planarVectors = undefined;
      return;
    }
    // Opaque and translucent maps share one approved color-target budget.
    renderer._vectorOverlays?.destroy();
    renderer._vectorOverlays = undefined;
    const state = (renderer._planarVectors ??= new PlanarVectorOverlays(
      renderer,
    ));
    state.surface = surface;
    const width = scene.drawingBufferWidth;
    const height = scene.drawingBufferHeight;
    state.depth.update(scene.context, width, height);
    state.raw.update(scene.context, width, height);
    state.byteLength = width * height * 12;
    if (scene.frameState.passes.pick) {
      state.pickDepthDrawCount = 0;
    } else {
      state.depthDrawCount = state.mapDrawCount = 0;
    }
    state.captureDepth(passState);
  }

  derive(source, kind) {
    const scene = this.renderer._scene;
    let entries = this.commands.get(source);
    if (!entries) {
      entries = {};
      this.commands.set(source, entries);
    }
    let entry = entries[kind];
    const shader = source.shaderProgram;
    if (!entry || entry.shader !== shader) {
      const name = `sceneGIS_planar_vector_${kind}`;
      let program = scene.context.shaderCache.getDerivedShaderProgram(
        shader,
        name,
      );
      if (!program) {
        let fs = shader.fragmentShaderSource.clone();
        const vs = shader.vertexShaderSource.clone();
        if (kind === "depth" || kind === "surface") {
          vs.sources = vs.sources.map((text) =>
            ShaderSource.replaceMain(text, "sceneGISPlanarDepthMain"),
          );
          vs.sources.push(`out float v_sceneGISPlanarDepth;
void main() {
    sceneGISPlanarDepthMain();
    v_sceneGISPlanarDepth = -(czm_modelView * vec4(position, 1.0)).z;
}`);
        }
        if (kind === "depth") {
          const clipped = fs.defines.includes("SCENEGIS_PLANAR_CLIPPING");
          fs = new ShaderSource({
            sources: [
              ...(clipped ? [clipping] : []),
              `in float v_sceneGISPlanarDepth;
uniform vec2 u_sceneGISPlanarVectorRange;
void main() {
    ${clipped ? "sceneGISClipTerrain();" : ""}
    float eyeDepth = czm_orthographicIn3D > 0.5 ? v_sceneGISPlanarDepth : 1.0 / gl_FragCoord.w;
    gl_FragDepth = log2(1.0 + eyeDepth - u_sceneGISPlanarVectorRange.x) / u_sceneGISPlanarVectorRange.y;
    out_FragColor = vec4(1.0);
}`,
            ],
          });
        } else {
          fs.sources = fs.sources.map((text) =>
            ShaderSource.replaceMain(text, "sceneGISPlanarVectorMain"),
          );
          fs.sources.unshift(depthUniform);
          if (kind === "surface") {
            fs.defines.push("SCENEGIS_PLANAR_VECTOR_OVERLAY");
            fs.sources.push(`in float v_sceneGISPlanarDepth;
uniform sampler2D u_sceneGISPlanarVectorColor;
void main() {
    sceneGISPlanarVectorMain();
#ifdef LOG_DEPTH
    czm_writeLogDepth();
#endif
    float eyeDepth = czm_orthographicIn3D > 0.5 ? v_sceneGISPlanarDepth : 1.0 / gl_FragCoord.w;
    float fragmentDepth = log2(1.0 + eyeDepth - u_sceneGISPlanarVectorRange.x) / u_sceneGISPlanarVectorRange.y;
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float surfaceDepth = texelFetch(u_sceneGISPlanarVectorDepth, pixel, 0).r;
    // Frustum clipping and float interpolation shift the same plane by up to
    // eight DEPTH24 steps. Use a first-surface test with that rasterization allowance.
    if (surfaceDepth < 1.0 && fragmentDepth <= surfaceDepth + 8.0 / 16777215.0) {
        vec4 map = texelFetch(u_sceneGISPlanarVectorColor, pixel, 0);
        float remaining = out_FragColor.a * (1.0 - map.a);
        float alpha = map.a + remaining;
        out_FragColor = vec4(alpha > 0.0 ? (map.rgb + out_FragColor.rgb * remaining) / alpha : vec3(0.0), alpha);
    }
    if (out_FragColor.a == 0.0) discard;
}`);
          } else {
            fs.defines.push("SCENEGIS_VECTOR_PLANAR_TRANSPARENT");
            vs.defines.push("SCENEGIS_VECTOR_PLANAR_TRANSPARENT");
            vs.sources.unshift(depthUniform);
            fs.sources.push(
              kind === "pick"
                ? `void main() {
    sceneGISPlanarVectorMain();
    float depth = texelFetch(u_sceneGISPlanarVectorDepth, ivec2(gl_FragCoord.xy), 0).r;
    if (depth < 1.0) {
        vec4 eye = sceneGISPlanarVectorEye(gl_FragCoord.xy, depth);
#ifdef LOG_DEPTH
        czm_writeLogDepth(1.0 - eye.z - czm_currentFrustum.x);
#else
        vec4 clip = czm_projection * eye;
        gl_FragDepth = 0.5 * (clip.z / clip.w + 1.0);
#endif
    } else {
#ifdef LOG_DEPTH
        czm_writeLogDepth();
#else
        gl_FragDepth = gl_FragCoord.z;
#endif
    }
}`
                : `
layout(location = 1) out vec4 sceneGISPlanarMapColor;
uniform sampler2D u_sceneGISPlanarVectorOpaqueDepth;
void main() {
    sceneGISPlanarVectorMain();
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    bool surface = texelFetch(u_sceneGISPlanarVectorDepth, pixel, 0).r < 1.0;
    sceneGISPlanarMapColor = surface ? out_FragColor : vec4(0.0);
    if (surface) {
        out_FragColor = vec4(0.0);
    } else {
        float fragmentDepth = gl_FragCoord.z;
#ifdef LOG_DEPTH
        czm_writeLogDepth();
        fragmentDepth = gl_FragDepth;
#endif
        if (fragmentDepth > texelFetch(u_sceneGISPlanarVectorOpaqueDepth, pixel, 0).r) discard;
    }
}`,
            );
          }
        }
        program = scene.context.shaderCache.createDerivedShaderProgram(
          shader,
          name,
          {
            vertexShaderSource: vs,
            fragmentShaderSource: fs,
            attributeLocations: shader._attributeLocations,
          },
        );
      }
      entry = entries[kind] = { shader, program, command: new DrawCommand() };
    }
    const derivedCommands = entry.command.derivedCommands;
    DrawCommand.shallowClone(source, entry.command);
    entry.command.derivedCommands = derivedCommands;
    entry.command.shaderProgram = entry.program;
    if (entry.sourceUniforms !== source.uniformMap) {
      entry.sourceUniforms = source.uniformMap;
      entry.uniformMap = combine(this.uniforms, source.uniformMap);
    }
    entry.command.uniformMap = entry.uniformMap;
    if (kind === "pick") {
      if (entry.sourceState !== source.renderState) {
        entry.sourceState = source.renderState;
        const state = RenderState.getState(source.renderState);
        // Disabled depth testing also disables writes; ALWAYS retains map order
        // while allowing later ordinary objects to test the actual surface depth.
        state.depthTest = { enabled: true, func: DepthFunction.ALWAYS };
        entry.pickState = RenderState.fromCache(state);
      }
      entry.command.renderState = entry.pickState;
    }
    return entry.command;
  }

  captureDepth(passState) {
    const scene = this.renderer._scene;
    const context = scene.context;
    this.clearDepth.framebuffer = this.depth.framebuffer;
    this.clearDepth.execute(context, passState);
    this.tiles.length = 0;
    let near = Infinity;
    let far = -Infinity;
    for (const source of this.surface._renderCommands) {
      if (
        scene.frameState.cullingVolume.computeVisibility(
          source.boundingVolume,
        ) === Intersect.OUTSIDE
      ) {
        continue;
      }
      BoundingSphere.computePlaneDistances(
        source.boundingVolume,
        scene.camera.positionWC,
        scene.camera.directionWC,
        distance,
      );
      near = Math.min(near, distance.start);
      far = Math.max(far, distance.stop);
      this.tiles.push(source);
    }
    this.range.x = Math.max(scene.camera.frustum.near, near);
    this.range.y = Math.log2(
      1.0 + Math.min(scene.camera.frustum.far, far) - this.range.x,
    );
    for (const source of this.tiles) {
      const command = this.derive(source, "depth");
      command.pass = Pass.GLOBE;
      command.castShadows = command.receiveShadows = false;
      command.renderState = this.surface._renderState;
      command.framebuffer = this.depth.framebuffer;
      // A single logarithmic interval retains DEPTH24 precision across segment
      // boundaries. Native per-frustum log/HDR derivation must not rewrite it.
      command.execute(context, passState);
      if (scene.frameState.passes.pick) {
        ++this.pickDepthDrawCount;
      } else {
        ++this.depthDrawCount;
      }
    }
  }

  classify(range, passState, executeCommand) {
    const scene = this.renderer._scene;
    const picking = scene.frameState.passes.pick;
    scene.context.uniformState.updatePass(Pass.TERRAIN_CLASSIFICATION);
    for (let i = 0; i < range.indices[Pass.TERRAIN_CLASSIFICATION]; ++i) {
      const source = range.commands[Pass.TERRAIN_CLASSIFICATION][i];
      if (!isMap(source, scene.world)) {
        executeCommand(source, scene, passState);
      } else if (picking) {
        const command = this.derive(source, "pick");
        scene.updateDerivedCommands(command);
        executeCommand(command, scene, passState);
      }
    }
  }

  translucent(range, passState, executePass) {
    const scene = this.renderer._scene;
    this.clearColor.framebuffer = this.raw.framebuffer;
    this.clearColor.execute(scene.context, passState);
    const sourceTarget = passState.framebuffer;
    const color = sourceTarget.getColorTexture(0);
    const map = this.raw.getColorTexture();
    this.opaqueDepth = sourceTarget.depthStencilTexture;
    if (this.color !== color || this.map !== map) {
      this.framebuffer?.destroy();
      this.framebuffer = new Framebuffer({
        context: scene.context,
        colorTextures: [color, map],
        destroyAttachments: false,
      });
      this.color = color;
      this.map = map;
    }
    scene.context.uniformState.updatePass(Pass.TERRAIN_CLASSIFICATION);
    for (let i = 0; i < range.indices[Pass.TERRAIN_CLASSIFICATION]; ++i) {
      const source = range.commands[Pass.TERRAIN_CLASSIFICATION][i];
      if (!isMap(source, scene.world)) {
        continue;
      }
      const command = this.derive(source, "color");
      command.framebuffer = this.framebuffer;
      currentCommand(scene, command).execute(scene.context, passState);
      ++this.mapDrawCount;
    }
    const commands = range.commands[Pass.TRANSLUCENT];
    this.originals.length = 0;
    try {
      for (let i = 0; i < range.indices[Pass.TRANSLUCENT]; ++i) {
        const source = commands[i];
        if (source.owner !== this.surface) {
          continue;
        }
        this.originals.push(source);
        commands[i] = this.derive(source, "surface");
        scene.updateDerivedCommands(commands[i]);
      }
      executePass(scene, passState, range);
    } finally {
      // Native sorted translucency may reorder the array, so restore by identity.
      for (const source of this.originals) {
        const derived = this.commands.get(source).surface.command;
        commands[commands.indexOf(derived)] = source;
      }
      this.originals.length = 0;
    }
  }

  destroy() {
    this.framebuffer?.destroy();
    this.raw.destroy();
    this.depth.destroy();
  }
}

export default PlanarVectorOverlays;
