import Color from "../../../Core/Color.js";
import combine from "../../../Core/combine.js";
import destroyObject from "../../../Core/destroyObject.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import BlendingState from "../../../Scene/BlendingState.js";
import StencilConstants from "../../../Scene/StencilConstants.js";
import StencilFunction from "../../../Scene/StencilFunction.js";
import StencilOperation from "../../../Scene/StencilOperation.js";
import depth from "../../../Shaders/SceneGIS/AmbientOcclusion/SceneGISAODepth.js";
import merge from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredInverseMerge.js";
import blend from "../../../Shaders/SceneGIS/Rendering/SceneGISDeferredInverseBlend.js";

/** Optional Tiles material storage for translucent inverse classification. @private */
class _SceneGISDeferredInverse {
  constructor(scene) {
    this._scene = scene;
    this._raw = new FramebufferManager({
      colorAttachmentsLength: 4,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      depthStencil: true,
      supportsDepthTexture: true,
    });
    this._mask = new FramebufferManager();
    this._depth = new FramebufferManager({
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
    });
    this._color = new FramebufferManager({
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    this._layers = [{ color: this._color, depth: this._depth }];
    this._rangeLayers = [];
    this._lightCommands = new WeakMap();
    this._clear = new ClearCommand({
      color: Color.TRANSPARENT,
      depth: 1,
      stencil: 0,
    });
    this._clearColor = new ClearCommand({ color: Color.TRANSPARENT });
    this.groups = new Set();
    this._uniforms = {
      u_diffuse: () => this._raw.getColorTexture(0),
      u_normal: () => this._raw.getColorTexture(1),
      u_specular: () => this._raw.getColorTexture(2),
      u_emission: () => this._raw.getColorTexture(3),
      u_style: () => this._style.getColorTexture(),
      u_mask: () => this._mask.getColorTexture(),
      u_depth: () => this._raw.getDepthStencilTexture(),
      u_color: () => this._blendLayer.color.getColorTexture(),
      u_linearDepth: () => this._blendLayer.depth.getColorTexture(),
      u_logDepth: () => scene.frameState.useLogDepth,
      u_frustumTag: () => this._frustumTag,
    };
    this._mark = scene.context.createViewportQuadCommand(
      "void main() { out_FragColor = vec4(1.0); }",
      {
        renderState: RenderState.fromCache({
          depthMask: false,
          stencilMask: 0,
          stencilTest: {
            enabled: true,
            frontFunction: StencilFunction.NOT_EQUAL,
            backFunction: StencilFunction.NEVER,
            reference: 0,
            mask: StencilConstants.CLASSIFICATION_MASK,
            frontOperation: {
              fail: StencilOperation.KEEP,
              zFail: StencilOperation.KEEP,
              zPass: StencilOperation.KEEP,
            },
          },
        }),
      },
    );
    this.unclassifiedCommand = scene.context.createViewportQuadCommand(blend, {
      owner: this,
      uniformMap: this._uniforms,
      renderState: RenderState.fromCache({
        depthTest: { enabled: true },
        depthMask: true,
        stencilTest: StencilConstants.setCesium3DTileBit(),
        stencilMask: StencilConstants.CESIUM_3D_TILE_MASK,
        blending: BlendingState.ALPHA_BLEND,
      }),
    });
    this.unclassifiedCommand.pass = Pass.TRANSLUCENT;
    this._packDepth = scene.context.createViewportQuadCommand(
      new ShaderSource({
        defines: ["SCENEGIS_INVERSE_PACK_DEPTH"],
        sources: [blend],
      }),
      {
        uniformMap: this._uniforms,
        renderState: RenderState.fromCache({ depthMask: false }),
      },
    );
  }

  update(renderer, passState) {
    const { context, frameState } = this._scene;
    const width = context.drawingBufferWidth;
    const height = context.drawingBufferHeight;
    const style = renderer._hasStyleTarget;
    const layout = `${style}_${renderer._hasOcean}_${renderer._hasClassification}_${renderer._multiFrustum}_${frameState.useLogDepth}`;
    if (this._raw.isDirty(width, height, 1) || this._layout !== layout) {
      this._releaseDepthSource();
      this.framebuffer?.destroy();
      this._maskView?.destroy();
      this._raw.update(context, width, height);
      if (style) {
        this._style ??= new FramebufferManager({
          pixelDatatype: PixelDatatype.HALF_FLOAT,
        });
        this._style.update(context, width, height);
      } else {
        this._style?.destroy();
        this._style = undefined;
      }
      for (const target of [this._mask, this._depth, this._color]) {
        target.update(context, width, height);
      }
      const colors = [0, 1, 2, 3].map((i) => this._raw.getColorTexture(i));
      if (style) {
        colors.push(this._style.getColorTexture());
      }
      this.framebuffer = new Framebuffer({
        context,
        colorTextures: colors,
        depthStencilTexture: this._raw.getDepthStencilTexture(),
        destroyAttachments: false,
      });
      this._maskView = new Framebuffer({
        context,
        colorTextures: [this._mask.getColorTexture()],
        depthStencilTexture: this._raw.getDepthStencilTexture(),
        destroyAttachments: false,
      });
      this._merge?.shaderProgram.destroy();
      const defines = [];
      if (style) {
        defines.push("SCENEGIS_DEFERRED_STYLE_TARGET");
      }
      if (renderer._hasOcean) {
        defines.push(`SCENEGIS_DEFERRED_OCEAN_LOCATION ${4 + Number(style)}`);
      }
      if (renderer._hasClassification) {
        defines.push(
          `SCENEGIS_DEFERRED_CLASSIFICATION_LOCATION ${4 + Number(style) + Number(renderer._hasOcean)}`,
        );
      }
      if (renderer._multiFrustum) {
        defines.push(
          `SCENEGIS_DEFERRED_DEPTH_LOCATION ${4 + Number(style) + Number(renderer._hasOcean) + Number(renderer._hasClassification)}`,
        );
        if (frameState.useLogDepth) {
          defines.push("LOG_DEPTH_READ_ONLY");
        }
      }
      this._merge = context.createViewportQuadCommand(
        new ShaderSource({ defines, sources: [merge] }),
        {
          uniformMap: this._uniforms,
          renderState: RenderState.fromCache({
            depthTest: { enabled: true },
            depthMask: true,
            stencilTest: StencilConstants.setCesium3DTileBit(),
            stencilMask: StencilConstants.CESIUM_3D_TILE_MASK,
          }),
        },
      );
      this._layout = layout;
    }
    if (!this._copyDepth || this._logDepth !== frameState.useLogDepth) {
      this._copyDepth?.shaderProgram.destroy();
      this._logDepth = frameState.useLogDepth;
      this._copyDepth = context.createViewportQuadCommand(
        new ShaderSource({
          defines: this._logDepth ? ["LOG_DEPTH_READ_ONLY"] : [],
          sources: [depth],
        }),
        { uniformMap: this._uniforms },
      );
    }
    this._rangeLayers.length = this._scene._view.frustumCommandsList.length;
    let layerCount = 0;
    this._scene._view.frustumCommandsList.forEach((range, index) => {
      let layer;
      if (range.indices[Pass.CESIUM_3D_TILE] > 0) {
        layer = this._layers[layerCount] ??= {
          color: new FramebufferManager({
            pixelDatatype: PixelDatatype.HALF_FLOAT,
          }),
          depth: new FramebufferManager({
            pixelFormat: PixelFormat.RED,
            pixelDatatype: PixelDatatype.FLOAT,
          }),
        };
        layer.color.update(context, width, height);
        layer.depth.update(context, width, height);
        ++layerCount;
      }
      this._rangeLayers[index] = layer;
    });
    while (this._layers.length > layerCount) {
      const layer = this._layers.pop();
      layer.color.destroy();
      layer.depth.destroy();
    }
    this.byteLength =
      width * height * (52 + (style ? 8 : 0) + (layerCount - 1) * 12);
    if (!renderer._multiFrustum) {
      this.beginFrustum(0, passState);
      this.selectFrustum(0);
    }
    if (this._scene._environmentState.useOIT) {
      const command = this.unclassifiedCommand;
      command.derivedCommands.oit = this._scene._view.oit.createDerivedCommands(
        command,
        context,
        command.derivedCommands.oit,
      );
    }
  }

  beginFrustum(index, passState) {
    this._activeLayer = this._rangeLayers[index];
    this._frustumTag = index + 1;
    this.groups.clear();
    if (!this._activeLayer) {
      return;
    }
    const { context } = this._scene;
    this._raw.clear(context, this._clear, passState);
    for (const target of [
      this._style,
      this._mask,
      this._activeLayer.depth,
      this._activeLayer.color,
    ]) {
      target?.clear(context, this._clearColor, passState);
    }
  }

  selectFrustum(index) {
    this._blendLayer = this._rangeLayers[index];
  }

  restoreGlobeDepth(passState) {
    this._packDepth.framebuffer =
      this._scene._view.globeDepth._copyDepthFramebuffer.framebuffer;
    this._packDepth.execute(this._scene.context, passState);
  }

  merge(renderer, passState) {
    this._mark.framebuffer = this._maskView;
    this._mark.execute(this._scene.context, passState);
    this._merge.framebuffer = renderer._framebuffer;
    this._merge.execute(this._scene.context, passState);
  }

  prepareLight(passState) {
    this._linearDepth = this._activeLayer.depth.getColorTexture();
    this._copyDepth.framebuffer = this._activeLayer.depth.framebuffer;
    this._copyDepth.execute(this._scene.context, passState);
    return this._activeLayer.color.framebuffer;
  }

  lightCommand(command) {
    const context = this._scene.context;
    const shader = command.shaderProgram;
    let program = context.shaderCache.getDerivedShaderProgram(
      shader,
      "sceneGIS_inverse_unclassified",
    );
    if (!program) {
      const fs = shader.fragmentShaderSource.clone();
      fs.sources = fs.sources.map((source) =>
        ShaderSource.replaceMain(source, "sceneGISInverseLightMain"),
      );
      fs.sources.push(
        "uniform sampler2D u_sceneGISInverseMask; void main() { if (texelFetch(u_sceneGISInverseMask, ivec2(gl_FragCoord.xy), 0).r != 0.0) { discard; } sceneGISInverseLightMain(); }",
      );
      program = context.shaderCache.createDerivedShaderProgram(
        shader,
        "sceneGIS_inverse_unclassified",
        {
          vertexShaderSource: shader.vertexShaderSource,
          fragmentShaderSource: fs,
          attributeLocations: shader._attributeLocations,
        },
      );
    }
    let cached = this._lightCommands.get(command);
    if (!cached || cached.sourceUniforms !== command.uniformMap) {
      cached = {
        command: new DrawCommand(),
        sourceUniforms: command.uniformMap,
        uniforms: combine(
          { u_sceneGISInverseMask: this._uniforms.u_mask },
          command.uniformMap,
        ),
      };
      this._lightCommands.set(command, cached);
    }
    const derived = DrawCommand.shallowClone(command, cached.command);
    derived.shaderProgram = program;
    derived.uniformMap = cached.uniforms;
    return derived;
  }

  _releaseDepthSource() {
    this._scene._view?.globeDepth.releaseDepthSource(
      this._raw.getDepthStencilTexture(),
    );
  }

  destroy() {
    this._releaseDepthSource();
    this.framebuffer?.destroy();
    this._maskView?.destroy();
    for (const target of [this._raw, this._style, this._mask]) {
      target?.destroy();
    }
    for (const layer of this._layers) {
      layer.color.destroy();
      layer.depth.destroy();
    }
    for (const command of [
      this._mark,
      this._merge,
      this._copyDepth,
      this._packDepth,
      this.unclassifiedCommand,
    ]) {
      command?.shaderProgram.destroy();
    }
    return destroyObject(this);
  }
}

export default _SceneGISDeferredInverse;
