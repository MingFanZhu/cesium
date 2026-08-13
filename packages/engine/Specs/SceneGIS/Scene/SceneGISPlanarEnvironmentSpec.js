import {
  Cartesian3,
  Color,
  DirectionalLight,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
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
    });
  }

  function createScene(
    world,
    light = new DirectionalLight({ direction: Cartesian3.UNIT_Z }),
  ) {
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
    const displaced = new DirectionalLight({ direction: Cartesian3.UNIT_X });
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
    expect(scene.light).toBe(environment.light);
    expect(environment.light.direction).toEqual(
      Cartesian3.negate(environment.sunDirection, new Cartesian3()),
    );
    expect(environment.light.color).toEqual(environment.sunColor);
    expect(environment.light.intensity).toBe(environment.sunIntensity);
    expect(scene.requestRender).toHaveBeenCalledTimes(1);

    environment.disconnectedCallback(element);
    expect(scene.light).toBe(displaced);
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
    expect(scene.light).toBe(environment.light);
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
});
