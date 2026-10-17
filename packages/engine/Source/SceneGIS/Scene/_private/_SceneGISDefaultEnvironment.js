import defined from "../../../Core/defined.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import SceneGISEnvironmentEffects from "../SceneGISEnvironmentEffects.js";
import SceneGISPlanarEnvironment from "../SceneGISPlanarEnvironment.js";
import SceneGISPlanarWorld from "../SceneGISPlanarWorld.js";

function explicitEffects(scene, defaults) {
  return (
    scene.controllerHost._controllers.find(
      (controller) => controller instanceof SceneGISEnvironmentEffects,
    ) ??
    (scene._sceneGISEnvironmentEffectsPipeline?._owner !== defaults?.effects
      ? scene._sceneGISEnvironmentEffectsPipeline?._owner
      : undefined)
  );
}

function disconnect(controller) {
  if (defined(controller?._element)) {
    controller.disconnectedCallback(controller._element);
  }
}

/**
 * Owns only the default environment and its optional fixed-Z light authority.
 * Explicit controllers remain caller-owned, including when disabled.
 * @private
 */
class SceneGISDefaultEnvironment {
  constructor(scene) {
    const world = scene.world;
    const planar = world instanceof SceneGISPlanarWorld;
    this.world = world;
    this.effects = new SceneGISEnvironmentEffects({
      mode: planar ? "planar" : "globe",
      world: planar ? world : undefined,
      enabled: true,
      showClouds: false,
      showCloudShadows: false,
      showCrepuscularRays: false,
      showBloom: false,
      showLensFlare: false,
    });
    this.light = undefined;
    this.element = scene.canvas;
  }

  releaseLight() {
    disconnect(this.light);
  }

  release() {
    disconnect(this.effects);
    this.releaseLight();
  }

  static get(scene) {
    const explicit = explicitEffects(scene, scene._sceneGISDefaultEnvironment);
    if (defined(explicit)) {
      return explicit;
    }
    if (
      !defined(scene.world) ||
      (scene.world !== scene.globe &&
        !(scene.world instanceof SceneGISPlanarWorld))
    ) {
      return undefined;
    }
    scene._sceneGISDefaultEnvironment ??= new SceneGISDefaultEnvironment(scene);
    return scene._sceneGISDefaultEnvironment.effects;
  }

  static release(scene) {
    scene._sceneGISDefaultEnvironment?.release();
    scene._sceneGISDefaultEnvironment = undefined;
  }

  static prepare(scene, time) {
    const effective = SceneGISDefaultEnvironment.get(scene);
    const defaults = scene._sceneGISDefaultEnvironment;
    if (!defined(defaults)) {
      return;
    }
    if (effective !== defaults.effects) {
      disconnect(defaults.effects);
    }
    if (!effective?.enabled) {
      defaults.releaseLight();
      return;
    }
    if (!(defaults.world instanceof SceneGISPlanarWorld)) {
      return;
    }
    const world = defaults.world;
    if (!defined(world.environment)) {
      defaults.light ??= new SceneGISPlanarEnvironment({
        world,
        sunDirection: new Cartesian3(0, 0, 1),
        moonDirection: new Cartesian3(0, 0, -1),
      });
      defaults.light._defaultEnvironmentOwner = defaults;
      defaults.light.connectedCallback(defaults.element);
      defaults.light.firstUpdate(scene, time);
    } else if (world.environment === defaults.light) {
      defaults.light.update(scene, time);
    }
  }

  static update(scene, time) {
    const defaults = scene._sceneGISDefaultEnvironment;
    if (!defined(defaults) || defined(explicitEffects(scene, defaults))) {
      return;
    }
    const effects = defaults.effects;
    if (!effects.enabled) {
      return;
    }
    if (
      defaults.world instanceof SceneGISPlanarWorld &&
      !defaults.world.environment?._hasAuthority
    ) {
      disconnect(effects);
      return;
    }
    if (!defined(effects._element)) {
      effects.connectedCallback(defaults.element);
    }
    // update also performs the first activation and preserves error latching.
    effects.update(scene, time);
  }
}

export default SceneGISDefaultEnvironment;
