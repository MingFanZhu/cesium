import {
  BoxGeometry,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  DirectionalLight,
  FramebufferManager,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix4,
  Model,
  PerInstanceColorAppearance,
  PixelDatatype,
  Primitive,
  Resource,
  SceneGISEnvironmentEffects,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneTransforms,
  SunLight,
  Transforms,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDefaultEnvironment", function () {
  let scene;
  const registered = [];
  afterEach(function () {
    for (const controller of registered) {
      scene.controllerHost.unregisterController(controller, scene.canvas);
    }
    registered.length = 0;
    scene?.destroyForSpecs();
    scene = undefined;
  });
  function globeScene() {
    scene = createScene({ canvas: createCanvas(32, 32) });
    scene.globe = new Globe();
    scene.globe.show = false;
    return scene.environmentEffects;
  }
  function pendingAssets() {
    return spyOn(Resource, "fetchArrayBuffer").and.returnValue(
      new Promise(() => {}),
    );
  }
  function register(controller) {
    scene.controllerHost.registerController(controller, scene.canvas);
    registered.push(controller);
    return controller;
  }
  function unregister(controller) {
    scene.controllerHost.unregisterController(controller, scene.canvas);
    registered.splice(registered.indexOf(controller), 1);
  }
  function planarWorld(extent = 100) {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -extent,
          minimumY: -extent,
          maximumX: extent,
          maximumY: extent,
        }),
      }),
      maximumLevel: 0,
    });
  }

  function linearPixel(y) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    const command = scene.context.createViewportQuadCommand(
      `uniform sampler2D u_color;
       void main() { out_FragColor = texelFetch(u_color, ivec2(16, ${y}), 0); }`,
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          u_color: () => scene.postProcessStages._tonemapping._colorTexture,
        },
      },
    );
    try {
      command.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: target.framebuffer,
          width: 1,
          height: 1,
        }),
      );
    } finally {
      command.shaderProgram.destroy();
      target.destroy();
    }
  }

  ["globe", "planar"].forEach((mode) => {
    it(`keeps accepted appearance defaults across display and ownership changes in ${mode}`, async function () {
      scene = createScene({ canvas: createCanvas(32, 32) });
      const planar = mode === "planar";
      const world = planar ? planarWorld(100000) : new Globe();
      if (planar) {
        world.enableLighting = true;
        scene._initializeWorld(world);
      } else {
        scene.globe = world;
      }
      world.baseColor = new Color(0.4, 0.4, 0.4, 1);
      const origin = planar
        ? Matrix4.IDENTITY
        : Transforms.eastNorthUpToFixedFrame(new Cartesian3(6378137, 0, 0));
      scene.camera.setView({
        destination: Matrix4.multiplyByPoint(
          origin,
          new Cartesian3(0, -2000, 1000),
          new Cartesian3(),
        ),
        orientation: {
          direction: Matrix4.multiplyByPointAsVector(
            origin,
            Cartesian3.normalize(new Cartesian3(0, 1, -0.1), new Cartesian3()),
            new Cartesian3(),
          ),
          up: Matrix4.multiplyByPointAsVector(
            origin,
            Cartesian3.UNIT_Z,
            new Cartesian3(),
          ),
        },
      });
      scene.postProcessStages.fxaa.enabled = false;
      const time = JulianDate.fromIso8601("2026-03-20T12:00:00Z");
      const render = () => scene.renderForSpecs(time);
      const defaults = scene.environmentEffects;
      expect(scene.highDynamicRange).toBe(false);
      await pollToPromise(() => {
        render();
        return defaults.ready && world.tilesLoaded;
      });
      const resources = defaults._pipeline._resources;
      const material = scene._sceneGISDeferred._raw.getColorTexture();
      const baseline = [linearPixel(4), linearPixel(28)];
      baseline.forEach((pixel) => expect(pixel[2]).toBeGreaterThan(0));
      const verifyRadiance = (effects) => {
        expect(effects.surfaceRadianceScale).toBe(1.2);
        expect(effects.backgroundRadianceScale).toBe(2.5);
        expect(effects.aerialRadianceScale).toBe(1);
        expect(effects.aerialPerspectiveDistanceScale).toBe(planar ? 1 : 0.5);
        expect(effects.nightAmbientIntensity).toBe(1);
        const lighting = planar
          ? scene.frameState._sceneGISPlanarLighting
          : scene.frameState._sceneGISGlobeLighting;
        expect(lighting.surfaceRadianceScale).toBe(1.2);
        expect(effects._pipeline._uniformMap.u_backgroundRadianceScale()).toBe(
          2.5,
        );
        expect(
          effects._pipeline._uniformMap.u_aerialPerspectiveDistanceScale(),
        ).toBe(planar ? 1 : 0.5);
        expect(linearPixel(4)).toEqualEpsilon(baseline[0], 0.002);
        expect(linearPixel(28)).toEqualEpsilon(baseline[1], 0.002);
        expect(scene.postProcessStages._sceneGISAutoExposure).toBeUndefined();
        expect(scene.postProcessStages._autoExposureEnabled).toBe(false);
      };
      verifyRadiance(defaults);
      scene.highDynamicRange = true;
      scene.postProcessStages.exposure = 0.7;
      render();
      verifyRadiance(defaults);
      expect(defaults._pipeline._resources).toBe(resources);
      expect(scene._sceneGISDeferred._raw.getColorTexture()).toBe(material);
      const explicit = register(
        new SceneGISEnvironmentEffects({
          mode,
          world: planar ? world : undefined,
          enabled: true,
          showClouds: false,
          showCloudShadows: false,
          showCrepuscularRays: false,
          showBloom: false,
          showLensFlare: false,
        }),
      );
      await pollToPromise(() => {
        render();
        return explicit.ready;
      });
      verifyRadiance(explicit);
      scene.highDynamicRange = false;
      render();
      verifyRadiance(explicit);
      // Explicit art direction remains caller-owned when the display changes.
      explicit.backgroundRadianceScale = 3;
      explicit.surfaceRadianceScale = 2;
      explicit.aerialRadianceScale = 0.5;
      explicit.aerialPerspectiveDistanceScale = 1;
      scene.highDynamicRange = true;
      render();
      expect(explicit.backgroundRadianceScale).toBe(3);
      expect(explicit.surfaceRadianceScale).toBe(2);
      expect(explicit.aerialRadianceScale).toBe(0.5);
      expect(explicit.aerialPerspectiveDistanceScale).toBe(1);
      expect(scene.postProcessStages.exposure).toBe(0.7);
      expect(scene.context._gl.getError()).toBe(0);
    });

    it(`lights real terrain and glTF from the same custom source in ${mode}`, async function () {
      scene = createScene({ canvas: createCanvas(64, 64) });
      const planar = mode === "planar";
      let world;
      if (planar) {
        world = planarWorld(1000);
        world.enableLighting = true;
        scene._initializeWorld(world);
      } else {
        scene.globe = new Globe();
        world = scene.globe;
      }
      world.baseColor = new Color(0.3, 0.3, 0.3, 1);
      const origin = planar
        ? Matrix4.IDENTITY
        : Transforms.eastNorthUpToFixedFrame(new Cartesian3(6378137, 0, 0));
      const point = (x, y, z) =>
        Matrix4.multiplyByPoint(
          origin,
          new Cartesian3(x, y, z),
          new Cartesian3(),
        );
      const vector = (x, y, z) =>
        Matrix4.multiplyByPointAsVector(
          origin,
          new Cartesian3(x, y, z),
          new Cartesian3(),
        );
      scene.camera.setView({
        destination: point(0, 0, 40),
        orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
      });
      const custom = new DirectionalLight({
        direction: vector(0, 0, -1),
        intensity: 0,
      });
      scene.light = custom;
      const effects = scene.environmentEffects;
      effects.showAtmosphere =
        effects.showAerialPerspective =
        effects.showHeightFog =
          false;
      const model = scene.primitives.add(
        await Model.fromGltfAsync({
          url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
          modelMatrix: Matrix4.multiplyByTranslation(
            origin,
            new Cartesian3(6, 0, 2),
            new Matrix4(),
          ),
          scale: 4,
          gltfCallback: (gltf) => {
            gltf.materials[0].pbrMetallicRoughness.baseColorFactor = [
              0.3, 0.3, 0.3, 1,
            ];
          },
        }),
      );
      const time = JulianDate.fromIso8601("2026-03-20T12:00:00Z");
      const render = () => scene.renderForSpecs(time);
      await pollToPromise(() => {
        render();
        return effects.ready && world.tilesLoaded && model.ready;
      });
      const samples = [point(-6, 0, 0), point(6, 0, 4)].map((position) =>
        SceneTransforms.worldToWindowCoordinates(scene, position),
      );
      const sample = () =>
        samples.map((p) =>
          Array.from(
            scene.context.readPixels({
              x: Math.floor(p.x),
              y: 63 - Math.floor(p.y),
              width: 1,
              height: 1,
            }),
          ),
        );
      const ambient = sample();
      const sun = Cartesian3.clone(effects._pipeline._sunDirection);
      const draws = scene._sceneGISDeferred.drawCount;
      const bytes = scene._sceneGISDeferred.byteLength;
      custom.color = Color.clone(Color.RED);
      custom.intensity = 2;
      render();
      const red = sample();
      custom.color = Color.clone(Color.BLUE);
      render();
      const blue = sample();
      for (let i = 0; i < samples.length; i++) {
        expect(red[i][0]).toBeGreaterThan(ambient[i][0] + 8);
        expect(blue[i][2]).toBeGreaterThan(ambient[i][2] + 8);
        expect(red[i][0]).toBeGreaterThan(blue[i][0] + 8);
        expect(blue[i][2]).toBeGreaterThan(red[i][2] + 8);
      }
      custom.direction = vector(0, 0, 1);
      render();
      const below = sample();
      for (let i = 0; i < samples.length; i++) {
        expect(below[i]).toEqualEpsilon(ambient[i], 1);
      }
      expect(effects._pipeline._sunDirection).toEqual(sun);
      expect(scene._sceneGISDeferred.drawCount).toBe(draws);
      expect(scene._sceneGISDeferred.byteLength).toBe(bytes);
      expect(scene.light).toBe(custom);
      expect(scene.context._gl.getError()).toBe(0);
    });

    it(`preserves custom primary light ownership and automatic restoration in ${mode}`, async function () {
      let effects;
      if (mode === "globe") {
        effects = globeScene();
      } else {
        scene = createScene({ canvas: createCanvas(32, 32) });
        scene._initializeWorld(planarWorld());
        scene.camera.setView({
          destination: new Cartesian3(0, 0, 10),
          orientation: {
            direction: new Cartesian3(0, 0, -1),
            up: Cartesian3.UNIT_Y,
          },
        });
        effects = scene.environmentEffects;
      }
      const custom = new DirectionalLight({
        direction: Cartesian3.normalize(
          new Cartesian3(-1, 0, -1),
          new Cartesian3(),
        ),
        color: new Color(0.2, 0.4, 0.6, 1),
        intensity: 3,
      });
      scene.light = custom;
      const errors = jasmine.createSpy("environment errors");
      effects.errorEvent.addEventListener(errors);
      await pollToPromise(() => {
        scene.renderForSpecs();
        return effects.ready;
      });
      const renderer = effects._pipeline;
      const lut = renderer._resources.transmittanceTexture;
      const unit = 40000.0;
      const solarRgb = new Cartesian3(
        (1.474 * 98242.786222) / unit,
        (1.8504 * 69954.398112) / unit,
        (1.91198 * 66475.012354) / unit,
      );
      expect(scene.light).toBe(custom);
      expect(renderer._primaryLightDirection).toEqualEpsilon(
        Cartesian3.negate(custom.direction, new Cartesian3()),
        1e-12,
      );
      expect(
        Cartesian3.multiplyComponents(
          renderer._primaryLightScale,
          solarRgb,
          new Cartesian3(),
        ),
      ).toEqualEpsilon(new Cartesian3(0.6, 1.2, 1.8), 1e-12);
      custom.color = Color.clone(Color.GREEN);
      custom.intensity = 0;
      scene.renderForSpecs();
      expect(renderer._primaryLightScale).toEqual(Cartesian3.ZERO);
      custom.direction = new Cartesian3(0, 0, -1);
      custom.intensity = 2;
      scene.renderForSpecs();
      expect(renderer._primaryLightDirection).toEqual(Cartesian3.UNIT_Z);
      expect(
        Cartesian3.multiplyComponents(
          renderer._primaryLightScale,
          solarRgb,
          new Cartesian3(),
        ),
      ).toEqualEpsilon(new Cartesian3(0, 2 * Color.GREEN.green, 0), 1e-12);
      expect(renderer._resources.transmittanceTexture).toBe(lut);
      const sun = new SunLight();
      scene.light = sun;
      scene.renderForSpecs();
      const automatic = scene.light;
      expect(automatic).not.toBe(sun);
      expect(automatic).not.toBe(custom);
      effects.enabled = false;
      scene.renderForSpecs();
      expect(scene.light).toBe(sun);
      effects.enabled = true;
      scene.renderForSpecs();
      expect(scene.light).toBe(automatic);
      scene.light = custom;
      scene.renderForSpecs();
      effects.enabled = false;
      scene.renderForSpecs();
      expect(scene.light).toBe(custom);
      expect(custom.intensity).toBe(2);
      effects.enabled = true;
      const explicit = register(
        new SceneGISEnvironmentEffects({
          mode,
          world: mode === "planar" ? scene.world : undefined,
          enabled: true,
          showClouds: false,
        }),
      );
      await pollToPromise(() => {
        scene.renderForSpecs();
        return explicit.ready;
      });
      expect(scene.light).toBe(custom);
      expect(explicit._pipeline._primaryLightDirection).toEqual(
        Cartesian3.UNIT_Z,
      );
      unregister(explicit);
      await pollToPromise(() => {
        scene.renderForSpecs();
        return effects.ready;
      });
      expect(scene.light).toBe(custom);
      expect(errors).not.toHaveBeenCalled();
      expect(scene.context._gl.getError()).toBe(0);
    });
  });

  it("creates lightweight defaults lazily and preserves LDR display settings", async function () {
    const fetch = spyOn(Resource, "fetchArrayBuffer").and.callThrough();
    const effects = globeScene();
    expect(scene.highDynamicRange).toBe(false);
    expect(effects.enabled).toBe(true);
    expect(effects.showAtmosphere).toBe(true);
    expect(effects.showAerialPerspective).toBe(true);
    expect(effects.showHeightFog).toBe(true);
    for (const property of [
      "showClouds",
      "showCloudShadows",
      "showCrepuscularRays",
      "showBloom",
      "showLensFlare",
    ]) {
      expect(effects[property]).toBe(false);
    }
    expect(fetch).not.toHaveBeenCalled();
    scene.renderForSpecs();
    await pollToPromise(() => {
      scene.renderForSpecs();
      return effects.ready;
    });
    expect(fetch.calls.count()).toBe(3);
    const renderer = effects._pipeline;
    const resources = renderer._resources;
    expect(resources.cloudShapeTexture).toBeUndefined();
    expect(resources.cloudProgram).toBeUndefined();
    expect(renderer._globeShadowResources).toBeUndefined();
    expect(renderer._bloomResources).toBeUndefined();
    expect(scene.highDynamicRange).toBe(false);
    expect(scene.frameState._sceneGISGlobeLighting.active).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
    const lut = resources.scatteringTexture;
    effects.enabled = false;
    effects.showClouds = true;
    effects.enabled = true;
    await pollToPromise(() => {
      scene.renderForSpecs();
      return renderer.hasCloudResources();
    });
    expect(fetch.calls.count()).toBe(8);
    expect(resources.scatteringTexture).toBe(lut);
    expect(resources.cloudShapeTexture).toBeDefined();
    expect(renderer._globeShadowResources).toBeUndefined();
    expect(scene.context._gl.getError()).toBe(0);
    effects.showClouds = false;
    scene.renderForSpecs();
    expect(renderer._cloudPassActive).toBe(false);
    const cloud = resources.cloudShapeTexture;
    scene.destroyForSpecs();
    scene = undefined;
    expect(lut.isDestroyed()).toBe(true);
    expect(cloud.isDestroyed()).toBe(true);
  });

  it("yields to explicit controllers, including disabled ones, and restores the saved default", function () {
    pendingAssets();
    const defaults = globeScene();
    scene.renderForSpecs();
    const pipeline = defaults._pipeline;
    defaults.showHeightFog = false;
    const explicit = register(
      new SceneGISEnvironmentEffects({ mode: "globe", enabled: false }),
    );
    expect(scene.environmentEffects).toBe(explicit);
    scene.renderForSpecs();
    expect(pipeline.isDestroyed()).toBe(true);
    expect(defaults.enabled).toBe(true);
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    explicit.enabled = true;
    scene.renderForSpecs();
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(explicit._pipeline);
    unregister(explicit);
    expect(scene.environmentEffects).toBe(defaults);
    scene.renderForSpecs();
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(defaults._pipeline);
    expect(defaults.showHeightFog).toBe(false);
    defaults.enabled = false;
    register(explicit);
    scene.renderForSpecs();
    unregister(explicit);
    scene.renderForSpecs();
    expect(defaults.enabled).toBe(false);
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
  });

  it("releases the old world before replacement and rejects late asset publication", async function () {
    let resolve;
    const fetch = spyOn(Resource, "fetchArrayBuffer").and.returnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const old = globeScene();
    scene.renderForSpecs();
    const pipeline = old._pipeline;
    scene.globe = new Globe();
    scene.globe.show = false;
    expect(pipeline.isDestroyed()).toBe(true);
    const next = scene.environmentEffects;
    next.enabled = false;
    resolve(new ArrayBuffer(0));
    await Promise.resolve();
    await Promise.resolve();
    scene.renderForSpecs();
    expect(old.ready).toBe(false);
    expect(old._pendingBuffers).toBeUndefined();
    expect(next).not.toBe(old);
    expect(fetch.calls.count()).toBe(3);
  });

  it("latches initial resource failure and requests a render without retrying", async function () {
    let reject;
    const fetch = spyOn(Resource, "fetchArrayBuffer").and.returnValue(
      new Promise((resolve, fail) => {
        reject = fail;
      }),
    );
    const effects = globeScene();
    const error = jasmine.createSpy("error");
    effects.errorEvent.addEventListener(error);
    scene.renderForSpecs();
    const requestRender = spyOn(scene, "requestRender").and.callThrough();
    reject(new Error("asset failure"));
    await pollToPromise(() => error.calls.count() === 1);
    expect(requestRender).toHaveBeenCalled();
    scene.renderForSpecs();
    scene.renderForSpecs();
    expect(fetch.calls.count()).toBe(3);
    expect(error.calls.count()).toBe(1);
    expect(effects.ready).toBe(false);
  });

  it("uses fixed-Z planar light authority and lets an explicit authority take over", function () {
    pendingAssets();
    scene = createScene({ canvas: createCanvas(32, 32) });
    const world = planarWorld();
    scene._initializeWorld(world);
    const effects = scene.environmentEffects;
    expect(world.environment).toBeUndefined();
    scene.renderForSpecs();
    const light = world.environment;
    expect(light._hasAuthority).toBe(true);
    expect(effects._pipeline).toBeDefined();
    const explicit = register(
      new SceneGISPlanarEnvironment({
        world,
        showAtmosphere: true,
        sunDirection: new Cartesian3(1, 0, 1),
        moonDirection: new Cartesian3(-1, 0, -1),
      }),
    );
    expect(light._hasAuthority).toBe(false);
    scene.renderForSpecs();
    expect(world.environment).toBe(explicit);
    expect(explicit._hasAuthority).toBe(true);
    unregister(explicit);
    scene.renderForSpecs();
    expect(world.environment).toBe(light);
    expect(light._hasAuthority).toBe(true);
    effects.enabled = false;
    scene.renderForSpecs();
    expect(light._hasAuthority).toBe(false);
  });

  it("does not restore legacy Planar sky when advanced effects are disabled", function () {
    const fetch = pendingAssets();
    scene = createScene({ canvas: createCanvas(32, 32) });
    const world = planarWorld();
    scene._initializeWorld(world);
    scene.camera.setView({
      destination: new Cartesian3(0, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, 1),
        up: new Cartesian3(0, 1, 0),
      },
    });
    scene.environmentEffects.enabled = false;
    const explicit = register(
      new SceneGISPlanarEnvironment({
        world,
        showAtmosphere: true,
        showSun: true,
        showMoon: true,
        sunDirection: new Cartesian3(1, 0, 1),
        moonDirection: new Cartesian3(-1, 0, -1),
      }),
    );
    scene.renderForSpecs();
    expect(explicit._hasAuthority).toBe(true);
    expect(world._atmosphereRenderer._shaderProgram).toBeUndefined();
    expect(world._celestialBodyRenderer._shaderProgram).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
    ).toEqual([0, 0, 0, 255]);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("preserves clear Planar sky when clouds are enabled with deferred depth", async function () {
    scene = createScene({ canvas: createCanvas(32, 32) });
    const world = planarWorld(100000);
    scene._initializeWorld(world);
    scene.camera.setView({
      destination: new Cartesian3(0, -13000, 2700),
      orientation: {
        direction: Cartesian3.normalize(
          new Cartesian3(0, 22000, -2200),
          new Cartesian3(),
        ),
        up: Cartesian3.UNIT_Z,
      },
    });
    const effects = scene.environmentEffects;
    await pollToPromise(() => {
      scene.renderForSpecs();
      return effects.ready && world.tilesLoaded;
    });
    const sampleSky = () =>
      Array.from(
        scene.context.readPixels({ x: 16, y: 26, width: 1, height: 1 }),
      );
    expect(sampleSky()[2]).toBeGreaterThan(30);
    effects.showClouds = true;
    await pollToPromise(() => {
      scene.renderForSpecs();
      return effects._pipeline.hasCloudResources();
    });
    for (const logarithmic of [false, true]) {
      scene.logarithmicDepthBuffer = logarithmic;
      scene.renderForSpecs();
      expect(effects._pipeline._linearSceneDepth).toBe(true);
      expect(sampleSky()[2]).toBeGreaterThan(30);
    }
    effects.showClouds = false;
    scene.renderForSpecs();
    expect(sampleSky()[2]).toBeGreaterThan(30);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("applies cloud-free Planar aerial perspective and height fog to deferred receivers", async function () {
    scene = createScene({ canvas: createCanvas(32, 32) });
    const world = planarWorld(100000);
    scene._initializeWorld(world);
    scene.logarithmicDepthBuffer = true;
    scene.camera.setView({
      destination: new Cartesian3(0, -10000, 2700),
      orientation: {
        direction: Cartesian3.normalize(
          new Cartesian3(0, 30000, -2200),
          new Cartesian3(),
        ),
        up: Cartesian3.UNIT_Z,
      },
    });
    const primitive = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(8000, 1000, 2000),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 20000, 1000)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.STEELBLUE),
          },
        }),
        appearance: new PerInstanceColorAppearance({ translucent: false }),
      }),
    );
    const effects = scene.environmentEffects;
    await pollToPromise(() => {
      scene.renderForSpecs();
      return effects.ready && primitive.ready && world.tilesLoaded;
    });
    const sample = () =>
      Array.from(
        scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
      );
    const combined = sample();
    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    scene.renderForSpecs();
    const baseline = sample();
    expect(combined).not.toEqual(baseline);
    expect(baseline[2]).toBeGreaterThan(baseline[0]);
    effects.showAerialPerspective = true;
    scene.renderForSpecs();
    expect(sample()).not.toEqual(baseline);
    effects.showAerialPerspective = false;
    effects.showHeightFog = true;
    scene.renderForSpecs();
    expect(sample()).not.toEqual(baseline);
    expect(effects._pipeline._linearSceneDepth).toBe(true);
    expect(effects._pipeline.hasCloudResources()).toBe(false);
    expect(scene.context._gl.getError()).toBe(0);
  });
});
