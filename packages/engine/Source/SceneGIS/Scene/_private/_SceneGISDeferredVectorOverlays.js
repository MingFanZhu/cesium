import combine from "../../../Core/combine.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import BlendFunction from "../../../Scene/BlendFunction.js";
import EnvironmentResources from "../../Renderer/_private/_SceneGISVectorEnvironmentResources.js";
import inputs from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredInputs.js";
import common from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAOCommon.js";
import lighting from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredVectorOverlayLighting.js";

const lightDefine =
  /^(SCENEGIS_VECTOR_ENVIRONMENT$|SCENEGIS_VECTOR_SHADOWS$|SCENEGIS_VECTOR_SHADOW_CASCADES$|USE_SHADOW_DEPTH_TEXTURE$|USE_SOFT_SHADOWS$|SCENEGIS_GLOBE$|COMBINED_SCATTERING_TEXTURES$|TRANSMITTANCE_TEXTURE_|SCATTERING_TEXTURE_|IRRADIANCE_TEXTURE_)/;

function isLit(command) {
  const fs = command.shaderProgram.fragmentShaderSource;
  return (
    !fs.defines.includes("SCENEGIS_VECTOR_CIRCLE") &&
    fs.sources.some((source) =>
      source.includes("#define SCENEGIS_DEFERRED_VECTOR_OVERLAY"),
    ) &&
    (command.owner._globe || command.owner._world.opacity === 1) &&
    (fs.defines.includes("SCENEGIS_VECTOR_ENVIRONMENT") ||
      (fs.defines.includes("SCENEGIS_VECTOR_GROUND") &&
        command.uniformMap.u_sceneGISGroundLighting()) ||
      (fs.defines.includes("SCENEGIS_VECTOR_BACKGROUND") &&
        command.uniformMap.u_lighting()))
  );
}

/** Ordered lit albedo and unlit classification share coverage, not lighting. @private */
class VectorOverlays {
  constructor(renderer) {
    this.renderer = renderer;
    this.raw = new FramebufferManager({
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    this.commands = new WeakMap();
    this.dirty = false;
    this.clearDrawCount = 0;
    this.group = undefined;
  }

  static prepare(renderer, ranges) {
    let command;
    if (!renderer._scene._globeTranslucencyState.translucent) {
      for (const range of ranges) {
        const pass = Pass.TERRAIN_CLASSIFICATION;
        for (let i = 0; i < range.indices[pass]; ++i) {
          if (isLit(range.commands[pass][i])) {
            command = range.commands[pass][i];
            break;
          }
        }
        if (command) {
          break;
        }
      }
    }
    if (!command) {
      renderer._vectorOverlays?.destroy();
      renderer._vectorOverlays = undefined;
      return;
    }
    const state = (renderer._vectorOverlays ??= new VectorOverlays(renderer));
    state.updateLight(command);
    state.dirty = false;
    state.clearDrawCount = 0;
  }

  updateLight(source) {
    const renderer = this.renderer;
    const context = renderer._scene.context;
    const defines = source.shaderProgram.fragmentShaderSource.defines.filter(
      (name) => lightDefine.test(name),
    );
    const key = defines.join(";");
    if (this.key !== key) {
      this.group?.command.shaderProgram.destroy();
      const sources = [inputs, common];
      if (defines.includes("SCENEGIS_VECTOR_ENVIRONMENT")) {
        sources.push(
          ...EnvironmentResources.lightingSource(
            defines.includes("SCENEGIS_GLOBE"),
          ),
        );
      }
      sources.push(lighting);
      const command = context.createViewportQuadCommand(
        new ShaderSource({
          defines: [...defines, "HDR", "SCENEGIS_DEFERRED_LIGHTING"],
          sources,
        }),
        {
          renderState: RenderState.fromCache({
            depthMask: false,
            blending: {
              enabled: true,
              functionSourceRgb: BlendFunction.ONE,
              // Shared output alpha stores coverage, roughness or encoded normals.
              // The underlying surface already wrote those values once.
              functionSourceAlpha: BlendFunction.ZERO,
              functionDestinationRgb: BlendFunction.ONE,
              functionDestinationAlpha: BlendFunction.ONE,
            },
          }),
        },
      );
      this.group = { command, vectorOverlay: true };
      this.key = key;
      this.sourceUniforms = undefined;
    }
    if (this.sourceUniforms !== source.uniformMap) {
      this.sourceUniforms = source.uniformMap;
      this.group.command.uniformMap = combine(
        {
          u_sceneGISVectorAlbedo: () => this.raw.getColorTexture(),
          u_sceneGISClassification: () =>
            renderer._classification.getColorTexture(),
          u_sceneGISDeferredNormal: () => renderer._raw.getColorTexture(1),
          u_sceneGISDeferredSpecular: () => renderer._raw.getColorTexture(2),
          u_sceneGISDeferredEmission: () => renderer._raw.getColorTexture(3),
          u_linearDepth: () => renderer._linearDepth,
        },
        source.uniformMap,
      );
    }
  }

  clearReplaced(passState) {
    const renderer = this.renderer;
    if (this.combined || !this.dirty) {
      return;
    }
    const context = renderer._scene.context;
    this.clearCommand ??= context.createViewportQuadCommand(
      "uniform sampler2D u_overlay; void main() { if (texelFetch(u_overlay, ivec2(gl_FragCoord.xy), 0).a > 0.0) discard; out_FragColor = vec4(0.0); }",
      {
        uniformMap: {
          u_overlay: () => renderer._classification.getColorTexture(),
        },
        renderState: RenderState.fromCache({ depthMask: false }),
      },
    );
    this.clearCommand.framebuffer = this.raw.framebuffer;
    this.clearCommand.execute(context, passState);
    this.dirty = false;
    ++this.clearDrawCount;
  }

  draw(command, passState) {
    this.clearReplaced(passState);
    const renderer = this.renderer;
    const context = renderer._scene.context;
    const shader = command.shaderProgram;
    let cached = this.commands.get(command);
    if (!cached || cached.shader !== shader) {
      const lit = isLit(command);
      const name = `sceneGIS_vector_overlay_${lit}`;
      let program = context.shaderCache.getDerivedShaderProgram(shader, name);
      if (!program) {
        const fs = shader.fragmentShaderSource.clone();
        if (lit) {
          fs.defines.push("SCENEGIS_DEFERRED_VECTOR_OVERLAY_CAPTURE");
        }
        fs.sources = fs.sources.map((source) =>
          ShaderSource.replaceMain(source, "sceneGISVectorOverlayMain"),
        );
        fs.sources.push(`layout(location = 1) out vec4 sceneGISVectorAlbedo;
void main() {
    sceneGISVectorOverlayMain();
    sceneGISVectorAlbedo = vec4(${lit ? "out_FragColor.rgb" : "vec3(0.0)"}, out_FragColor.a);
    ${lit ? "out_FragColor.rgb = vec3(0.0);" : ""}
}`);
        program = context.shaderCache.createDerivedShaderProgram(shader, name, {
          vertexShaderSource: shader.vertexShaderSource,
          fragmentShaderSource: fs,
          attributeLocations: shader._attributeLocations,
        });
      }
      cached = { shader, program, command: new DrawCommand() };
      this.commands.set(command, cached);
    }
    const derived = DrawCommand.shallowClone(command, cached.command);
    derived.shaderProgram = cached.program;
    derived.framebuffer = renderer._classificationView;
    derived.execute(context, passState);
  }

  destroy() {
    this.raw.destroy();
    this.group?.command.shaderProgram.destroy();
    this.clearCommand?.shaderProgram.destroy();
  }
}

export default VectorOverlays;
