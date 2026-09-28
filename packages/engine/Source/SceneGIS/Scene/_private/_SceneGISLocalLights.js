import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
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
import Validation from "./_SceneGISLightValidation.js";

const passes = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE, Pass.TRANSLUCENT];
const phongPattern = /czm_(?:private_phong|phong|translucentPhong)\s*\(/;

function createState() {
  const state = {
    count: 0,
    positions: Array.from({ length: 16 }, () => new Cartesian4()),
    colors: Array.from({ length: 16 }, () => new Cartesian4()),
    directions: Array.from({ length: 16 }, () => new Cartesian4()),
    cones: new Float32Array(16),
    receivers: new WeakMap(),
    shaders: new WeakMap(),
    position: new Cartesian3(),
    direction: new Cartesian3(),
  };
  state.uniforms = {
    u_sceneGISLightCount: () => state.count,
    u_sceneGISLightPositions: () => state.positions,
    u_sceneGISLightColors: () => state.colors,
    u_sceneGISLightDirections: () => state.directions,
    u_sceneGISLightCones: () => state.cones,
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
  const state = collection._state ?? (collection._state = createState());
  state.count = 0;
  if (typeof collection.show !== "boolean") {
    throw new DeveloperError("Light collection show must be a boolean.");
  }
  if (!collection.show || collection.length === 0) {
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
    const index = state.count++;
    Matrix4.multiplyByPoint(view, light.position, state.position);
    Cartesian4.fromElements(
      state.position.x,
      state.position.y,
      state.position.z,
      light.range * light.range,
      state.positions[index],
    );
    const color = light.color;
    Cartesian4.fromElements(
      color.red * light.intensity,
      color.green * light.intensity,
      color.blue * light.intensity,
      light.radius * light.radius,
      state.colors[index],
    );
    if (spot) {
      Cartesian3.normalize(light.direction, state.direction);
      Matrix4.multiplyByPointAsVector(view, state.direction, state.direction);
      const outer = Math.cos(light.outerConeAngle);
      Cartesian4.fromElements(
        state.direction.x,
        state.direction.y,
        state.direction.z,
        outer,
        state.directions[index],
      );
      state.cones[index] = 1 / (Math.cos(light.innerConeAngle) - outer);
    } else {
      state.cones[index] = -1;
    }
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
  let qualifies = state.shaders.get(shader);
  if (qualifies === undefined) {
    const fs = shader.fragmentShaderSource;
    qualifies =
      fs.sources.some((s) => s.includes("SCENEGIS_LOCAL_LIGHT_RECEIVER")) ||
      (ShaderSource.findPositionVarying(fs) !== undefined &&
        fs.sources.some((s) => phongPattern.test(s)));
    state.shaders.set(shader, qualifies);
  }
  if (!qualifies) {
    return command;
  }
  let result = state.receivers.get(command);
  if (!result) {
    result = {};
    state.receivers.set(command, result);
  }
  let program = scene.context.shaderCache.getDerivedShaderProgram(
    shader,
    "sceneGIS_localLights",
  );
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
