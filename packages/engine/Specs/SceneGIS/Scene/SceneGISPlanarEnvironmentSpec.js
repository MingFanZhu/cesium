import {
  Cartesian3,
  Color,
  DirectionalLight,
  SunLight,
  JulianDate,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarSkyBox,
  SceneGISPlanarWorld,
  SceneMode,
} from "../../../index.js";

describe("SceneGIS/Scene/SceneGISPlanarEnvironment", function () {
  function createWorld(offset = 0.0) {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: offset - 16.0,
          minimumY: offset - 16.0,
          maximumX: offset + 16.0,
          maximumY: offset + 16.0,
        }),
      }),
      maximumLevel: 1,
    });
  }

  function createEnvironment(world, options = {}) {
    return new SceneGISPlanarEnvironment({
      world,
      sunDirection: options.sunDirection ?? new Cartesian3(2.0, 0.0, 2.0),
      moonDirection: options.moonDirection ?? new Cartesian3(-1.0, 2.0, 0.5),
      sunColor: options.sunColor,
      sunIntensity: options.sunIntensity,
      directionMode: options.directionMode,
      originLongitude: options.originLongitude,
      originLatitude: options.originLatitude,
      showSun: options.showSun,
      showMoon: options.showMoon,
      sunPixelSize: options.sunPixelSize,
      moonPixelSize: options.moonPixelSize,
      moonColor: options.moonColor,
      showAtmosphere: options.showAtmosphere,
      atmosphereZenithColor: options.atmosphereZenithColor,
      atmosphereHorizonColor: options.atmosphereHorizonColor,
      atmosphereIntensity: options.atmosphereIntensity,
      atmosphereFadeHeight: options.atmosphereFadeHeight,
      skyBox: options.skyBox,
    });
  }

  function createSkyBox() {
    return new SceneGISPlanarSkyBox({
      sources: {
        positiveX: { width: 1, height: 1 },
        negativeX: { width: 1, height: 1 },
        positiveY: { width: 1, height: 1 },
        negativeY: { width: 1, height: 1 },
        positiveZ: { width: 1, height: 1 },
        negativeZ: { width: 1, height: 1 },
      },
    });
  }

  function createScene(world, light = new SunLight()) {
    return {
      world,
      mode: SceneMode.SCENE3D,
      light,
      requestRender: jasmine.createSpy("requestRender"),
      isDestroyed: () => false,
    };
  }

  it("normalizes defensive direction state and constructs one stable light", function () {
    const world = createWorld();
    const sun = new Cartesian3(Number.MAX_VALUE, Number.MAX_VALUE, 0.0);
    const moon = new Cartesian3(Number.MIN_VALUE, 0.0, Number.MIN_VALUE);
    const environment = createEnvironment(world, {
      sunDirection: sun,
      moonDirection: moon,
    });

    expect(environment.world).toBe(world);
    expect(environment.enabled).toBe(true);
    expect(environment.sunIntensity).toBe(2.0);
    expect(environment.sunColor).toEqual(Color.WHITE);
    expect(environment.sunDirection.x).toBeCloseTo(Math.SQRT1_2, 15);
    expect(environment.sunDirection.y).toBeCloseTo(Math.SQRT1_2, 15);
    expect(environment.sunDirection.z).toBe(0.0);
    expect(environment.moonDirection.x).toBeCloseTo(Math.SQRT1_2, 15);
    expect(environment.moonDirection.y).toBe(0.0);
    expect(environment.moonDirection.z).toBeCloseTo(Math.SQRT1_2, 15);
    expect(environment.light).toBeInstanceOf(DirectionalLight);
    expect(environment.light.direction).toEqual(
      Cartesian3.negate(environment.sunDirection, new Cartesian3()),
    );

    sun.x = 0.0;
    moon.z = 0.0;
    const exposedSun = environment.sunDirection;
    exposedSun.x = 0.0;
    const exposedColor = environment.sunColor;
    exposedColor.red = 0.0;
    expect(environment.sunDirection.x).toBeCloseTo(Math.SQRT1_2, 15);
    expect(environment.sunColor).toEqual(Color.WHITE);
    world.destroy();
  });

  it("validates cloned visible-body state and preserves same-value no-ops", function () {
    const world = createWorld();
    const moonColor = new Color(0.7, 0.8, 0.9, 0.6);
    const environment = createEnvironment(world, { moonColor });

    expect(environment.showSun).toBe(false);
    expect(environment.showMoon).toBe(false);
    expect(environment.sunPixelSize).toBe(48.0);
    expect(environment.moonPixelSize).toBe(36.0);
    expect(environment.moonColor).toEqual(moonColor);
    expect(environment.moonColor).not.toBe(moonColor);

    expect(() => {
      environment.showSun = 1;
    }).toThrowDeveloperError();
    expect(() => {
      environment.sunPixelSize = 0.0;
    }).toThrowDeveloperError();
    expect(() => {
      environment.moonPixelSize = Number.NaN;
    }).toThrowDeveloperError();
    expect(() => {
      environment.moonColor = new Color(Number.NaN, 0.0, 0.0, 1.0);
    }).toThrowDeveloperError();

    const scene = createScene(world);
    environment.connectedCallback({});
    environment.firstUpdate(scene, new JulianDate(2451545, 0.0));
    scene.requestRender.calls.reset();
    environment.showSun = true;
    environment.showSun = true;
    environment.sunPixelSize = 64.0;
    environment.sunPixelSize = 64.0;
    expect(scene.requestRender.calls.count()).toBe(2);
    world.destroy();
  });

  it("rejects visible native bodies without mutating planar visibility", function () {
    const world = createWorld();
    const environment = createEnvironment(world);
    const scene = createScene(world);
    scene.sun = { show: true };
    environment.connectedCallback({});

    environment.showSun = true;
    expect(() =>
      environment.firstUpdate(scene, new JulianDate(2451545, 0.0)),
    ).toThrowDeveloperError();
    expect(scene.requestRender).not.toHaveBeenCalled();
    expect(scene.light).not.toBe(environment.light);

    environment.showSun = false;
    environment.firstUpdate(scene, new JulianDate(2451545, 0.0));
    expect(() => {
      environment.showSun = true;
    }).toThrowDeveloperError();
    expect(environment.showSun).toBe(false);
    world.destroy();
  });

  it("rejects invalid constructor state before registering the world", function () {
    const world = createWorld();
    const validDirection = Cartesian3.UNIT_Z;
    const construct = (options) =>
      new SceneGISPlanarEnvironment({
        world,
        sunDirection: validDirection,
        moonDirection: validDirection,
        ...options,
      });

    expect(() =>
      construct({ sunDirection: Cartesian3.ZERO }),
    ).toThrowDeveloperError();
    expect(() =>
      construct({ moonDirection: new Cartesian3(NaN, 0.0, 1.0) }),
    ).toThrowDeveloperError();
    expect(() =>
      construct({ sunColor: new Color(Infinity, 0.0, 0.0, 1.0) }),
    ).toThrowDeveloperError();
    expect(() => construct({ sunIntensity: -1.0 })).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISPlanarEnvironment({
          world: {},
          sunDirection: validDirection,
          moonDirection: validDirection,
        }),
    ).toThrowDeveloperError();
    expect(world.environment).toBeUndefined();
    world.destroy();
  });

  it("keeps setters failure atomic, cloned, and no-op while inactive", function () {
    const world = createWorld();
    const environment = createEnvironment(world);
    const light = environment.light;
    const originalSun = environment.sunDirection;
    const originalMoon = environment.moonDirection;
    const originalColor = environment.sunColor;

    expect(() => {
      environment.sunDirection = Cartesian3.ZERO;
    }).toThrowDeveloperError();
    expect(() => {
      environment.moonDirection = new Cartesian3(0.0, Infinity, 0.0);
    }).toThrowDeveloperError();
    expect(() => {
      environment.sunColor = {};
    }).toThrowDeveloperError();
    expect(() => {
      environment.sunIntensity = NaN;
    }).toThrowDeveloperError();
    expect(() => {
      environment.enabled = 1;
    }).toThrowDeveloperError();
    expect(environment.sunDirection).toEqual(originalSun);
    expect(environment.moonDirection).toEqual(originalMoon);
    expect(environment.sunColor).toEqual(originalColor);
    expect(environment.sunIntensity).toBe(2.0);
    expect(environment.light).toBe(light);

    const color = new Color(2.0, 0.5, 0.25, 0.75);
    environment.sunColor = color;
    color.red = 9.0;
    environment.sunIntensity = 3.0;
    environment.sunDirection = new Cartesian3(4.0, 0.0, 4.0);
    expect(environment.sunColor.red).toBe(2.0);
    expect(environment.light.color.red).toBe(2.0);
    expect(environment.light.intensity).toBe(3.0);
    expect(environment.light).toBe(light);
    world.destroy();
  });

  it("atomically reserves one Environment per live world", function () {
    const world = createWorld();
    const first = createEnvironment(world);
    const second = createEnvironment(world);
    const firstElement = {};
    first.connectedCallback(firstElement);

    expect(world.environment).toBe(first);
    expect(() => first.connectedCallback({})).toThrowDeveloperError();
    expect(() => second.connectedCallback({})).toThrowDeveloperError();
    expect(world.environment).toBe(first);
    expect(first._element).toBe(firstElement);
    expect(second._element).toBeUndefined();

    first.disconnectedCallback(firstElement);
    second.connectedCallback(firstElement);
    expect(world.environment).toBe(second);
    second.disconnectedCallback(firstElement);
    world.destroy();
  });

  it("requests first authority once and keeps stable updates request-free", function () {
    const world = createWorld();
    const environment = createEnvironment(world);
    const element = {};
    const displaced = new SunLight();
    const scene = createScene(world, displaced);
    environment.connectedCallback(element);

    expect(scene.light).toBe(displaced);
    environment.firstUpdate(scene);
    expect(scene.light).toBe(environment.light);
    expect(scene.requestRender).toHaveBeenCalledTimes(1);
    expect(environment.light.direction).toEqual(
      Cartesian3.negate(environment.sunDirection, new Cartesian3()),
    );
    environment.light.direction.x = 9.0;
    environment.light.color.red = 9.0;
    environment.light.intensity = 9.0;
    const override = new DirectionalLight({ direction: Cartesian3.UNIT_Y });
    scene.light = override;
    environment.update(scene);
    expect(scene.light).toBe(override);
    expect(environment.light.direction).toEqual(
      Cartesian3.negate(environment.sunDirection, new Cartesian3()),
    );
    expect(environment.light.color).toEqual(environment.sunColor);
    expect(environment.light.intensity).toBe(environment.sunIntensity);
    expect(scene.requestRender).toHaveBeenCalledTimes(1);

    environment.disconnectedCallback(element);
    expect(scene.light).toBe(override);
    world.destroy();
  });

  it("requests active mutations once and keeps moon state non-visual", function () {
    const world = createWorld();
    const environment = createEnvironment(world);
    const scene = createScene(world);
    const element = {};
    environment.connectedCallback(element);
    environment.firstUpdate(scene);
    const light = environment.light;
    const originalDirection = Cartesian3.clone(light.direction);

    environment.sunDirection = Cartesian3.UNIT_X;
    expect(scene.requestRender.calls.count()).toBe(2);
    environment.sunDirection = Cartesian3.UNIT_X;
    expect(scene.requestRender.calls.count()).toBe(2);
    environment.sunColor = Color.RED;
    environment.sunIntensity = 4.0;
    environment.moonDirection = Cartesian3.UNIT_Y;
    expect(scene.requestRender.calls.count()).toBe(5);
    expect(light.direction).not.toEqual(originalDirection);
    const directionBeforeMoon = Cartesian3.clone(light.direction);
    environment.moonDirection = Cartesian3.UNIT_Z;
    expect(light.direction).toEqual(directionBeforeMoon);
    expect(scene.requestRender.calls.count()).toBe(6);

    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("conditionally restores and reacquires authority across enabled changes", function () {
    const world = createWorld();
    const environment = createEnvironment(world);
    const element = {};
    const displaced = new DirectionalLight({ direction: Cartesian3.UNIT_X });
    const scene = createScene(world, displaced);
    environment.connectedCallback(element);
    environment.firstUpdate(scene);

    environment.enabled = false;
    expect(scene.light).toBe(displaced);
    expect(world.environment).toBe(environment);
    const inactiveRequests = scene.requestRender.calls.count();
    environment.sunIntensity = 5.0;
    environment.moonDirection = Cartesian3.UNIT_Z;
    expect(scene.requestRender.calls.count()).toBe(inactiveRequests);

    const replacement = new DirectionalLight({ direction: Cartesian3.UNIT_Y });
    scene.light = replacement;
    environment.enabled = true;
    expect(scene.light).toBe(replacement);
    expect(environment.light.intensity).toBe(5.0);
    environment.update(scene);
    scene.light = displaced;
    environment.enabled = false;
    expect(scene.light).toBe(displaced);
    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("preserves registration on wrong disconnect and supports clean reconnect", function () {
    const world = createWorld();
    const environment = createEnvironment(world);
    const element = {};
    const scene = createScene(world);
    environment.connectedCallback(element);
    environment.firstUpdate(scene);

    expect(() => environment.disconnectedCallback({})).toThrowDeveloperError();
    expect(world.environment).toBe(environment);
    expect(scene.light).toBe(environment.light);
    environment.disconnectedCallback(element);
    expect(world.environment).toBeUndefined();
    environment.connectedCallback(element);
    environment.firstUpdate(scene);
    expect(world.environment).toBe(environment);
    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("keeps first-update validation failure atomic", function () {
    const world = createWorld();
    const otherWorld = createWorld(64.0);
    const environment = createEnvironment(world);
    const element = {};
    const displaced = new DirectionalLight({ direction: Cartesian3.UNIT_Z });
    environment.connectedCallback(element);

    const wrongWorldScene = createScene(otherWorld, displaced);
    expect(() =>
      environment.firstUpdate(wrongWorldScene),
    ).toThrowDeveloperError();
    expect(wrongWorldScene.light).toBe(displaced);
    expect(environment._scene).toBeUndefined();

    const wrongModeScene = createScene(world, displaced);
    wrongModeScene.mode = SceneMode.SCENE2D;
    expect(() =>
      environment.firstUpdate(wrongModeScene),
    ).toThrowDeveloperError();
    expect(wrongModeScene.light).toBe(displaced);
    expect(environment._scene).toBeUndefined();

    environment.disconnectedCallback(element);
    world.destroy();
    otherWorld.destroy();
  });

  it("world destruction severs authority without owning either light", function () {
    const world = createWorld();
    const environment = createEnvironment(world);
    const element = {};
    const displaced = new DirectionalLight({ direction: Cartesian3.UNIT_X });
    const scene = createScene(world, displaced);
    environment.connectedCallback(element);
    environment.firstUpdate(scene);
    const light = environment.light;

    world.destroy();
    expect(scene.light).toBe(displaced);
    expect(environment.light).toBe(light);
    expect(environment._element).toBe(element);
    expect(environment._scene).toBeUndefined();
    expect(() => environment.update(scene)).toThrowDeveloperError();
    expect(() => {
      environment.enabled = false;
      environment.enabled = true;
    }).toThrowDeveloperError();
    expect(() => environment.disconnectedCallback(element)).not.toThrow();
  });

  it("validates astronomical mode and project-origin state atomically", function () {
    const world = createWorld();
    const construct = (options) =>
      createEnvironment(world, {
        directionMode: "astronomical",
        originLongitude: 0.0,
        originLatitude: 0.0,
        ...options,
      });

    expect(createEnvironment(world).directionMode).toBe("manual");
    expect(() =>
      construct({ directionMode: "automatic" }),
    ).toThrowDeveloperError();
    expect(() =>
      construct({ originLongitude: undefined }),
    ).toThrowDeveloperError();
    expect(() =>
      construct({ originLatitude: undefined }),
    ).toThrowDeveloperError();
    expect(() =>
      construct({ originLongitude: Math.PI + 0.01 }),
    ).toThrowDeveloperError();
    expect(() =>
      construct({ originLatitude: Math.PI * 0.5 + 0.01 }),
    ).toThrowDeveloperError();

    const environment = createEnvironment(world);
    const originalSun = environment.effectiveSunDirection;
    environment.originLongitude = Math.PI;
    environment.originLatitude = -Math.PI * 0.5;
    expect(environment.originLongitude).toBe(Math.PI);
    expect(environment.originLatitude).toBe(-Math.PI * 0.5);
    environment.originLongitude = undefined;
    expect(() => {
      environment.directionMode = "astronomical";
    }).toThrowDeveloperError();
    expect(environment.directionMode).toBe("manual");
    expect(environment.effectiveSunDirection).toEqual(originalSun);
    environment.originLongitude = -Math.PI;
    environment.directionMode = "astronomical";
    expect(() => {
      environment.originLatitude = undefined;
    }).toThrowDeveloperError();
    expect(environment.originLatitude).toBe(-Math.PI * 0.5);
    expect(() => {
      environment.originLongitude = Infinity;
    }).toThrowDeveloperError();
    expect(environment.originLongitude).toBe(-Math.PI);
    world.destroy();
  });

  it("publishes hard-coded topocentric directions from explicit host time", function () {
    const world = createWorld();
    const environment = createEnvironment(world, {
      directionMode: "astronomical",
      originLongitude: 0.0,
      originLatitude: 0.0,
    });
    const manualSun = environment.sunDirection;
    const manualMoon = environment.moonDirection;
    const exposedEffective = environment.effectiveSunDirection;
    exposedEffective.x = 99.0;
    expect(environment.effectiveSunDirection).toEqual(manualSun);
    const element = {};
    const scene = createScene(world);
    const time = JulianDate.fromIso8601("2026-03-20T12:00:00Z");
    environment.connectedCallback(element);
    environment.firstUpdate(scene, time);

    const sun = environment.effectiveSunDirection;
    const moon = environment.effectiveMoonDirection;
    expect(sun.x).toBeCloseTo(0.026674352089693723, 13);
    expect(sun.y).toBeCloseTo(-0.0033130590135607156, 13);
    expect(sun.z).toBeCloseTo(0.9996386860163865, 13);
    expect(moon.x).toBeCloseTo(0.30546108496896607, 13);
    expect(moon.y).toBeCloseTo(0.1835248788096602, 13);
    expect(moon.z).toBeCloseTo(0.9343511890223513, 13);
    expect(Cartesian3.magnitude(sun)).toBeCloseTo(1.0, 14);
    expect(Cartesian3.magnitude(moon)).toBeCloseTo(1.0, 14);
    expect(environment.light.direction).toEqual(
      Cartesian3.negate(sun, new Cartesian3()),
    );
    expect(environment.sunDirection).toEqual(manualSun);
    expect(environment.moonDirection).toEqual(manualMoon);

    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("keeps invalid astronomical first-update time failure atomic", function () {
    const world = createWorld();
    const environment = createEnvironment(world, {
      directionMode: "astronomical",
      originLongitude: 0.0,
      originLatitude: 0.0,
    });
    const element = {};
    const displaced = new DirectionalLight({ direction: Cartesian3.UNIT_Y });
    const scene = createScene(world, displaced);
    const effectiveSun = environment.effectiveSunDirection;
    const effectiveMoon = environment.effectiveMoonDirection;
    environment.connectedCallback(element);

    expect(() =>
      environment.firstUpdate(scene, undefined),
    ).toThrowDeveloperError();
    expect(() =>
      environment.firstUpdate(scene, new JulianDate(0, Infinity)),
    ).toThrowDeveloperError();
    expect(environment._scene).toBeUndefined();
    expect(environment._publishedTime).toBeUndefined();
    expect(environment.effectiveSunDirection).toEqual(effectiveSun);
    expect(environment.effectiveMoonDirection).toEqual(effectiveMoon);
    expect(scene.light).toBe(displaced);
    expect(scene.requestRender).not.toHaveBeenCalled();

    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("keeps astronomical publication atomic and requestRender minimal", function () {
    const world = createWorld();
    const environment = createEnvironment(world, {
      directionMode: "astronomical",
      originLongitude: 2.0943951023931953,
      originLatitude: 0.6108652381980153,
    });
    const element = {};
    const scene = createScene(world);
    const firstTime = JulianDate.fromIso8601("2026-06-21T00:00:00Z");
    const secondTime = JulianDate.fromIso8601("2026-12-21T00:00:00Z");
    environment.connectedCallback(element);
    environment.firstUpdate(scene, firstTime);
    const firstSun = environment.effectiveSunDirection;
    const firstMoon = environment.effectiveMoonDirection;
    const light = environment.light;
    expect(scene.requestRender).toHaveBeenCalledTimes(1);

    environment.update(scene, firstTime);
    expect(scene.requestRender).toHaveBeenCalledTimes(1);
    environment.sunDirection = Cartesian3.UNIT_X;
    environment.moonDirection = Cartesian3.UNIT_Y;
    expect(environment.effectiveSunDirection).toEqual(firstSun);
    expect(environment.effectiveMoonDirection).toEqual(firstMoon);
    expect(scene.requestRender).toHaveBeenCalledTimes(1);

    environment.originLongitude = 2.0;
    expect(scene.requestRender).toHaveBeenCalledTimes(2);
    environment.update(scene, firstTime);
    expect(scene.requestRender).toHaveBeenCalledTimes(2);
    const originSun = environment.effectiveSunDirection;
    expect(originSun).not.toEqual(firstSun);
    expect(environment.light).toBe(light);

    environment.update(scene, secondTime);
    expect(scene.requestRender).toHaveBeenCalledTimes(3);
    const secondSun = environment.effectiveSunDirection;
    const secondMoon = environment.effectiveMoonDirection;
    const publishedTime = JulianDate.clone(environment._publishedTime);
    const lightDirection = Cartesian3.clone(light.direction);
    expect(secondSun).not.toEqual(originSun);
    expect(secondMoon).not.toEqual(firstMoon);
    expect(() =>
      environment.update(scene, new JulianDate(NaN, 0.0)),
    ).toThrowDeveloperError();
    expect(environment.effectiveSunDirection).toEqual(secondSun);
    expect(environment.effectiveMoonDirection).toEqual(secondMoon);
    expect(environment.light.direction).toEqual(lightDirection);
    expect(environment._publishedTime).toEqual(publishedTime);
    expect(scene.requestRender).toHaveBeenCalledTimes(3);

    environment.directionMode = "manual";
    expect(environment.effectiveSunDirection).toEqual(Cartesian3.UNIT_X);
    expect(environment.effectiveMoonDirection).toEqual(Cartesian3.UNIT_Y);
    expect(scene.requestRender).toHaveBeenCalledTimes(4);
    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("keeps active astronomical same mode and origin assignments no-op", function () {
    const world = createWorld();
    const longitude = 2.0943951023931953;
    const latitude = 0.6108652381980153;
    const environment = createEnvironment(world, {
      directionMode: "astronomical",
      originLongitude: longitude,
      originLatitude: latitude,
    });
    const element = {};
    const scene = createScene(world);
    const time = JulianDate.fromIso8601("2026-06-21T00:00:00Z");
    environment.connectedCallback(element);
    environment.firstUpdate(scene, time);
    const effectiveSun = environment.effectiveSunDirection;
    const effectiveMoon = environment.effectiveMoonDirection;
    const publishedTime = JulianDate.clone(environment._publishedTime);
    const light = environment.light;
    const lightDirection = Cartesian3.clone(light.direction);
    const requestCount = scene.requestRender.calls.count();
    expect(environment._astronomyDirty).toBe(false);

    environment.directionMode = "astronomical";
    environment.originLongitude = longitude;
    environment.originLatitude = latitude;
    expect(environment._astronomyDirty).toBe(false);
    expect(scene.requestRender.calls.count()).toBe(requestCount);
    environment.update(scene, time);

    expect(environment.effectiveSunDirection).toEqual(effectiveSun);
    expect(environment.effectiveMoonDirection).toEqual(effectiveMoon);
    expect(environment._publishedTime).toEqual(publishedTime);
    expect(environment.light).toBe(light);
    expect(environment.light.direction).toEqual(lightDirection);
    expect(environment._astronomyDirty).toBe(false);
    expect(scene.requestRender.calls.count()).toBe(requestCount);

    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("is deterministic across timezone spellings, latitudes, and Moon parallax", function () {
    const timeA = JulianDate.fromIso8601("2026-03-20T12:00:00Z");
    const timeB = JulianDate.fromIso8601("2026-03-20T20:00:00+08:00");
    const origins = [
      [0.0, 0.0],
      [2.0943951023931953, 0.6108652381980153],
      [Math.PI, Math.PI * 0.5],
      [-Math.PI, -Math.PI * 0.5],
    ];
    const results = [];

    for (const [longitude, latitude] of origins) {
      const world = createWorld();
      const environment = createEnvironment(world, {
        directionMode: "astronomical",
        originLongitude: longitude,
        originLatitude: latitude,
      });
      const element = {};
      const scene = createScene(world);
      environment.connectedCallback(element);
      environment.firstUpdate(scene, timeA);
      const sunA = environment.effectiveSunDirection;
      const moonA = environment.effectiveMoonDirection;
      environment.update(scene, timeB);
      expect(environment.effectiveSunDirection).toEqual(sunA);
      expect(environment.effectiveMoonDirection).toEqual(moonA);
      expect(Cartesian3.magnitude(sunA)).toBeCloseTo(1.0, 14);
      expect(Cartesian3.magnitude(moonA)).toBeCloseTo(1.0, 14);
      results.push({ sun: sunA, moon: moonA });
      environment.disconnectedCallback(element);
      world.destroy();
    }

    expect(results[0].moon).not.toEqual(results[1].moon);
    expect(results[2].sun.y).toBeGreaterThan(0.99);
    expect(results[3].sun.y).toBeLessThan(-0.99);
  });

  it("refreshes astronomical time on re-enable without redundant requests", function () {
    const world = createWorld();
    const environment = createEnvironment(world, {
      directionMode: "astronomical",
      originLongitude: 0.0,
      originLatitude: 0.0,
    });
    const element = {};
    const scene = createScene(world);
    const firstTime = JulianDate.fromIso8601("2026-03-20T12:00:00Z");
    const secondTime = JulianDate.fromIso8601("2026-03-21T12:00:00Z");
    environment.connectedCallback(element);
    environment.firstUpdate(scene, firstTime);
    const firstSun = environment.effectiveSunDirection;
    environment.enabled = false;
    expect(scene.requestRender).toHaveBeenCalledTimes(2);
    environment.enabled = true;
    expect(scene.requestRender).toHaveBeenCalledTimes(3);
    environment.update(scene, secondTime);
    expect(environment.effectiveSunDirection).not.toEqual(firstSun);
    expect(scene.requestRender).toHaveBeenCalledTimes(3);
    environment.update(scene, secondTime);
    expect(scene.requestRender).toHaveBeenCalledTimes(3);
    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("validates cloned atmosphere defaults and preserves same-value no-ops", function () {
    const world = createWorld();
    const environment = createEnvironment(world);
    expect(environment.showAtmosphere).toBe(false);
    expect(environment.atmosphereIntensity).toBe(1.0);
    expect(environment.atmosphereFadeHeight).toBe(1000000.0);
    expect(environment.skyBox).toBeUndefined();
    expect(environment.atmosphereZenithColor).toEqual(
      new Color(0.12, 0.32, 0.72, 0.72),
    );
    expect(environment.atmosphereHorizonColor).toEqual(
      new Color(0.92, 0.56, 0.28, 0.58),
    );

    const zenith = environment.atmosphereZenithColor;
    zenith.red = 1.0;
    expect(environment.atmosphereZenithColor.red).toBe(0.12);
    expect(() => {
      environment.showAtmosphere = 1;
    }).toThrowDeveloperError();
    expect(() => {
      environment.atmosphereIntensity = -1.0;
    }).toThrowDeveloperError();
    expect(() => {
      environment.atmosphereFadeHeight = 0.0;
    }).toThrowDeveloperError();
    expect(() => {
      environment.atmosphereZenithColor = new Color(Number.NaN, 0.0, 0.0, 1.0);
    }).toThrowDeveloperError();
    expect(() => {
      environment.skyBox = {};
    }).toThrowDeveloperError();

    const element = {};
    const scene = createScene(world);
    environment.connectedCallback(element);
    environment.firstUpdate(
      scene,
      JulianDate.fromIso8601("2026-06-21T12:00:00Z"),
    );
    const requestCount = scene.requestRender.calls.count();
    environment.showAtmosphere = false;
    environment.atmosphereIntensity = 1.0;
    environment.atmosphereFadeHeight = 1000000.0;
    environment.atmosphereZenithColor = environment.atmosphereZenithColor;
    expect(scene.requestRender.calls.count()).toBe(requestCount);
    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("requests active visual mutations and keeps planar SkyBox caller-owned", function () {
    const world = createWorld();
    const skyBox = createSkyBox();
    const replacement = createSkyBox();
    const environment = createEnvironment(world, { skyBox });
    const element = {};
    const scene = createScene(world);
    environment.connectedCallback(element);
    environment.firstUpdate(
      scene,
      JulianDate.fromIso8601("2026-06-21T12:00:00Z"),
    );
    const requestCount = scene.requestRender.calls.count();
    environment.skyBox = skyBox;
    expect(scene.requestRender.calls.count()).toBe(requestCount);
    environment.skyBox = replacement;
    environment.showAtmosphere = true;
    environment.atmosphereIntensity = 0.5;
    environment.atmosphereFadeHeight = 500000.0;
    environment.atmosphereZenithColor = Color.BLUE;
    environment.atmosphereHorizonColor = Color.ORANGE;
    expect(scene.requestRender.calls.count()).toBe(requestCount + 6);
    expect(skyBox.isDestroyed()).toBe(false);
    expect(replacement.isDestroyed()).toBe(false);

    environment.disconnectedCallback(element);
    world.destroy();
    expect(skyBox.isDestroyed()).toBe(false);
    expect(replacement.isDestroyed()).toBe(false);
    skyBox.destroy();
    replacement.destroy();
  });

  it("rejects native conflicts and destroyed planar SkyBox atomically", function () {
    const world = createWorld();
    const skyBox = createSkyBox();
    const environment = createEnvironment(world);
    const element = {};
    const scene = createScene(world);
    scene.skyAtmosphere = { show: true };
    environment.connectedCallback(element);
    environment.firstUpdate(
      scene,
      JulianDate.fromIso8601("2026-06-21T12:00:00Z"),
    );
    const requestCount = scene.requestRender.calls.count();
    expect(() => {
      environment.showAtmosphere = true;
    }).toThrowDeveloperError();
    expect(environment.showAtmosphere).toBe(false);
    expect(() => {
      environment.skyBox = skyBox;
    }).toThrowDeveloperError();
    expect(environment.skyBox).toBeUndefined();
    expect(scene.requestRender.calls.count()).toBe(requestCount);
    scene.skyAtmosphere.show = false;
    environment.skyBox = skyBox;
    environment.skyBox = undefined;
    skyBox.destroy();
    expect(() => {
      environment.skyBox = skyBox;
    }).toThrowDeveloperError();
    environment.disconnectedCallback(element);
    world.destroy();
  });

  it("defers inactive visual conflicts until authority is reacquired", function () {
    const world = createWorld();
    const skyBox = createSkyBox();
    const environment = createEnvironment(world);
    const element = {};
    const scene = createScene(world);
    environment.connectedCallback(element);
    environment.firstUpdate(
      scene,
      JulianDate.fromIso8601("2026-06-21T12:00:00Z"),
    );
    environment.enabled = false;
    scene.skyAtmosphere = { show: true };
    const requestCount = scene.requestRender.calls.count();

    environment.showAtmosphere = true;
    environment.skyBox = skyBox;
    expect(scene.requestRender.calls.count()).toBe(requestCount);
    expect(() => {
      environment.enabled = true;
    }).toThrowDeveloperError();
    expect(environment.enabled).toBe(false);
    expect(scene.requestRender.calls.count()).toBe(requestCount);

    environment.showAtmosphere = false;
    environment.skyBox = undefined;
    environment.enabled = true;
    expect(scene.requestRender.calls.count()).toBe(requestCount + 1);
    environment.disconnectedCallback(element);
    world.destroy();
    skyBox.destroy();
  });
});
