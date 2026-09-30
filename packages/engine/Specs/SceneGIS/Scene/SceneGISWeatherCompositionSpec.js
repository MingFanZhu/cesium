import {
  Cartesian3,
  Matrix4,
  JulianDate,
  SceneGISWeather,
  SceneGISEnvironmentEffects,
  SceneGISSurfaceWeather,
  SceneGISRainLensStage,
  SceneGISSnowLensStage,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";

describe("SceneGIS/Scene/SceneGISWeatherComposition", function () {
  let scene, weather, effects;
  const epoch = JulianDate.fromIso8601("2026-09-30T00:00:00Z");
  function createSceneAndEnvironment(planar = true) {
    scene = createScene({ canvas: createCanvas(32, 32), scene3DOnly: true });
    scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
    scene.fog.enabled = false;
    if (planar) {
      scene._initializeWorld(
        new SceneGISPlanarWorld({
          coordinateSystem: new SceneGISPlanarCoordinateSystem({
            extent: new SceneGISPlanarExtent({
              minimumX: -1000,
              maximumX: 1000,
              minimumY: -1000,
              maximumY: 1000,
            }),
          }),
          maximumLevel: 0,
        }),
      );
    }
    effects = new SceneGISEnvironmentEffects({
      mode: planar ? "planar" : "globe",
      world: planar ? scene.world : undefined,
      heightFogDensity: 0.0001,
      showHeightFog: false,
    });
  }
  function create(options = {}) {
    weather = scene.primitives.add(
      new SceneGISWeather({
        scene,
        environmentEffects: effects,
        mode: scene.world ? "planar" : "globe",
        quality: "low",
        intensity: 1,
        transitionDuration: 0,
        ...options,
      }),
    );
    return weather;
  }
  function tick(seconds) {
    scene.preUpdate.raiseEvent(
      scene,
      JulianDate.addSeconds(epoch, seconds, new JulianDate()),
    );
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    scene = weather = effects = undefined;
  });

  [true, false].forEach(function (planar) {
    it(`coordinates rain, snow and clear in ${planar ? "Planar" : "Globe"} without changing lighting`, function () {
      createSceneAndEnvironment(planar);
      const light = scene.light;
      const exposure = scene.postProcessStages.exposure;
      create({ surface: { wetness: 0.6, snowCoverage: 0.9 } });
      const surface = weather.surfaceWeather;
      const rain = weather.rainLens;
      const snow = weather.snowLens;
      tick(0);
      expect([
        surface.wetness,
        surface.snowCoverage,
        surface.rippleIntensity,
        surface.enabled,
      ]).toEqual([0.6, 0, 1, true]);
      expect([rain.enabled, rain.intensity, snow.enabled]).toEqual([
        true,
        0.7,
        false,
      ]);
      expect([effects.showHeightFog, effects.heightFogDensity]).toEqual([
        true,
        0.0003,
      ]);
      weather.type = "snow";
      tick(1);
      expect([
        surface.wetness,
        surface.snowCoverage,
        surface.rippleIntensity,
      ]).toEqual([0, 0.9, 0]);
      expect([rain.enabled, snow.enabled, snow.intensity]).toEqual([
        false,
        true,
        0.7,
      ]);
      weather.intensity = 0;
      tick(2);
      expect([
        surface.enabled,
        rain.enabled,
        snow.enabled,
        effects.showHeightFog,
      ]).toEqual([false, false, false, false]);
      expect(weather.surface.wetness).toBe(0.6);
      expect(weather.surface.snowCoverage).toBe(0.9);
      expect(weather.surfaceWeather).toBe(surface);
      expect(weather.rainLens).toBe(rain);
      expect(scene.light).toBe(light);
      expect(scene.postProcessStages.exposure).toBe(exposure);
      expect(effects.enabled).toBeFalse();
    });
  });

  it("shares transitioned state before surface preparation and advances only once", function () {
    createSceneAndEnvironment();
    create({ transitionDuration: 2, lens: { enabled: false } });
    scene.renderForSpecs(epoch);
    scene.renderForSpecs(JulianDate.addSeconds(epoch, 1, new JulianDate()));
    expect(weather.actualIntensity).toBe(0.5);
    expect(weather.surfaceWeather.wetness).toBe(0.4);
    expect(weather.surfaceWeather._state.active).toBeTrue();
    weather.type = "snow";
    tick(2);
    expect(weather.actualIntensity).toBe(1);
    expect(weather.surfaceWeather.wetness).toBe(0.4);
    expect(weather.surfaceWeather.snowCoverage).toBe(0.475);
    weather.paused = true;
    tick(5);
    expect(weather.surfaceWeather.snowCoverage).toBe(0.475);
    weather.show = false;
    tick(8);
    expect(weather.surfaceWeather.enabled).toBeFalse();
    expect(effects.showHeightFog).toBeFalse();
    weather.show = true;
    tick(9);
    expect(weather.surfaceWeather.snowCoverage).toBe(0.475);
    weather.paused = false;
    tick(10);
    expect(weather.surfaceWeather.snowCoverage).toBe(0.95);
  });

  it("gives manual channels exclusive authority and performs no steady-state writes", function () {
    createSceneAndEnvironment();
    create();
    tick(0);
    const request = spyOn(scene, "requestRender").and.callThrough();
    tick(1);
    tick(2);
    expect(request).not.toHaveBeenCalled();
    weather.fog.automatic =
      weather.surface.automatic =
      weather.lens.automatic =
        false;
    effects.heightFogDensity = 0.00012;
    effects.showHeightFog = false;
    weather.surfaceWeather.wetness = 0.2;
    weather.surfaceWeather.enabled = true;
    weather.rainLens.intensity = 0.3;
    weather.rainLens.enabled = true;
    weather.show = false;
    weather.type = "snow";
    weather.intensity = 0;
    request.calls.reset();
    tick(3);
    expect([
      effects.heightFogDensity,
      effects.showHeightFog,
      weather.surfaceWeather.wetness,
      weather.surfaceWeather.enabled,
      weather.rainLens.intensity,
      weather.rainLens.enabled,
    ]).toEqual([0.00012, false, 0.2, true, 0.3, true]);
    expect(request).not.toHaveBeenCalled();
    weather.fog.automatic = true;
    tick(4);
    expect(effects.heightFogDensity).toBe(0);
    expect(weather.surfaceWeather.enabled).toBeTrue();
  });

  it("rebases the last rendered particle state after update-only ticks", function () {
    createSceneAndEnvironment();
    scene.camera.setView({ destination: new Cartesian3(0, 0, 100) });
    create({ lens: { enabled: false } });
    scene.renderForSpecs(epoch);
    const original = Matrix4.clone(weather._stateMatrix);
    tick(1);
    // No intervening primitive update; the next render can have the same time
    // as the last preUpdate, while particle simulation still needs to advance.
    scene.camera.moveRight(5);
    scene.renderForSpecs(JulianDate.addSeconds(epoch, 1, new JulianDate()));
    expect(Matrix4.equals(weather._stateMatrix, original)).toBeFalse();
    expect(weather._stateMatrix).toEqual(weather._matrix);
    expect(weather._renderTransform).toEqual(Matrix4.IDENTITY);
  });

  it("reuses borrowed components and conditionally restores their values on removal", function () {
    createSceneAndEnvironment();
    const surface = new SceneGISSurfaceWeather({
      scene,
      enabled: true,
      wetness: 0.25,
    });
    const rain = scene.postProcessStages.add(
      new SceneGISRainLensStage({ scene, intensity: 0.4 }),
    );
    const snow = scene.postProcessStages.add(
      new SceneGISSnowLensStage({ scene }),
    );
    create({ rainLens: rain, snowLens: snow });
    expect(weather.surfaceWeather).toBe(surface);
    tick(0);
    weather.surface.automatic = false;
    surface.wetness = 0.33;
    scene.primitives.remove(weather);
    expect(weather.isDestroyed()).toBeTrue();
    expect([
      surface.isDestroyed(),
      rain.isDestroyed(),
      snow.isDestroyed(),
    ]).toEqual([false, false, false]);
    expect(surface.wetness).toBe(0.33);
    expect(surface.rippleIntensity).toBe(0);
    expect([effects.heightFogDensity, effects.showHeightFog]).toEqual([
      0.0001,
      false,
    ]);
    expect([rain.enabled, rain.intensity, snow.enabled]).toEqual([
      false,
      0.4,
      false,
    ]);
    expect(scene._sceneGISWeather).toBeUndefined();
  });

  it("releases owned components/listener and permits a new system without duplicate passes", function () {
    createSceneAndEnvironment();
    const listeners = scene.preUpdate.numberOfListeners;
    const stages = scene.postProcessStages.length;
    create();
    tick(0);
    const surface = weather.surfaceWeather,
      rain = weather.rainLens,
      snow = weather.snowLens;
    expect(scene.postProcessStages.length).toBe(stages + 2);
    scene.primitives.remove(weather);
    expect([
      surface.isDestroyed(),
      rain.isDestroyed(),
      snow.isDestroyed(),
    ]).toEqual([true, true, true]);
    expect(scene.preUpdate.numberOfListeners).toBe(listeners);
    expect(weather._effects).toBeUndefined();
    expect(weather._removePreUpdate).toBeUndefined();
    expect(scene.postProcessStages.length).toBe(stages);
    expect(scene._sceneGISSurfaceWeather).toBeUndefined();
    create({ intensity: 0 });
    tick(1);
    expect(weather.textureMemoryInBytes).toBe(0);
    expect(weather.rainLens.enabled).toBeFalse();
    expect(weather.snowLens.enabled).toBeFalse();
  });

  it("rejects invalid bindings before creating components and rejects missing fog binding", function () {
    createSceneAndEnvironment();
    const stages = scene.postProcessStages.length;
    expect(
      () => new SceneGISWeather({ scene, mode: "globe" }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISWeather({
          scene,
          mode: "planar",
          fog: { automatic: true },
        }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISWeather({ scene, mode: "planar", surface: { wetness: 2 } }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISWeather({ mode: "planar", environmentEffects: effects }),
    ).toThrowDeveloperError();
    expect(scene._sceneGISWeather).toBeUndefined();
    expect(scene._sceneGISSurfaceWeather).toBeUndefined();
    expect(scene.postProcessStages.length).toBe(stages);
    const otherScene = createScene({ canvas: createCanvas(8, 8) });
    try {
      const otherRain = otherScene.postProcessStages.add(
        new SceneGISRainLensStage({ scene: otherScene }),
      );
      expect(
        () =>
          new SceneGISWeather({ scene, mode: "planar", rainLens: otherRain }),
      ).toThrowDeveloperError();
      expect(otherRain.isDestroyed()).toBeFalse();
      expect(scene.postProcessStages.length).toBe(stages);
    } finally {
      otherScene.destroyForSpecs();
    }
    create({ environmentEffects: undefined });
    expect(weather.fog.automatic).toBeFalse();
    expect(
      () => new SceneGISWeather({ scene, mode: "planar" }),
    ).toThrowDeveloperError();
    weather.fog.automatic = true;
    expect(() => tick(0)).toThrowDeveloperError();
    weather.fog.automatic = false;
    weather.lens.rainIntensity = NaN;
    expect(() => tick(1)).toThrowDeveloperError();
  });
});
