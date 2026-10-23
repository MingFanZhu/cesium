import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Color from "../../../Core/Color.js";
import destroyObject from "../../../Core/destroyObject.js";
import Matrix3 from "../../../Core/Matrix3.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import BlendingState from "../../../Scene/BlendingState.js";
import vertex from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidSurfaceVS.js";
import fragment from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidSurfaceFS.js";
import smooth from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidSmooth.js";
import composite from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidComposite.js";
import ray from "../../../Shaders/SceneGIS/Reflections/SceneGISSSRRay.js";
import optics from "../../../Shaders/SceneGIS/Water/SceneGISWaterOptics.js";
import viewportVertex from "../../../Shaders/ViewportQuadVS.js";
import WaterFrame from "./_SceneGISWaterFrame.js";
import EnvironmentLighting from "./_SceneGISModelEnvironmentLighting.js";

/**
 * Persistent screen-space depth/thickness reconstruction.
 * @private
 */
function SceneGISFluidSurface(primitive, frameState) {
  this.primitive = primitive;
  this.context = frameState.context;
  const context = this.context;
  this.size = new Cartesian2();
  this.direction = new Cartesian2();
  this.targets = [
    new FramebufferManager({
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
      depth: true,
    }),
    new FramebufferManager({
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    }),
    new FramebufferManager({
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
    }),
    new FramebufferManager({
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
    }),
  ];
  this.commands = [];
  const state = WaterFrame.get(frameState);
  this.uniforms = {
    u_particles: () => primitive._solver.position,
    u_renderRadius: () => primitive._renderRadius,
    u_thicknessScale: () =>
      primitive._config.particleSpacing ** 3 /
      ((4 / 3) * Math.PI * primitive._renderRadius ** 3),
    u_surfaceSize: () => this.size,
    u_filterDirection: () => this.direction,
    u_fluidDepth: () => this.inputDepth,
    u_fluidThickness: () => this.targets[1].getColorTexture(),
    u_depth: () => state.depthTexture ?? context.defaultTexture,
    u_color: () => state.colorTexture ?? context.defaultTexture,
    u_waterColor: () => primitive.waterColor,
    u_absorption: () => primitive.absorption,
    u_reflectionColor: () => primitive.reflectionColor,
    u_roughness: () => primitive.roughness,
    u_refractionStrength: () => primitive.refractionStrength,
    u_sky: () => this.sky?.texture ?? context.defaultCubeMap,
    u_hasSky: () => !!this.sky?.texture,
    u_skyWorldToLocal: () => this.sky?.worldToLocal ?? Matrix3.IDENTITY,
    u_skyLod: () => this.sky?.maximumMipmapLevel ?? 0,
    u_radianceScale: () => this.radianceScale,
    u_reflections: () => primitive.reflections,
    u_maximumDistance: () => 30,
    u_thickness: () => 0.1,
    u_maximumRoughness: () => 0.6,
    u_stepCount: () => 24,
    u_rayNear: () => state.near,
  };
  try {
    for (let i = 0; i < 2; i++) {
      this.commands.push(
        new DrawCommand({
          owner: primitive,
          vertexArray: context.getViewportQuadVertexArray(),
          instanceCount: primitive.maximumParticles,
          shaderProgram: ShaderProgram.fromCache({
            context,
            vertexShaderSource: vertex,
            fragmentShaderSource: new ShaderSource({
              defines: i === 1 ? ["FLUID_THICKNESS"] : [],
              sources: [fragment],
            }),
            attributeLocations: { position: 0, textureCoordinates: 1 },
          }),
          uniformMap: this.uniforms,
        }),
      );
    }
    this.commands.push(
      context.createViewportQuadCommand(smooth, { uniformMap: this.uniforms }),
    );
    this.command = context.createViewportQuadCommand(composite, {
      owner: primitive,
      uniformMap: this.uniforms,
      renderState: RenderState.fromCache({
        depthTest: { enabled: true },
        depthMask: true,
      }),
    });
    this.command.pass = Pass.OPAQUE;
    this.commands.push(this.command);
    this.clear = new ClearCommand({ color: Color.TRANSPARENT, depth: 1 });
    this.byteLength = 0;
    this.update(frameState);
  } catch (error) {
    this.destroy();
    throw error;
  }
}

SceneGISFluidSurface.prototype.update = function (frameState) {
  const planar = frameState._sceneGISPlanarLighting?.active === true;
  const record = planar
    ? frameState._sceneGISPlanarLighting
    : frameState._sceneGISGlobeLighting;
  this.sky = record?.active ? record.skyReflections : undefined;
  this.sky?.update(frameState);
  this.radianceScale = record?.surfaceRadianceScale ?? 1;
  const mode = record?.active ? (planar ? "planar" : "globe") : "none";
  if (this.mode !== mode) {
    const source =
      mode === "none"
        ? new ShaderSource()
        : EnvironmentLighting.surfaceSource(planar);
    if (mode !== "none") {
      source.defines.push("SCENEGIS_WATER_PHYSICAL");
      Object.assign(
        this.uniforms,
        EnvironmentLighting.surfaceUniforms(frameState, planar),
      );
    }
    source.sources.push(ray, optics, composite);
    const previous = this.command.shaderProgram;
    this.command.shaderProgram = ShaderProgram.fromCache({
      context: this.context,
      vertexShaderSource: viewportVertex,
      fragmentShaderSource: source,
      attributeLocations: { position: 0, textureCoordinates: 1 },
    });
    previous.destroy();
    this.mode = mode;
  }
};

SceneGISFluidSurface.prototype.prepare = function (scene) {
  const primitive = this.primitive;
  const width = Math.max(
    1,
    Math.ceil(scene.drawingBufferWidth * primitive._resolutionScale),
  );
  const height = Math.max(
    1,
    Math.ceil(scene.drawingBufferHeight * primitive._resolutionScale),
  );
  if (this.size.x !== width || this.size.y !== height) {
    this.size.x = width;
    this.size.y = height;
    this.targets.forEach((target) =>
      target.update(this.context, width, height),
    );
    this.byteLength = width * height * 16;
    const viewport = new BoundingRectangle(0, 0, width, height);
    this.commands[0].renderState = RenderState.fromCache({
      viewport,
      depthTest: { enabled: true },
      depthMask: true,
    });
    this.commands[1].renderState = RenderState.fromCache({
      viewport,
      depthMask: false,
      blending: BlendingState.ADDITIVE_BLEND,
    });
    this.commands[2].renderState = RenderState.fromCache({ viewport });
  }
  for (let i = 0; i < 2; i++) {
    const command = this.commands[i];
    command.modelMatrix = primitive.modelMatrix;
    command.framebuffer = this.targets[i].framebuffer;
    this.clear.framebuffer = command.framebuffer;
    this.clear.execute(this.context);
    command.execute(this.context);
  }
  for (let i = 0; i < 2; i++) {
    this.inputDepth = this.targets[i === 0 ? 0 : 2].getColorTexture();
    this.direction.x = i === 0 ? 1 : 0;
    this.direction.y = i === 0 ? 0 : 1;
    this.commands[2].framebuffer = this.targets[i + 2].framebuffer;
    this.commands[2].execute(this.context);
  }
  this.inputDepth = this.targets[3].getColorTexture();
};

SceneGISFluidSurface.prototype.isDestroyed = function () {
  return false;
};
SceneGISFluidSurface.prototype.destroy = function () {
  this.commands.forEach((command) => command.shaderProgram.destroy());
  this.targets.forEach((target) => target.destroy());
  return destroyObject(this);
};
export default SceneGISFluidSurface;
