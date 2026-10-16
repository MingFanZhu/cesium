import Cartesian2 from "../../../Core/Cartesian2.js";
import Color from "../../../Core/Color.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";

function release(renderer) {
  const state = renderer._vectorSymbolOcclusion;
  state?.depth?.destroy();
  state?.terrain?.destroy();
  state?.copy?.shaderProgram.destroy();
  state?.copyTerrain?.shaderProgram.destroy();
  renderer._vectorSymbolOcclusion = undefined;
}

function update(renderer, ranges, passState, eligible, shaderInfo) {
  renderer.vectorSymbolOcclusionDrawCount = 0;
  renderer.vectorSymbolOcclusionByteLength = 0;
  const scene = renderer._scene;
  const state = (renderer._vectorSymbolOcclusion ??= {
    maps: new Map(),
    clear: new ClearCommand({ color: Color.TRANSPARENT }),
  });
  state.maps.clear();
  let symbols = false,
    groundSymbols = false,
    buildings = false,
    objects = false,
    base = 0;
  for (const range of ranges) {
    for (let i = 0; i < range.indices[Pass.SCENEGIS_VECTOR]; ++i) {
      const command = range.commands[Pass.SCENEGIS_VECTOR][i];
      if (!state.maps.has(command.owner)) {
        const end = base + command.owner._records.length;
        state.maps.set(command.owner, { range: new Cartesian2(base, end) });
        base = end;
      }
      symbols ||= command.shaderProgram.fragmentShaderSource.defines.includes(
        "SCENEGIS_VECTOR_SYMBOL",
      );
      groundSymbols ||=
        command.shaderProgram.fragmentShaderSource.defines.includes(
          "SCENEGIS_VECTOR_TERRAIN_ANCHOR",
        );
      buildings ||= eligible(command);
    }
    for (const pass of [Pass.CESIUM_3D_TILE, Pass.OPAQUE]) {
      for (let i = 0; i < range.indices[pass]; ++i) {
        const command = range.commands[pass][i];
        objects ||= eligible(command) && !shaderInfo(renderer, command).planar;
      }
    }
  }
  if (groundSymbols && renderer._multiFrustum) {
    state.terrain ??= new FramebufferManager({
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
    });
    state.terrain.update(
      scene.context,
      scene.drawingBufferWidth,
      scene.drawingBufferHeight,
    );
    state.terrain.clear(scene.context, state.clear, passState);
    renderer.vectorSymbolOcclusionByteLength +=
      scene.drawingBufferWidth * scene.drawingBufferHeight * 4;
  } else {
    state.terrain?.destroy();
    state.terrain = undefined;
  }
  if (!(symbols && buildings && objects)) {
    state.depth?.destroy();
    state.depth = undefined;
    renderer.byteLength += renderer.vectorSymbolOcclusionByteLength;
    return;
  }
  state.depth ??= new FramebufferManager({
    pixelFormat: PixelFormat.RED,
    pixelDatatype: PixelDatatype.FLOAT,
  });
  state.depth.update(
    scene.context,
    scene.drawingBufferWidth,
    scene.drawingBufferHeight,
  );
  state.depth.clear(scene.context, state.clear, passState);
  renderer.vectorSymbolOcclusionByteLength +=
    scene.drawingBufferWidth * scene.drawingBufferHeight * 4;
  renderer.byteLength += renderer.vectorSymbolOcclusionByteLength;
}

function capture(renderer, passState, terrain = false) {
  const state = renderer._vectorSymbolOcclusion;
  const target = terrain ? state?.terrain : state?.depth;
  if (!target) {
    return;
  }
  const scene = renderer._scene;
  const log = scene.frameState.useLogDepth;
  if (state.log !== log) {
    state.copy?.shaderProgram.destroy();
    state.copy = undefined;
    state.copyTerrain?.shaderProgram.destroy();
    state.copyTerrain = undefined;
    state.log = log;
  }
  const key = terrain ? "copyTerrain" : "copy";
  if (!state[key]) {
    state[key] = scene.context.createViewportQuadCommand(
      new ShaderSource({
        defines: log ? ["LOG_DEPTH"] : [],
        sources: [
          `uniform sampler2D u_depth;
        uniform sampler2D u_material;
        void main() {
          ivec2 pixel = ivec2(gl_FragCoord.xy);
          float depth = texelFetch(u_depth, pixel, 0).r;
          float group = texelFetch(u_material, pixel, 0).a;
          if (depth == 1.0 ${terrain ? "" : "|| group == -3.0 || group == -5.0 || group == -6.0"}) discard;
          vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
          out_FragColor = vec4(-eye.z / eye.w, 0.0, 0.0, 1.0);
        }`,
        ],
      }),
      {
        uniformMap: {
          u_depth: () => renderer._source.depthStencilTexture,
          u_material: () => renderer._raw.getColorTexture(2),
        },
      },
    );
  }
  // The external stage has not drawn map buildings. Keep farther segments where
  // this segment has no external object; geometry is submitted only once.
  state[key].framebuffer = target.framebuffer;
  state[key].execute(scene.context, passState);
  ++renderer.vectorSymbolOcclusionDrawCount;
}

/** External-depth snapshot at the boundary of the dedicated vector pass. @private */
export default { update, capture, release };
