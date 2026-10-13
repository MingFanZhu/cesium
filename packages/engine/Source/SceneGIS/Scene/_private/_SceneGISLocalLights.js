import Cartesian3 from "../../../Core/Cartesian3.js";
import combine from "../../../Core/combine.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix4 from "../../../Core/Matrix4.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Pass from "../../../Renderer/Pass.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import SceneMode from "../../../Scene/SceneMode.js";
import localLights from "../../../Shaders/SceneGIS/Rendering/SceneGISLocalLights.js";
import localPbr from "../../../Shaders/SceneGIS/Rendering/SceneGISLocalPbr.js";
import SceneGISSpotLight from "../SceneGISSpotLight.js";
import LightTiles from "./_SceneGISLightTiles.js";
import Validation from "./_SceneGISLightValidation.js";

const passes = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE, Pass.TRANSLUCENT];
const phongPattern = /czm_(?:private_phong|phong|translucentPhong)\s*\(/;

function createState(collection) {
  const state = {
    count: 0,
    tiles: undefined,
    receivers: new WeakMap(),
    shaders: new WeakMap(),
    position: new Cartesian3(),
    direction: new Cartesian3(),
  };
  state.uniforms = {
    u_sceneGISLightCount: () => state.count,
    u_sceneGISLightTable: () => state.tiles.texture,
    u_sceneGISLightIndexRow: () => state.tiles.indexRow,
    u_sceneGISLightGrid: () => state.tiles.grid,
    u_sceneGISLightTiled: () => collection._tiled,
  };
  return state;
}

/** @private */
const SceneGISLocalLights = {};

SceneGISLocalLights.prepare = function (scene, camera = scene.camera) {
  const collection = scene._sceneGISLights;
  if (!collection) {
    return;
  }
  const state =
    collection._state ?? (collection._state = createState(collection));
  state.count = 0;
  if (typeof collection.show !== "boolean") {
    throw new DeveloperError("Light collection show must be a boolean.");
  }
  if (!collection.show || collection.length === 0) {
    state.tiles = state.tiles?.destroy();
    return;
  }
  if (scene.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError("Local lighting requires SCENE3D.");
  }
  const view = camera.viewMatrix;
  for (const light of collection._lights) {
    Validation.point(light);
    const spot = light instanceof SceneGISSpotLight;
    if (spot) {
      Validation.spot(light);
    }
    if (!light.show || light.intensity === 0) {
      continue;
    }
    state.tiles ??= new LightTiles(scene.context);
    const data = state.tiles.parameters;
    const offset = state.count++ * 16;
    Matrix4.multiplyByPoint(view, light.position, state.position);
    data[offset] = state.position.x;
    data[offset + 1] = state.position.y;
    data[offset + 2] = state.position.z;
    data[offset + 3] = light.range * light.range;
    const color = light.color;
    data[offset + 4] = color.red * light.intensity;
    data[offset + 5] = color.green * light.intensity;
    data[offset + 6] = color.blue * light.intensity;
    data[offset + 7] = light.radius * light.radius;
    if (spot) {
      Cartesian3.normalize(light.direction, state.direction);
      Matrix4.multiplyByPointAsVector(view, state.direction, state.direction);
      const outer = Math.cos(light.outerConeAngle);
      data[offset + 8] = state.direction.x;
      data[offset + 9] = state.direction.y;
      data[offset + 10] = state.direction.z;
      data[offset + 11] = outer;
      data[offset + 12] = 1 / (Math.cos(light.innerConeAngle) - outer);
    } else {
      data[offset + 12] = -1;
    }
  }
  if (state.count) {
    state.tiles.update(
      state.count,
      camera,
      scene.context.drawingBufferWidth,
      scene.context.drawingBufferHeight,
    );
  } else {
    state.tiles = state.tiles?.destroy();
  }
};

SceneGISLocalLights.receiver = function (scene, command) {
  const state = scene._sceneGISLights?._state;
  if (
    !state?.count ||
    !scene.frameState.passes.render ||
    !passes.includes(command.pass) ||
    command.owner?._sceneGISWater ||
    !command.shaderProgram
  ) {
    return command;
  }
  const shader = command.shaderProgram;
  let info = state.shaders.get(shader);
  if (!info) {
    const fs = shader.fragmentShaderSource;
    const qualifies =
      fs.sources.some((s) => s.includes("SCENEGIS_LOCAL_LIGHT_RECEIVER")) ||
      (ShaderSource.findPositionVarying(fs) !== undefined &&
        fs.sources.some((s) => phongPattern.test(s)));
    info = { qualifies, program: undefined };
    state.shaders.set(shader, info);
  }
  if (!info.qualifies) {
    return command;
  }
  let result = state.receivers.get(command);
  if (!result) {
    result = {};
    state.receivers.set(command, result);
  }
  let program = info.program;
  if (!program) {
    program = scene.context.shaderCache.getDerivedShaderProgram(
      shader,
      "sceneGIS_localLights",
    );
  }
  if (!program) {
    const fs = shader.fragmentShaderSource.clone();
    const vs = shader.vertexShaderSource.clone();
    fs.defines.push("SCENEGIS_LOCAL_LIGHTS");
    vs.defines.push("SCENEGIS_LOCAL_LIGHTS");
    const phong = fs.sources.some((s) => phongPattern.test(s));
    const model = fs.sources.some((s) => s.includes("computePbrLighting"));
    fs.sources.unshift(localLights);
    if (model) {
      fs.sources.push(localPbr);
    }
    if (phong) {
      const varying = ShaderSource.findPositionVarying(fs);
      fs.sources.push(`vec3 sceneGISLocalPositionEC() { return ${varying}; }`);
    }
    program = scene.context.shaderCache.createDerivedShaderProgram(
      shader,
      "sceneGIS_localLights",
      {
        vertexShaderSource: vs,
        fragmentShaderSource: fs,
        attributeLocations: shader._attributeLocations,
      },
    );
  }
  info.program = program;
  if (!result.uniformMap || result.sourceUniforms !== command.uniformMap) {
    result.sourceUniforms = command.uniformMap;
    result.uniformMap = combine(state.uniforms, command.uniformMap);
  }
  result.command = DrawCommand.shallowClone(command, result.command);
  result.command.shaderProgram = program;
  result.command.uniformMap = result.uniformMap;
  return result.command;
};

export default SceneGISLocalLights;
