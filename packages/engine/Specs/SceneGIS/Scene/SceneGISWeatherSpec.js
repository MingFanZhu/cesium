import {
  Cartesian2,
  Cartesian3,
  Color,
  Framebuffer,
  JulianDate,
  Matrix4,
  SceneGISWeather,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  Transforms,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";

describe("SceneGIS/Scene/SceneGISWeather", function () {
  let scene, weather, frame, matrix;
  const time = JulianDate.fromIso8601("2026-09-29T00:00:00Z");
  function create(planar = true, options = {}) {
    scene = createScene({ canvas: createCanvas(96, 96), scene3DOnly: true });
    scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
    scene.fog.enabled = false;
    if (planar) {
      scene._initializeWorld(
        new SceneGISPlanarWorld({
          coordinateSystem: new SceneGISPlanarCoordinateSystem({
            extent: new SceneGISPlanarExtent({
              minimumX: 19990000,
              maximumX: 20010000,
              minimumY: -30010000,
              maximumY: -29990000,
            }),
          }),
          maximumLevel: 0,
        }),
      );
      matrix = Matrix4.fromTranslation(
        new Cartesian3(20000000, -30000000, 500),
      );
    } else {
      matrix = Transforms.eastNorthUpToFixedFrame(
        Cartesian3.fromDegrees(118.8, 32, 500),
      );
    }
    const point = (p) => Matrix4.multiplyByPoint(matrix, p, new Cartesian3());
    const vector = (p) =>
      Matrix4.multiplyByPointAsVector(matrix, p, new Cartesian3());
    scene.camera.setView({
      destination: point(Cartesian3.ZERO),
      orientation: {
        direction: vector(
          Cartesian3.normalize(new Cartesian3(0, 1, -0.4), new Cartesian3()),
        ),
        up: vector(
          Cartesian3.normalize(new Cartesian3(0, 0.4, 1), new Cartesian3()),
        ),
      },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 5000;
    frame = scene.frameState;
    weather = new SceneGISWeather({
      mode: planar ? "planar" : "globe",
      quality: "low",
      intensity: 1,
      transitionDuration: 0,
      windVelocity: new Cartesian2(0, 0),
      ...options,
    });
    return weather;
  }
  function tick(seconds, pick = false) {
    frame.time = JulianDate.addSeconds(time, seconds, frame.time);
    frame.passes.render = true;
    frame.passes.pick = pick;
    frame.commandList.length = 0;
    weather.update(frame);
  }
  function read(layer = 0, attachment = 0, slot = 5) {
    const p = weather._layers[layer],
      state = p._state;
    const texture = state.buffers[state.index].getColorTexture(attachment);
    const target = new Framebuffer({
      context: scene.context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    try {
      return Array.from(
        scene.context.readPixels({
          framebuffer: target,
          x: slot % texture.width,
          y: Math.floor(slot / texture.width),
          width: 1,
          height: 1,
        }),
      );
    } finally {
      target.destroy();
    }
  }
  function random(seed, stream) {
    let x = (seed ^ Math.imul(stream, 1597334677)) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 2246822519);
    x ^= x >>> 13;
    x = Math.imul(x, 3266489917);
    x ^= x >>> 16;
    return (x & 16777215) / 16777216;
  }
  afterEach(function () {
    if (
      weather &&
      !weather.isDestroyed() &&
      !scene?.primitives.contains(weather)
    ) {
      weather.destroy();
    }
    scene?.destroyForSpecs();
    weather = undefined;
    scene = frame = undefined;
  });
  it("validates public contracts and allocates nothing for clear or hidden weather", function () {
    expect(() => new SceneGISWeather()).toThrowDeveloperError();
    expect(
      () => new SceneGISWeather({ mode: "planar", quality: "auto" }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISWeather({ mode: "planar", intensity: 2 }),
    ).toThrowDeveloperError();
    create(true, { intensity: 0 });
    tick(0);
    expect(weather.textureMemoryInBytes).toBe(0);
    weather.show = false;
    weather.intensity = 1;
    tick(10);
    expect(weather._layers).toBeUndefined();
  });
  it("transitions density/type/wind on Scene time and stops GPU work at clear", function () {
    create(true, { transitionDuration: 2 });
    tick(0);
    expect(weather._layers).toBeUndefined();
    tick(1);
    expect(weather.actualIntensity).toBe(0.5);
    const layers = weather._layers;
    weather.type = "snow";
    weather.windVelocity.x = 10;
    tick(2);
    expect(weather.actualIntensity).toBe(1);
    expect(weather._snow).toBe(0.5);
    expect(weather._currentWind.x).toEqualEpsilon(
      10 * (1 - Math.exp(-1.5)),
      1e-10,
    );
    expect(weather._layers).toBe(layers);
    weather.intensity = 0;
    tick(3);
    expect(weather.actualIntensity).toBe(0.5);
    const spy = spyOn(scene.context, "draw").and.callThrough();
    tick(4);
    expect(weather.actualIntensity).toBe(0);
    expect(frame.commandList.length).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
  it("freezes state while paused/hidden and excludes picking", function () {
    create();
    tick(0);
    tick(1);
    const snapshot = read();
    const spy = spyOn(scene.context, "draw").and.callThrough();
    tick(99, true);
    expect(frame.commandList.length).toBe(0);
    weather.paused = true;
    tick(10);
    expect(frame.commandList.length).toBe(2);
    weather.show = false;
    tick(20);
    expect(frame.commandList.length).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(read()).toEqual(snapshot);
    weather.show = true;
    weather.paused = false;
    tick(20.25);
    expect(read()[3]).toEqualEpsilon(snapshot[3] + 0.25, 1e-6);
    expect(spy.calls.count()).toBe(2);
  });
  it("replaces bounded pools on quality/radius changes and releases their resources", function () {
    create();
    tick(0);
    const layers = weather._layers.slice();
    expect(layers[0].maximumParticles).toBe(8192);
    expect(weather.textureMemoryInBytes).toBe(2 * 91 * 91 * 128);
    weather.quality = "high";
    tick(0);
    expect(layers.every((p) => p.isDestroyed())).toBeTrue();
    expect(weather._layers[0].maximumParticles).toBe(32768);
    const old = weather._layers[0];
    weather.radius = 1000;
    tick(0);
    expect(old.isDestroyed()).toBeTrue();
    const active = weather._layers;
    const texture = active[0]._state.buffers[0].getColorTexture(0);
    weather.destroy();
    expect(active.every((p) => p.isDestroyed())).toBeTrue();
    expect(texture.isDestroyed()).toBeTrue();
  });
  [true, false].forEach(function (planar) {
    it(`rebases GPU coordinates without camera dragging in ${planar ? "Planar" : "Globe"}`, function () {
      create(planar);
      tick(0);
      const before = read();
      const original = Matrix4.clone(weather._stateMatrix);
      scene.camera.moveRight(10);
      tick(0);
      expect(read()).toEqual(before);
      const rebased = Matrix4.multiplyByPoint(
        weather._renderTransform,
        new Cartesian3(...before.slice(0, 3)),
        new Cartesian3(),
      );
      const oldWorld = Matrix4.multiplyByPoint(
        original,
        new Cartesian3(...before.slice(0, 3)),
        new Cartesian3(),
      );
      const newWorld = Matrix4.multiplyByPoint(
        weather._matrix,
        rebased,
        new Cartesian3(),
      );
      expect(newWorld).toEqualEpsilon(oldWorld, 1e-6);
      weather.windVelocity.x = 3;
      tick(1);
      const velocity = read(0, 1);
      expect(velocity[0]).toBe(3);
      expect(velocity[1]).toBe(0);
      expect(velocity[2]).toBeLessThan(-15);
      const phase = random(5, 5) * Math.PI * 2;
      const expected = [
        rebased.x + 3 + (Math.sin(0.8 + phase) - Math.sin(phase)) * 0.12,
        rebased.y + (Math.cos(0.57 + phase) - Math.cos(phase)) * 0.12,
        rebased.z + velocity[2],
      ];
      const radius = 180;
      for (let i = 0; i < 3; i++) {
        expected[i] =
          ((((expected[i] + radius) % (2 * radius)) + 2 * radius) %
            (2 * radius)) -
          radius;
      }
      expect(read().slice(0, 3)).toEqualEpsilon(expected, 0.002);
      tick(-1);
      expect(read()[3]).toBe(0);
    });
    it(`renders rain/snow, ceiling fade and frozen view styling in ${planar ? "Planar" : "Globe"}`, function () {
      create(planar, { color: Color.RED, particleSize: 3 });
      scene.primitives.add(weather);
      scene.renderForSpecs(time);
      const rain = Array.from(scene.context.readPixels());
      expect(rain.some((v, i) => i % 4 === 0 && v > 0)).toBeTrue();
      const snapshot = read();
      weather.type = "snow";
      scene.renderForSpecs(time);
      const snow = Array.from(scene.context.readPixels());
      expect(snow).not.toEqual(rain);
      expect(read()).toEqual(snapshot);
      weather.ceilingHeight = -2000;
      scene.renderForSpecs(time);
      const clear = Array.from(scene.context.readPixels());
      weather.show = false;
      scene.renderForSpecs(time);
      expect(Array.from(scene.context.readPixels())).toEqual(clear);
    });
  });
});
