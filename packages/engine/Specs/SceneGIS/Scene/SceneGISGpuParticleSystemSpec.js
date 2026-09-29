import {
  BoundingSphere,
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  Framebuffer,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  SceneGISGpuParticleSystem,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  Texture,
  Transforms,
} from "../../../index.js";
import createContext from "../../../../../Specs/createContext.js";
import createFrameState from "../../../../../Specs/createFrameState.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";

describe("SceneGIS/Scene/SceneGISGpuParticleSystem", function () {
  let context, frame, particles, scene;
  const time = JulianDate.fromIso8601("2026-09-29T00:00:00Z");
  let acceleration, life;
  const shader = `
    uniform vec3 u_acceleration;
    uniform float u_life;
    void initializeParticle(inout SceneGISParticle p) {
      p.velocity = vec3(2.0, 0.0, 1.0); p.life = u_life;
      p.size = vec2(2.0, 3.0); p.rotation = 0.5;
      p.color = vec4(sceneGISParticleRandom(p.seed, 0.0), 0.2, 0.3, 0.8);
    }
    void updateParticle(inout SceneGISParticle p, float dt) {
      p.position += p.velocity * dt + 0.5 * u_acceleration * dt * dt;
      p.velocity += u_acceleration * dt;
    }`;
  function create(options = {}) {
    acceleration = new Cartesian3(0, 0, -2);
    life = 1;
    particles = new SceneGISGpuParticleSystem({
      maximumParticles: 4,
      emissionRate: 4,
      boundingSphere: new BoundingSphere(Cartesian3.ZERO, 20),
      simulationShader: shader,
      uniformMap: { u_acceleration: () => acceleration, u_life: () => life },
      ...options,
    });
    return particles;
  }
  function tick(seconds, render = true) {
    frame ??= createFrameState(context);
    frame.time = JulianDate.addSeconds(time, seconds, frame.time);
    frame.passes.render = render;
    frame.passes.pick = !render;
    frame.commandList.length = 0;
    particles.update(frame);
  }
  function read(attachment = 0, slot = 0) {
    const state = particles._state;
    const texture = state.buffers[state.index].getColorTexture(attachment);
    const target = new Framebuffer({
      context: state.context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    try {
      return Array.from(
        state.context.readPixels({
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
  afterEach(function () {
    scene?.destroyForSpecs();
    scene = undefined;
    if (particles && !particles.isDestroyed()) {
      particles.destroy();
    }
    particles = undefined;
    context?.destroyForSpecs();
    context = frame = undefined;
  });

  it("validates the abstract shader contract without allocating GPU resources", function () {
    expect(() => new SceneGISGpuParticleSystem()).toThrowDeveloperError();
    expect(() => create({ maximumParticles: 0 })).toThrowDeveloperError();
    expect(() =>
      create({ uniformMap: { u_sgCapacity: () => 1 } }),
    ).toThrowDeveloperError();
    expect(() => create({ boundingSphere: undefined })).toThrowDeveloperError();
    create();
    expect(particles.ready).toBeFalse();
    expect(particles.textureMemoryInBytes).toBe(0);
    context = createContext();
    particles.show = false;
    tick(0);
    expect(particles._state).toBeUndefined();
  });
  it("runs user initialization/integration and dynamic uniforms entirely on GPU", function () {
    context = createContext();
    create();
    tick(0);
    tick(0.5);
    expect(read()).toEqualEpsilon([0.5, 0, 0.1875, 0.25], 1e-6);
    expect(read(1)).toEqualEpsilon([2, 0, 0.5, 1], 1e-6);
    expect(read(3)).toEqualEpsilon([2, 3, 0.5, 0], 1e-6);
    expect(read(2).slice(1)).toEqualEpsilon([0.2, 0.3, 0.8], 1e-6);
    expect(read(0, 1)).toEqualEpsilon([0, 0, 0, 0], 1e-6);
    expect(read(0, 2)[3]).toBe(-1);
    particles.emissionRate = 0;
    acceleration.z = 0;
    tick(0.75);
    expect(read()).toEqualEpsilon([1, 0, 0.3125, 0.5], 1e-6);
    tick(1.5);
    expect(read()[3]).toBe(-1);
    expect(read(0, 1)[3]).toBe(-1);
  });
  it("does not inject velocity integration or forces into an empty user update", function () {
    context = createContext();
    create({
      simulationShader: `
      void initializeParticle(inout SceneGISParticle p) { p.position=vec3(3.0); p.velocity=vec3(10.0); }
      void updateParticle(inout SceneGISParticle p,float dt) {}`,
      uniformMap: {},
    });
    tick(0);
    tick(0.5);
    expect(read()).toEqualEpsilon([3, 3, 3, 0.25], 1e-6);
  });
  it("recycles circular slots and retains subframe ages when emission exceeds capacity", function () {
    context = createContext();
    create({ emissionRate: 8, seed: 16777215 });
    life = 10;
    tick(0);
    tick(2);
    for (let i = 0; i < 4; ++i) {
      expect(read(0, i)[3]).toEqualEpsilon((3 - i) / 8, 1e-6);
      expect(read(3, i)[3]).toBe(11 + i);
    }
    tick(2.125);
    expect(read(3, 0)[3]).toBe(15);
    expect(read(0, 0)[3]).toBe(0);
  });
  it("preserves fractional emission and resets deterministic state on demand or time rewind", function () {
    context = createContext();
    create({ emissionRate: 2.5 });
    tick(0);
    tick(0.2);
    expect(read()[3]).toBe(-1);
    tick(0.5);
    expect(read()[3]).toEqualEpsilon(0.1, 1e-6);
    const original = read(2);
    const buffers = particles._state.buffers.slice();
    particles.reset();
    tick(0.5);
    expect(read()[3]).toBe(-1);
    tick(1);
    expect(read(2)).toEqual(original);
    expect(particles._state.buffers).toEqual(buffers);
    tick(0);
    expect(read()[3]).toBe(-1);
    tick(0.5);
    expect(read(2)).toEqual(original);
  });
  it("skips frozen/pick/paused updates and pauses observed hidden time", function () {
    context = createContext();
    create();
    tick(0);
    tick(0.5);
    const snapshot = read();
    const spy = spyOn(context, "draw").and.callThrough();
    tick(0.5);
    tick(99, false);
    particles.paused = true;
    tick(10);
    expect(spy).not.toHaveBeenCalled();
    expect(read()).toEqual(snapshot);
    particles.paused = false;
    particles.show = false;
    tick(20);
    particles.show = true;
    particles.emissionRate = 0;
    tick(20.25);
    expect(read()[3]).toEqualEpsilon(0.5, 1e-6);
    expect(spy.calls.count()).toBe(1);
    expect(particles.textureMemoryInBytes).toBe(512);
  });
  it("releases persistent resources and cleans candidates after user shader compile failure", function () {
    context = createContext();
    create();
    tick(0);
    const state = particles._state;
    const textures = state.buffers.flatMap((b) =>
      [0, 1, 2, 3].map((i) => b.getColorTexture(i)),
    );
    particles.destroy();
    expect(textures.every((t) => t.isDestroyed())).toBeTrue();
    expect(state.vertexArray.isDestroyed()).toBeTrue();
    const spy = spyOn(Texture.prototype, "destroy").and.callThrough();
    create({ simulationShader: "void invalidFunction() {}" });
    expect(() => tick(0)).toThrowError();
    expect(particles._state).toBeUndefined();
    expect(spy.calls.count()).toBe(8);
  });
  it("rejects an unsupported context before allocation", function () {
    context = createContext();
    create();
    const supported = context._webgl2;
    context._webgl2 = false;
    try {
      expect(() => tick(0)).toThrowError();
    } finally {
      context._webgl2 = supported;
    }
    expect(particles._state).toBeUndefined();
  });
  [true, false].forEach(function (planar) {
    it(`renders and picks instanced particles with opaque occlusion in ${planar ? "Planar" : "Globe"}`, function () {
      scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
      scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
      scene.fog.enabled = false;
      let matrix;
      if (planar) {
        scene._initializeWorld(
          new SceneGISPlanarWorld({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              extent: new SceneGISPlanarExtent({
                minimumX: 19999000,
                maximumX: 20001000,
                minimumY: -30001000,
                maximumY: -29999000,
              }),
            }),
            maximumLevel: 0,
          }),
        );
        matrix = Matrix4.fromTranslation(
          new Cartesian3(20000000, -30000000, 100),
        );
      } else {
        scene.globe = new Globe();
        matrix = Transforms.eastNorthUpToFixedFrame(
          Cartesian3.fromDegrees(118.8, 32, 100),
        );
      }
      const point = (p) => Matrix4.multiplyByPoint(matrix, p, new Cartesian3());
      const vector = (p) =>
        Matrix4.multiplyByPointAsVector(matrix, p, new Cartesian3());
      scene.camera.setView({
        destination: point(new Cartesian3(0, 0, 20)),
        orientation: {
          direction: vector(new Cartesian3(0, 0, -1)),
          up: vector(Cartesian3.UNIT_Y),
        },
      });
      scene.camera.frustum.near = 0.1;
      scene.camera.frustum.far = 200;
      const canvas = createCanvas(2, 2),
        ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 2, 2);
      create({
        maximumParticles: 1,
        emissionRate: 1,
        modelMatrix: matrix,
        image: canvas,
        id: "particles",
        uniformMap: {},
        simulationShader: `
        void initializeParticle(inout SceneGISParticle p) { p.size=vec2(8.0); p.color=vec4(1.0,0.0,0.0,0.8); }
        void updateParticle(inout SceneGISParticle p,float dt) {}`,
      });
      scene.primitives.add(particles);
      scene.renderForSpecs(time);
      scene.renderForSpecs(JulianDate.addSeconds(time, 1, new JulianDate()));
      const pixel = () =>
        scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 });
      expect(pixel()[0]).toBeGreaterThan(100);
      const snapshot = read();
      expect(scene.pick(new Cartesian2(32, 32)).id).toBe("particles");
      expect(read()).toEqual(snapshot);
      const boxMatrix = Matrix4.multiplyByTranslation(
        matrix,
        new Cartesian3(0, 0, 5),
        new Matrix4(),
      );
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          modelMatrix: boxMatrix,
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(10, 10, 1),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
            },
            id: "occluder",
          }),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: false,
          }),
        }),
      );
      scene.renderForSpecs(JulianDate.addSeconds(time, 1, new JulianDate()));
      expect(pixel()[2]).toBeGreaterThan(100);
      expect(pixel()[0]).toBeLessThan(5);
      expect(scene.pick(new Cartesian2(32, 32)).id).toBe("occluder");
      const image = particles._state.image;
      scene.primitives.remove(particles);
      expect(image.isDestroyed()).toBeTrue();
      expect(canvas.width).toBe(2);
      document.body.removeChild(canvas);
    });
  });
});
