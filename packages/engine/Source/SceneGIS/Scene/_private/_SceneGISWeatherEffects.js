import DeveloperError from "../../../Core/DeveloperError.js";
import defined from "../../../Core/defined.js";
import SceneMode from "../../../Scene/SceneMode.js";
import SceneGISPlanarWorld from "../SceneGISPlanarWorld.js";
import SceneGISEnvironmentEffects from "../SceneGISEnvironmentEffects.js";
import SceneGISSurfaceWeather from "../SceneGISSurfaceWeather.js";
import SceneGISRainLensStage from "../SceneGISRainLensStage.js";
import SceneGISSnowLensStage from "../SceneGISSnowLensStage.js";

const controlNames = ["fog", "surface", "lens"];

function range(name, value, maximum = 1) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new DeveloperError(`${name} must be in [0, ${maximum}].`);
  }
}

function validateControls(effects) {
  for (const name of controlNames) {
    const control = effects[name];
    if (
      typeof control.automatic !== "boolean" ||
      typeof control.enabled !== "boolean"
    ) {
      throw new DeveloperError(
        `${name}.automatic and enabled must be boolean.`,
      );
    }
  }
  if (effects.fog.automatic && !effects.environmentEffects) {
    throw new DeveloperError("Automatic fog requires environmentEffects.");
  }
  range("fog.density", effects.fog.density, 0.001);
  range("surface.wetness", effects.surface.wetness);
  range("surface.snowCoverage", effects.surface.snowCoverage);
  range("surface.rippleIntensity", effects.surface.rippleIntensity);
  range("lens.rainIntensity", effects.lens.rainIntensity);
  range("lens.snowIntensity", effects.lens.snowIntensity);
  if (
    typeof effects.lens.rainEnabled !== "boolean" ||
    typeof effects.lens.snowEnabled !== "boolean"
  ) {
    throw new DeveloperError(
      "lens.rainEnabled and snowEnabled must be boolean.",
    );
  }
}

function binding(target, fields) {
  return fields.map((key) => ({
    target,
    key,
    previous: target[key],
    last: undefined,
  }));
}

function write(field, value) {
  const { target, key } = field;
  if (target[key] !== value) {
    target[key] = value;
  }
  field.last = value;
}

function restore(fields) {
  for (const field of fields) {
    if (field.last !== undefined && field.target[field.key] === field.last) {
      write(field, field.previous);
    }
  }
}

/** Owns explicit weather composition without introducing another render pipeline.
 * @private
 */
class SceneGISWeatherEffects {
  constructor(weather, options) {
    const scene = options.scene;
    if (
      !scene ||
      typeof scene.isDestroyed !== "function" ||
      scene.isDestroyed() ||
      scene.mode !== SceneMode.SCENE3D ||
      scene._sceneGISWeather ||
      scene.world instanceof SceneGISPlanarWorld !== (weather.mode === "planar")
    ) {
      throw new DeveloperError(
        "Weather requires a matching live SCENE3D Scene without bound weather.",
      );
    }
    const environment = options.environmentEffects;
    if (
      defined(environment) &&
      (!(environment instanceof SceneGISEnvironmentEffects) ||
        environment.mode !== weather.mode ||
        (environment._scene && environment._scene !== scene) ||
        (weather.mode === "planar" && environment._world !== scene.world))
    ) {
      throw new DeveloperError(
        "environmentEffects must belong to the weather Scene and mode.",
      );
    }
    const surface = options.surfaceWeather ?? scene._sceneGISSurfaceWeather;
    if (
      defined(surface) &&
      (!(surface instanceof SceneGISSurfaceWeather) ||
        surface.isDestroyed() ||
        surface._scene !== scene)
    ) {
      throw new DeveloperError(
        "surfaceWeather must belong to the weather Scene.",
      );
    }
    for (const [stage, Type, property] of [
      [options.rainLens, SceneGISRainLensStage, "_rainScene"],
      [options.snowLens, SceneGISSnowLensStage, "_snowScene"],
    ]) {
      if (
        defined(stage) &&
        (!(stage instanceof Type) ||
          stage.isDestroyed() ||
          stage[property] !== scene ||
          !scene.postProcessStages.contains(stage))
      ) {
        throw new DeveloperError(
          "Borrowed lens stages must be live members of the weather Scene.",
        );
      }
    }
    this.scene = scene;
    this.environmentEffects = environment;
    this.fog = {
      automatic: !!environment,
      enabled: true,
      density: 0.0003,
      ...options.fog,
    };
    this.surface = {
      automatic: true,
      enabled: true,
      wetness: 0.8,
      snowCoverage: 0.95,
      rippleIntensity: 1,
      ...options.surface,
    };
    this.lens = {
      automatic: true,
      enabled: true,
      rainEnabled: true,
      snowEnabled: true,
      rainIntensity: 0.7,
      snowIntensity: 0.7,
      ...options.lens,
    };
    validateControls(this);
    this.ownsSurface = !surface;
    this.ownsRainLens = !options.rainLens;
    this.ownsSnowLens = !options.snowLens;
    this.surfaceWeather = surface ?? new SceneGISSurfaceWeather({ scene });
    this.rainLens =
      options.rainLens ??
      scene.postProcessStages.add(new SceneGISRainLensStage({ scene }));
    this.snowLens =
      options.snowLens ??
      scene.postProcessStages.add(new SceneGISSnowLensStage({ scene }));
    this.fogFields = environment
      ? binding(environment, ["heightFogDensity", "showHeightFog"])
      : [];
    this.surfaceFields = binding(this.surfaceWeather, [
      "wetness",
      "snowCoverage",
      "rippleIntensity",
      "enabled",
    ]);
    this.rainFields = binding(this.rainLens, ["intensity", "enabled"]);
    this.snowFields = binding(this.snowLens, ["intensity", "enabled"]);
    scene._sceneGISWeather = weather;
  }

  update(weather) {
    validateControls(this);
    if (
      this.environmentEffects?._scene &&
      this.environmentEffects._scene !== this.scene
    ) {
      throw new DeveloperError(
        "environmentEffects must remain bound to the weather Scene.",
      );
    }
    const intensity = weather.show ? weather.actualIntensity : 0;
    const rain = intensity * (1 - weather._snow);
    const snow = intensity * weather._snow;
    if (this.fog.automatic) {
      const density = this.fog.enabled ? intensity * this.fog.density : 0;
      write(this.fogFields[0], density);
      write(this.fogFields[1], density > 0);
    }
    if (this.surface.automatic) {
      const control = this.surface;
      write(
        this.surfaceFields[0],
        control.enabled ? rain * control.wetness : 0,
      );
      write(
        this.surfaceFields[1],
        control.enabled ? snow * control.snowCoverage : 0,
      );
      write(
        this.surfaceFields[2],
        control.enabled ? rain * control.rippleIntensity : 0,
      );
      write(this.surfaceFields[3], control.enabled && intensity > 0);
    }
    if (this.lens.automatic) {
      const control = this.lens;
      const rainAmount =
        control.enabled && control.rainEnabled
          ? rain * control.rainIntensity
          : 0;
      const snowAmount =
        control.enabled && control.snowEnabled
          ? snow * control.snowIntensity
          : 0;
      write(this.rainFields[0], rainAmount);
      write(this.rainFields[1], rainAmount > 0);
      write(this.snowFields[0], snowAmount);
      write(this.snowFields[1], snowAmount > 0);
    }
  }

  destroy() {
    restore(this.fogFields);
    if (!this.surfaceWeather.isDestroyed()) {
      if (this.ownsSurface) {
        this.surfaceWeather.destroy();
      } else {
        restore(this.surfaceFields);
      }
    }
    for (const [stage, owned, fields] of [
      [this.rainLens, this.ownsRainLens, this.rainFields],
      [this.snowLens, this.ownsSnowLens, this.snowFields],
    ]) {
      if (!stage.isDestroyed()) {
        if (owned) {
          this.scene.postProcessStages.remove(stage);
        } else {
          restore(fields);
        }
      }
    }
    this.scene._sceneGISWeather = undefined;
  }
}

export default SceneGISWeatherEffects;
