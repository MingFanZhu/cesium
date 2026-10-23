import {
  Cartesian3,
  Color,
  Matrix4,
  Transforms,
  Globe,
  JulianDate,
  SceneGISFluidPrimitive,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  GeometryInstance,
  BoxGeometry,
  Primitive,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
  SceneTransforms,
  Framebuffer,
  Texture,
  PixelFormat,
  PixelDatatype,
  SceneGISTemporalAntialiasing,
  SceneGISScreenSpaceReflections,
  Sampler,
  TextureMinificationFilter,
  TextureMagnificationFilter,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISFluidPrimitive", function () {
  let scene, fluid, transform;
  const time = JulianDate.fromIso8601("2026-06-21T10:00:00Z");
  function point(x, y, z) {
    return Matrix4.multiplyByPoint(
      transform,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function direction(x, y, z) {
    return Matrix4.multiplyByPointAsVector(
      transform,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function render(seconds = 0) {
    scene.renderForSpecs(
      JulianDate.addSeconds(time, seconds, new JulianDate()),
    );
  }
  function box(center, dimensions, color) {
    return scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions,
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(color),
          },
        }),
        modelMatrix: Matrix4.multiplyByTranslation(
          transform,
          center,
          new Matrix4(),
        ),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
        asynchronous: false,
      }),
    );
  }
  function setup(planar = true, options = {}) {
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    if (planar) {
      transform = Matrix4.fromTranslation(
        new Cartesian3(20000000, -30000000, 100),
      );
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
    } else {
      scene.globe = new Globe();
      scene.globe.showGroundAtmosphere = false;
      transform = Transforms.eastNorthUpToFixedFrame(
        Cartesian3.fromDegrees(0, 35, 100),
      );
    }
    scene.camera.setView({
      destination: point(0, -2.5, 1.8),
      orientation: {
        direction: Cartesian3.normalize(
          direction(0, 2.5, -1.6),
          new Cartesian3(),
        ),
        up: direction(0, 0, 1),
      },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 100;
    box(new Cartesian3(0, 0, -0.1), new Cartesian3(4, 4, 0.1), Color.WHITE);
    fluid = scene.primitives.add(
      new SceneGISFluidPrimitive({
        modelMatrix: transform,
        maximumParticles: 256,
        initialParticles: 256,
        initialDimensions: new Cartesian3(8, 8, 4),
        initialMinimum: new Cartesian3(-0.35, -0.35, 0.05),
        particleSpacing: 0.1,
        paused: true,
        reflections: false,
        resolutionScale: 1,
        absorption: new Cartesian3(8, 0.1, 0.1),
        ...options,
      }),
    );
  }
  function read(texture) {
    const output = new Texture({
      context: scene.context,
      width: texture.width,
      height: texture.height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
    });
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [output],
    });
    const command = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_input; void main() { out_FragColor = vec4(texelFetch(u_input, ivec2(gl_FragCoord.xy), 0).r, 0.0, 0.0, 0.0); }",
      { uniformMap: { u_input: () => texture } },
    );
    command.framebuffer = framebuffer;
    try {
      command.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer,
          width: texture.width,
          height: texture.height,
        }),
      );
    } finally {
      command.shaderProgram.destroy();
      framebuffer.destroy();
    }
  }
  function pixel(p) {
    const screen = SceneTransforms.worldToWindowCoordinates(scene, p);
    return Array.from(
      scene.context.readPixels({
        x: Math.floor(screen.x),
        y: 127 - Math.floor(screen.y),
        width: 1,
        height: 1,
      }),
    );
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    scene = undefined;
    fluid = undefined;
  });

  [true, false].forEach(function (planar) {
    it(`reconstructs visible liquid and respects opaque occlusion in ${planar ? "Planar" : "Globe"}`, function () {
      setup(planar);
      render();
      expect(fluid.ready).toBeTrue();
      const surface = fluid._surface;
      const raw = read(surface.targets[0].getColorTexture());
      const depth = read(surface.targets[3].getColorTexture());
      expect(Math.max(...depth)).toBeGreaterThan(1);
      expect(depth.some((v, i) => Math.abs(v - raw[i]) > 0.0001)).toBeTrue();
      expect(
        Math.max(...read(surface.targets[1].getColorTexture())),
      ).toBeGreaterThan(0.1);
      const screen = SceneTransforms.worldToWindowCoordinates(
        scene,
        point(0, 0, 0.2),
      );
      const pickedDepth = scene.pickPosition(screen);
      expect(pickedDepth).toBeDefined();
      const localDepth = Matrix4.multiplyByPoint(
        Matrix4.inverseTransformation(transform, new Matrix4()),
        pickedDepth,
        new Cartesian3(),
      );
      expect(localDepth.z).toBeGreaterThan(0.05);
      const wet = pixel(point(0, 0, 0.2));
      fluid.show = false;
      render();
      expect(pixel(point(0, 0, 0.2))).not.toEqual(wet);
      fluid.show = true;
      box(new Cartesian3(0, -0.8, 0.5), new Cartesian3(0.6, 0.2, 1), Color.RED);
      render();
      const occluded = pixel(point(0, -0.8, 0.5));
      fluid.show = false;
      render();
      expect(pixel(point(0, -0.8, 0.5))).toEqual(occluded);
      expect(scene.context._gl.getError()).toBe(0);
    });
  });

  it("steps fixed time, limits catch-up, freezes, resets and releases resources without readback", function () {
    setup(true, {
      maximumParticles: 16,
      initialParticles: 0,
      paused: false,
      emissionRate: 60,
    });
    render();
    const spy = spyOn(fluid._solver, "step").and.callThrough();
    render(1);
    expect(spy.calls.count()).toBe(2);
    expect(fluid._solver.cursor).toBe(2);
    render(1);
    expect(spy.calls.count()).toBe(2);
    fluid.paused = true;
    render(2);
    expect(spy.calls.count()).toBe(2);
    fluid.reset();
    render(2);
    expect(fluid._solver.cursor).toBe(0);
    fluid.paused = false;
    fluid.emitting = false;
    render(2 + 1 / 60);
    expect(spy.calls.count()).toBe(3);
    expect(fluid._solver.cursor).toBe(0);
    const frames = fluid._solver.targets.concat(
      fluid._surface.targets.map((target) => target.framebuffer),
    );
    scene.primitives.remove(fluid);
    expect(fluid.isDestroyed()).toBeTrue();
    expect(frames.every((framebuffer) => framebuffer.isDestroyed())).toBeTrue();
  });

  it("validates immutable layout and mutable rigid transforms", function () {
    expect(
      () => new SceneGISFluidPrimitive({ maximumParticles: 63 }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISFluidPrimitive({ solverIterations: 1.5 }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISFluidPrimitive({ initialParticles: 2 }),
    ).toThrowDeveloperError();
    setup();
    fluid.modelMatrix = Matrix4.fromUniformScale(2);
    expect(() => render()).toThrowDeveloperError();
  });

  it("changes reconstruction size while paused without resetting or reallocating", function () {
    setup(true, { renderRadius: 0.05 });
    render();
    const solver = fluid._solver;
    const frames = fluid._surface.targets.map((target) => target.framebuffer);
    const memory = fluid.textureMemoryInBytes;
    const bounds = fluid._surface.command.boundingVolume.radius;
    const before = read(fluid._surface.inputDepth).filter((v) => v > 0).length;
    const reset = spyOn(solver, "reset").and.callThrough();
    const step = spyOn(solver, "step").and.callThrough();
    fluid.renderRadius = 0.15;
    render();
    expect(fluid.renderRadius).toBe(0.15);
    expect(
      read(fluid._surface.inputDepth).filter((v) => v > 0).length,
    ).toBeGreaterThan(before);
    expect(fluid._surface.command.boundingVolume.radius).toEqualEpsilon(
      bounds + 0.1,
      1e-12,
    );
    expect(fluid.textureMemoryInBytes).toBe(memory);
    expect(fluid._surface.targets.map((target) => target.framebuffer)).toEqual(
      frames,
    );
    expect(reset).not.toHaveBeenCalled();
    expect(step).not.toHaveBeenCalled();
    fluid.renderRadius = 0.05;
    render();
    expect(fluid._surface.command.boundingVolume.radius).toEqualEpsilon(
      bounds,
      1e-12,
    );
    [0, NaN, 0.151].forEach(function (value) {
      expect(() => {
        fluid.renderRadius = value;
      }).toThrowDeveloperError();
      expect(fluid.renderRadius).toBe(0.05);
    });
  });

  [false, true].forEach(function (shared) {
    it(`transmits clear-depth background with ${shared ? "shared SSR" : "standalone"} capture`, function () {
      setup(true, {
        absorption: Cartesian3.ZERO,
        reflectionColor: Cartesian3.ZERO,
        refractionStrength: 0,
      });
      scene.light.intensity = 0;
      scene.backgroundColor = new Color(0.8, 0.1, 0.05, 1);
      scene.camera.setView({
        destination: point(0, -2.5, 0.2),
        orientation: { direction: direction(0, 1, 0), up: direction(0, 0, 1) },
      });
      const reflections = shared
        ? new SceneGISScreenSpaceReflections({ scene, enabled: true })
        : undefined;
      render();
      const water = scene.frameState._sceneGISWater;
      const index = (64 * 128 + 64) * 4;
      expect(read(water.depthTexture)[index]).toBe(0);
      expect(read(water.colorTexture)[index]).toBeGreaterThan(0.5);
      const wet = pixel(point(0, 0, 0.2));
      expect(wet[0]).toBeGreaterThan(100);
      expect(wet[0]).toBeGreaterThan(wet[1] + 40);
      if (shared) {
        expect(reflections._state.main).toBeDefined();
      }
      const capture = scene._sceneGISDeferred._waterColor.getColorTexture();
      const copy = spyOn(
        scene._sceneGISDeferred._copyWater,
        "execute",
      ).and.callThrough();
      render();
      expect(copy.calls.count()).toBe(1);
      expect(scene._sceneGISDeferred._waterColor.getColorTexture()).toBe(
        capture,
      );
      expect(scene.context._gl.getError()).toBe(0);
      scene.destroyForSpecs();
      scene = undefined;
      expect(capture.isDestroyed()).toBeTrue();
    });
  });

  it("publishes reconstructed final depth for TAA and releases resized screen targets", function () {
    setup();
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    render();
    const screen = SceneTransforms.worldToWindowCoordinates(
      scene,
      point(0, 0, 0.2),
    );
    const depth = read(taa._state.depth.getColorTexture());
    const index = (Math.floor(127 - screen.y) * 128 + Math.floor(screen.x)) * 4;
    const eye = Matrix4.multiplyByPoint(
      scene.camera.viewMatrix,
      scene.pickPosition(screen),
      new Cartesian3(),
    );
    expect(depth[index]).toEqualEpsilon(-eye.z, 0.05);
    const previous = fluid._surface.targets.map((target) => target.framebuffer);
    scene.canvas.width = scene.canvas.height = 64;
    render();
    expect(
      previous.every((framebuffer) => framebuffer.isDestroyed()),
    ).toBeTrue();
    expect(fluid._surface.size.x).toBe(64);
    const resources = fluid._solver.targets.slice();
    Matrix4.multiplyByTranslation(
      transform,
      new Cartesian3(0.2, 0, 0),
      fluid.modelMatrix,
    );
    render();
    expect(fluid._solver.targets).toEqual(resources);
    expect(fluid._surface.command.modelMatrix).toEqual(fluid.modelMatrix);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("reconstructs a constant plane normal across reduced-resolution texel boundaries", function () {
    setup(true, { resolutionScale: 0.75 });
    // Match the reported 1001 x 826 viewport and its 751 x 620 depth texture.
    scene.canvas.width = 1001;
    scene.canvas.height = 826;
    scene.camera.frustum.aspectRatio = 1001 / 826;
    render();
    expect(fluid._surface.size.x).toBe(751);
    const values = new Float32Array(751 * 620);
    const tangentY = Math.tan(scene.camera.frustum.fovy * 0.5);
    const tangentX = tangentY * scene.camera.frustum.aspectRatio;
    for (let y = 0; y < 620; y++) {
      for (let x = 0; x < 751; x++) {
        values[y * 751 + x] =
          3 /
          (1 -
            0.4 * ((2 * (x + 0.5)) / 751 - 1) * tangentX -
            0.5 * ((2 * (y + 0.5)) / 620 - 1) * tangentY);
      }
    }
    const plane = new Texture({
      context: scene.context,
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
      flipY: false,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.NEAREST,
        magnificationFilter: TextureMagnificationFilter.NEAREST,
      }),
      source: { width: 751, height: 620, arrayBufferView: values },
    });
    const empty = new Texture({
      context: scene.context,
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
      source: {
        width: 1001,
        height: 826,
        arrayBufferView: new Float32Array(1001 * 826),
      },
    });
    const output = new Framebuffer({
      context: scene.context,
      colorTextures: [
        new Texture({
          context: scene.context,
          width: 1001,
          height: 826,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
        }),
      ],
    });
    const source =
      fluid._surface.command.shaderProgram.fragmentShaderSource.clone();
    // Observe the production reconstructed normal before optical shading and tone mapping.
    source.sources = source.sources.map((text) =>
      text.replace(
        "out_FragColor = vec4(max(color, vec3(0.0)), 1.0);",
        "out_FragColor = vec4(normal, 1.0);",
      ),
    );
    const command = scene.context.createViewportQuadCommand(source, {
      uniformMap: {
        ...fluid._surface.uniforms,
        u_fluidDepth: () => plane,
        u_depth: () => empty,
      },
      framebuffer: output,
    });
    try {
      command.execute(scene.context);
      const pixels = scene.context.readPixels({
        framebuffer: output,
        x: 470,
        y: 200,
        width: 50,
        height: 20,
      });
      const expected = Cartesian3.normalize(
        new Cartesian3(0.4, 0.5, 1),
        new Cartesian3(),
      );
      let maximumError = 0;
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 50; x++) {
          const offset = (y * 50 + x) * 4;
          maximumError = Math.max(
            maximumError,
            Cartesian3.distance(Cartesian3.fromArray(pixels, offset), expected),
          );
        }
      }
      expect(maximumError).toBeLessThan(0.0002);
      expect(scene.context._gl.getError()).toBe(0);
    } finally {
      command.shaderProgram.destroy();
      output.destroy();
      plane.destroy();
      empty.destroy();
    }
  });
});
