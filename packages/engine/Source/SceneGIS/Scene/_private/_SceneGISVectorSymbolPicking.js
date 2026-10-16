import Color from "../../../Core/Color.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import combine from "../../../Core/combine.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import FramebufferManager from "../../../Renderer/FramebufferManager.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import DepthFunction from "../../../Scene/DepthFunction.js";

function symbol(command) {
  return command.shaderProgram.fragmentShaderSource.defines.includes(
    "SCENEGIS_VECTOR_SYMBOL",
  );
}

function release(renderer) {
  const state = renderer._vectorSymbolPicking;
  if (!state) {
    return;
  }
  for (const view of state.views) {
    view.destroy();
  }
  state.external?.destroy();
  state.building?.destroy();
  renderer._vectorSymbolPicking = undefined;
}

function begin(renderer) {
  const scene = renderer._scene;
  const passes = scene.frameState.passes;
  const active =
    passes.pick &&
    !passes.depth &&
    !passes.snap &&
    !passes.pickVoxel &&
    !scene.frameState.pickingMetadata;
  const ranges = scene._view.frustumCommandsList;
  if (
    !active ||
    !ranges.some((range) => {
      for (let i = 0; i < range.indices[Pass.SCENEGIS_VECTOR]; ++i) {
        if (symbol(range.commands[Pass.SCENEGIS_VECTOR][i])) {
          return true;
        }
      }
      return false;
    })
  ) {
    release(renderer);
    return;
  }
  const state = (renderer._vectorSymbolPicking ??= {
    commands: new WeakMap(),
    views: [],
    clear: new ClearCommand({ color: Color.TRANSPARENT }),
  });
  for (const view of state.views) {
    view.destroy();
  }
  state.views.length = 0;
  state.maps = new Map();
  state.active = true;
  state.externalReady = state.buildingReady = false;
  let base = 0;
  for (const range of ranges) {
    for (let i = 0; i < range.indices[Pass.SCENEGIS_VECTOR]; ++i) {
      const command = range.commands[Pass.SCENEGIS_VECTOR][i];
      let map = state.maps.get(command.owner);
      if (!map) {
        map = {
          base,
          end: base + command.owner._records.length,
          orders: new Set(),
        };
        base = map.end;
        state.maps.set(command.owner, map);
      }
      map.orders.add(command.uniformMap.u_sceneGISVectorStyleOrder());
    }
  }
}

function target(renderer, state, name, passState) {
  const scene = renderer._scene;
  if (!state[`${name}Ready`]) {
    state[name] ??= new FramebufferManager({
      pixelFormat: name === "building" ? PixelFormat.RG : PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
    });
    state[name].update(
      scene.context,
      scene.drawingBufferWidth,
      scene.drawingBufferHeight,
    );
    state[name].clear(scene.context, state.clear, passState);
    state[`${name}Ready`] = true;
  }
  return state[name].getColorTexture();
}

function object(renderer, source, passState, shaderInfo) {
  const state = renderer._vectorSymbolPicking;
  if (
    !state?.active ||
    ![
      Pass.CESIUM_3D_TILE,
      Pass.OPAQUE,
      Pass.TRANSLUCENT,
      Pass.SCENEGIS_VECTOR,
    ].includes(source.pass)
  ) {
    return false;
  }
  const building = source.pass === Pass.SCENEGIS_VECTOR;
  if (building && symbol(source)) {
    return false;
  }
  const scene = renderer._scene;
  const info = shaderInfo(renderer, source);
  if (info.planar || !source.renderState.depthTest.enabled) {
    return false;
  }
  const native =
    source.derivedCommands.picking?.pickCommand ??
    source.derivedCommands.depth?.depthOnlyCommand;
  if (!native) {
    return false;
  }
  const color = !!source.derivedCommands.picking;
  const name = building ? "building" : "external";
  const depth = target(renderer, state, name, passState);
  const context = scene.context;
  const original = passState.framebuffer;
  let view = state.views.find(
    (view) =>
      view._vectorSource === original &&
      view._vectorDepth === depth &&
      view._vectorColor === color,
  );
  if (!view) {
    view = new Framebuffer({
      context,
      colorTextures: color ? [original.getColorTexture(0), depth] : [depth],
      depthStencilTexture: original.depthStencilTexture,
      destroyAttachments: false,
    });
    view._vectorSource = original;
    view._vectorDepth = depth;
    view._vectorColor = color;
    state.views.push(view);
  }
  const shader = native.shaderProgram;
  const key = `sceneGIS_vector_pick_external_${color}_${building}`;
  let program = context.shaderCache.getDerivedShaderProgram(shader, key);
  if (!program) {
    const fs = shader.fragmentShaderSource.clone();
    fs.sources = fs.sources.map((s) =>
      ShaderSource.replaceMain(s, "sceneGISPickObjectMain"),
    );
    fs.sources.push(`
      ${building ? "uniform float u_sceneGISPickBuildingTag;" : ""}
      ${color ? "layout(location=1) out vec4 sceneGISPickDepth;" : ""}
      void main() {
        sceneGISPickObjectMain();
        #ifdef LOG_DEPTH
        vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, gl_FragDepth);
        #else
        vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord);
        #endif
        ${color ? "sceneGISPickDepth" : "out_FragColor"} = vec4(-eye.z / eye.w, ${building ? "u_sceneGISPickBuildingTag" : "0.0"}, 0.0, 1.0);
      }`);
    program = context.shaderCache.createDerivedShaderProgram(shader, key, {
      vertexShaderSource: shader.vertexShaderSource,
      fragmentShaderSource: fs,
      attributeLocations: shader._attributeLocations,
    });
  }
  const cached = cache(state, source);
  if (cached.sourceState !== native.renderState) {
    const rs = RenderState.getState(native.renderState);
    rs.colorMask = { red: true, green: true, blue: true, alpha: true };
    cached.state = RenderState.fromCache(rs);
    cached.sourceState = native.renderState;
  }
  const command = DrawCommand.shallowClone(native, cached.command);
  command.shaderProgram = program;
  command.renderState = cached.state;
  if (building) {
    if (cached.sourceUniforms !== native.uniformMap) {
      cached.uniformMap = combine(native.uniformMap, {
        u_sceneGISPickBuildingTag: () =>
          state.maps.get(source.owner).base +
          source.uniformMap.u_sceneGISVectorStyleOrder(),
      });
      cached.sourceUniforms = native.uniformMap;
    }
    command.uniformMap = cached.uniformMap;
  }
  command.framebuffer = view;
  command.execute(context, passState);
  return true;
}

function cache(state, source) {
  let cached = state.commands.get(source);
  if (!cached) {
    cached = { command: new DrawCommand(), order: new Cartesian3() };
    state.commands.set(source, cached);
  }
  return cached;
}

function execute(renderer, state, source, passState) {
  const scene = renderer._scene;
  const context = scene.context;
  if (scene.debugCommandFilter && !scene.debugCommandFilter(source)) {
    return;
  }
  const base = scene.frameState.useLogDepth
    ? (source.derivedCommands.logDepth?.command ?? source)
    : source;
  const native = base.derivedCommands.picking?.pickCommand;
  if (!native) {
    return;
  }
  const shader = native.shaderProgram;
  const key = "sceneGIS_vector_pick_ordered";
  let program = context.shaderCache.getDerivedShaderProgram(shader, key);
  if (!program) {
    const fs = shader.fragmentShaderSource.clone();
    fs.sources = fs.sources.map((s) =>
      ShaderSource.replaceMain(s, "sceneGISPickMapMain"),
    );
    fs.sources.push(`uniform sampler2D u_sceneGISPickExternal;
      uniform bool u_sceneGISPickHasExternal;
      uniform sampler2D u_sceneGISPickBuildings;
      uniform bool u_sceneGISPickHasBuildings;
      uniform vec3 u_sceneGISPickOrder;
      void main() {
        sceneGISPickMapMain();
        float distance = v_eyeDepth;
        if (u_sceneGISPickHasBuildings) {
          vec2 building = texelFetch(u_sceneGISPickBuildings, ivec2(gl_FragCoord.xy), 0).rg;
          bool own = building.y > u_sceneGISPickOrder.x && building.y <= u_sceneGISPickOrder.y;
          if (own ? building.y > u_sceneGISPickOrder.z : building.x > 0.0 && building.x < distance) discard;
        }
        if (u_sceneGISPickHasExternal) {
          float objectDepth = texelFetch(u_sceneGISPickExternal, ivec2(gl_FragCoord.xy), 0).r;
          if (objectDepth > 0.0 && objectDepth < distance) discard;
        }
      }`);
    program = context.shaderCache.createDerivedShaderProgram(shader, key, {
      vertexShaderSource: shader.vertexShaderSource,
      fragmentShaderSource: fs,
      attributeLocations: shader._attributeLocations,
    });
  }
  const cached = cache(state, source);
  if (cached.sourceState !== native.renderState) {
    const rs = RenderState.getState(native.renderState);
    rs.depthTest = {
      enabled: true,
      func: DepthFunction.ALWAYS,
    };
    rs.depthMask = false;
    cached.state = RenderState.fromCache(rs);
    cached.sourceState = native.renderState;
  }
  if (cached.sourceUniforms !== native.uniformMap) {
    cached.uniformMap = combine(native.uniformMap, {
      u_sceneGISPickExternal: () =>
        state.externalReady
          ? state.external.getColorTexture()
          : context.defaultTexture,
      u_sceneGISPickHasExternal: () => state.externalReady,
      u_sceneGISPickBuildings: () =>
        state.buildingReady
          ? state.building.getColorTexture()
          : context.defaultTexture,
      u_sceneGISPickHasBuildings: () => state.buildingReady,
      u_sceneGISPickOrder: () => {
        const map = state.maps.get(source.owner);
        cached.order.x = map.base;
        cached.order.y = map.end;
        cached.order.z =
          map.base + source.uniformMap.u_sceneGISVectorStyleOrder();
        return cached.order;
      },
    });
    cached.sourceUniforms = native.uniformMap;
  }
  const command = DrawCommand.shallowClone(native, cached.command);
  command.shaderProgram = program;
  command.renderState = cached.state;
  command.uniformMap = cached.uniformMap;
  command.execute(context, passState);
}

function draw(renderer, passState, frustum) {
  const state = renderer._vectorSymbolPicking;
  if (!state?.active) {
    return;
  }
  const scene = renderer._scene;
  const context = scene.context;
  const ranges = scene._view.frustumCommandsList;
  const near = frustum.near,
    far = frustum.far,
    pass = context.uniformState.pass;
  try {
    context.uniformState.updatePass(Pass.SCENEGIS_VECTOR);
    // Style is the outer loop. Each layer retains the native far-to-near
    // frustum precision while no later frustum can reorder a lower style layer.
    for (const [owner, map] of state.maps) {
      for (const order of [...map.orders].sort((a, b) => a - b)) {
        for (let index = ranges.length - 1; index >= 0; --index) {
          const range = ranges[index];
          frustum.near = range.near;
          frustum.far = range.far;
          context.uniformState.updateFrustum(frustum);
          for (let i = 0; i < range.indices[Pass.SCENEGIS_VECTOR]; ++i) {
            const command = range.commands[Pass.SCENEGIS_VECTOR][i];
            if (
              command.owner === owner &&
              symbol(command) &&
              command.uniformMap.u_sceneGISVectorStyleOrder() === order
            ) {
              execute(renderer, state, command, passState);
            }
          }
        }
      }
    }
  } finally {
    state.active = false;
    frustum.near = near;
    frustum.far = far;
    context.uniformState.updateFrustum(frustum);
    context.uniformState.updatePass(pass);
  }
}

/** Dedicated ordered map picking, with external depth recorded without replay. @private */
export default { begin, object, draw, release };
