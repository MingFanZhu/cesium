import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import JulianDate from "../../../Core/JulianDate.js";
import combine from "../../../Core/combine.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Pass from "../../../Renderer/Pass.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import SceneMode from "../../../Scene/SceneMode.js";
import common from "../../../Shaders/SceneGIS/Weather/SceneGISSurfaceWeather.js";
import model from "../../../Shaders/SceneGIS/Weather/SceneGISSurfaceWeatherModel.js";
import phong from "../../../Shaders/SceneGIS/Weather/SceneGISSurfaceWeatherPhong.js";

const passes = [Pass.GLOBE, Pass.CESIUM_3D_TILE, Pass.OPAQUE];
const phongPattern = /czm_(?:private_phong|phong)\s*\(/;

function createState(effect) {
  const state = {
    active: false,
    origin: new Cartesian3(),
    amounts: new Cartesian2(),
    rippleOrigin: new Cartesian3(),
    ripples: new Cartesian4(),
    epoch: undefined,
    shaders: new WeakMap(),
    receivers: new WeakMap(),
  };
  state.uniforms = {
    u_sceneGISSurfaceOrigin: () => state.origin,
    u_sceneGISSurfaceAmounts: () => state.amounts,
    u_sceneGISSurfaceScale: () => effect.patchScale,
    u_sceneGISRippleOrigin: () => state.rippleOrigin,
    u_sceneGISSurfaceRipples: () => state.ripples,
    u_sceneGISSurfaceSnowColor: () => effect.snowColor,
    u_sceneGISSurfacePlanar: () =>
      !!effect._scene.world && effect._scene.world !== effect._scene.globe,
  };
  return state;
}

/** @private */
const SurfaceWeather = {};
SurfaceWeather.prepare = function (scene, camera = scene.camera) {
  const effect = scene._sceneGISSurfaceWeather;
  if (!effect) {
    return;
  }
  if (!effect.enabled || (effect.wetness === 0 && effect.snowCoverage === 0)) {
    if (effect._state) {
      effect._state.active = false;
    }
    return;
  }
  if (scene.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError("Surface weather requires SCENE3D.");
  }
  const state = effect._state ?? (effect._state = createState(effect));
  state.active = true;
  Cartesian2.fromElements(effect.wetness, effect.snowCoverage, state.amounts);
  // Reduce in double precision. Periodic noise remains anchored across camera/grid crossings.
  const p = camera.positionWC;
  const scale = effect.patchScale;
  Cartesian3.fromElements(
    (((p.x / scale) % 256) + 256) % 256,
    (((p.y / scale) % 256) + 256) % 256,
    (((p.z / scale) % 256) + 256) % 256,
    state.origin,
  );
  const rippleScale = effect.rippleScale;
  Cartesian3.fromElements(
    (((p.x / rippleScale) % 256) + 256) % 256,
    (((p.y / rippleScale) % 256) + 256) % 256,
    (((p.z / rippleScale) % 256) + 256) % 256,
    state.rippleOrigin,
  );
  const time = scene.frameState.time;
  state.epoch ??= JulianDate.clone(time);
  const seconds = JulianDate.secondsDifference(time, state.epoch);
  // The procedural impact hash repeats every 256 two-second cycles.
  Cartesian4.fromElements(
    effect.rippleIntensity,
    rippleScale,
    ((seconds % 512) + 512) % 512,
    0.22,
    state.ripples,
  );
};

SurfaceWeather.receiver = function (scene, command) {
  const state = scene._sceneGISSurfaceWeather?._state;
  if (
    !state?.active ||
    !scene.frameState.passes.render ||
    !passes.includes(command.pass) ||
    command.owner?._sceneGISWater ||
    !command.shaderProgram ||
    command.renderState.blending.enabled
  ) {
    return command;
  }
  const shader = command.shaderProgram;
  let kind = state.shaders.get(shader);
  if (kind === undefined) {
    const fs = shader.fragmentShaderSource;
    kind =
      fs.sources.some((s) => s.includes("SCENEGIS_SURFACE_WEATHER_MODEL")) &&
      fs.defines.includes("LIGHTING_PBR") &&
      fs.defines.includes("HAS_NORMALS")
        ? "model"
        : fs.sources.some((s) => s.includes("SCENEGIS_SURFACE_WEATHER_TERRAIN"))
          ? "terrain"
          : ShaderSource.findPositionVarying(fs) &&
              fs.sources.some((s) => phongPattern.test(s))
            ? "phong"
            : "none";
    state.shaders.set(shader, kind);
  }
  if (kind === "none") {
    return command;
  }
  let result = state.receivers.get(command);
  if (!result) {
    result = {};
    state.receivers.set(command, result);
  }
  let program = scene.context.shaderCache.getDerivedShaderProgram(
    shader,
    "sceneGIS_surfaceWeather",
  );
  if (!program) {
    const fs = shader.fragmentShaderSource.clone();
    const vs = shader.vertexShaderSource.clone();
    fs.defines.push("SCENEGIS_SURFACE_WEATHER");
    vs.defines.push("SCENEGIS_SURFACE_WEATHER");
    fs.sources.unshift(common);
    if (kind === "model") {
      fs.sources.push(model);
    }
    if (kind === "phong") {
      fs.sources.push(
        phong,
        `vec3 sceneGISWeatherPositionEC() { return ${ShaderSource.findPositionVarying(fs)}; }`,
      );
    }
    program = scene.context.shaderCache.createDerivedShaderProgram(
      shader,
      "sceneGIS_surfaceWeather",
      {
        vertexShaderSource: vs,
        fragmentShaderSource: fs,
        attributeLocations: shader._attributeLocations,
      },
    );
  }
  if (result.sourceUniforms !== command.uniformMap) {
    result.sourceUniforms = command.uniformMap;
    result.uniformMap = combine(state.uniforms, command.uniformMap);
  }
  result.command = DrawCommand.shallowClone(command, result.command);
  result.command.shaderProgram = program;
  result.command.uniformMap = result.uniformMap;
  return result.command;
};
export default SurfaceWeather;
