import {
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CustomShader,
  DirectionalLight,
  Event,
  GeometryInstance,
  Globe,
  ImageBasedLighting,
  LightingModel,
  Matrix4,
  Model,
  OrthographicFrustum,
  PixelDatatype,
  PerInstanceColorAppearance,
  Primitive,
  SceneGISLightCollection,
  SceneGISPointLight,
  SceneGISSpotLight,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
  SceneGISScreenSpaceReflections,
  SceneTransforms,
  ShadowMode,
  Transforms,
  UniformType,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISLightCollection", function () {
  let scene, lights, world, frame, shader, ibl;
  function point(x, y, z) {
    return Matrix4.multiplyByPoint(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function vector(x, y, z) {
    return Matrix4.multiplyByPointAsVector(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function setup(planar = true, terrain = false) {
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    frame = planar
      ? Matrix4.fromTranslation(new Cartesian3(20000000, -30000000, 0))
      : Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(0, 35));
    if (planar) {
      world = new SceneGISPlanarWorld({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: 19999872,
            maximumX: 20000128,
            minimumY: -30000128,
            maximumY: -29999872,
          }),
        }),
        maximumLevel: 0,
        baseColor: Color.WHITE,
        enableLighting: true,
      });
      scene._initializeWorld(world);
      world.show = terrain;
    } else if (terrain) {
      world = scene.globe = new Globe();
      world.baseColor = Color.WHITE;
      world.enableLighting = true;
      world.showGroundAtmosphere = false;
      world.lightingFadeOutDistance = 0;
      world.lightingFadeInDistance = 1;
      world.maximumScreenSpaceError = 1000;
    }
    scene.fog.enabled = false;
    scene.light = new DirectionalLight({
      direction: vector(1, 0, -1),
      color: Color.BLACK,
    });
    scene.camera.setView({
      destination: point(0, 0, 40),
      orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 40,
      aspectRatio: 1,
      near: 1,
      far: 200,
    });
    lights = new SceneGISLightCollection({ scene });
  }
  function sample(x = 0, y = 0) {
    scene.renderForSpecs();
    const p = SceneTransforms.worldToWindowCoordinates(scene, point(x, y, 0));
    return Array.from(
      scene.context.readPixels({
        x: Math.floor(p.x),
        y: 127 - Math.floor(p.y),
        width: 1,
        height: 1,
      }),
    );
  }
  async function floor(unlit = false) {
    shader = new CustomShader({
      lightingModel: unlit ? LightingModel.UNLIT : LightingModel.PBR,
      uniforms: {
        u_emission: { type: UniformType.VEC3, value: new Cartesian3() },
      },
      fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        material.diffuse = vec3(0.4); material.specular = vec3(0.04); material.roughness = 0.6;
        material.emissive = u_emission;
      }`,
    });
    ibl = new ImageBasedLighting({ imageBasedLightingFactor: Cartesian2.ZERO });
    const matrix = Matrix4.multiplyByTranslation(
      frame,
      new Cartesian3(0, 0, -0.5),
      new Matrix4(),
    );
    Matrix4.multiplyByScale(matrix, new Cartesian3(40, 40, 1), matrix);
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
        modelMatrix: matrix,
        imageBasedLighting: ibl,
        customShader: shader,
        shadows: ShadowMode.ENABLED,
      }),
    );
    await pollToPromise(() => {
      scene.renderForSpecs();
      return model.ready;
    });
    return model;
  }
  function lamp(x = 0, y = 0, z = 8, color = Color.RED) {
    return lights.add(
      new SceneGISPointLight({
        position: point(x, y, z),
        color,
        intensity: 150,
        range: 50,
      }),
    );
  }
  function caster() {
    return scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(2, 2, 8),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.multiplyByTranslation(
            frame,
            new Cartesian3(-4, 0, 4),
            new Matrix4(),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          closed: true,
        }),
        asynchronous: false,
        shadows: ShadowMode.ENABLED,
      }),
    );
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    shader?.destroy();
    ibl?.destroy();
    scene = lights = world = shader = ibl = undefined;
  });

  it("validates descriptors, clones inputs and borrows lights with bounded capacity", function () {
    setup();
    expect(() => new SceneGISPointLight()).toThrowDeveloperError();
    expect(
      () => new SceneGISPointLight({ position: Cartesian3.ZERO, range: 0 }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISSpotLight({
          position: Cartesian3.ZERO,
          direction: Cartesian3.ZERO,
        }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISSpotLight({
          position: Cartesian3.ZERO,
          direction: Cartesian3.UNIT_Z,
          innerConeAngle: 1,
          outerConeAngle: 0.5,
        }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISLightCollection({ scene }),
    ).toThrowDeveloperError();
    const position = point(0, 0, 8);
    const light = new SceneGISPointLight({ position });
    expect(light.position).not.toBe(position);
    expect(lights.add(light)).toBe(light);
    expect(lights.add(light)).toBe(light);
    expect(lights.length).toBe(1);
    expect(lights.get(0)).toBe(light);
    expect(lights.contains(light)).toBe(true);
    expect(() => lights.get(1)).toThrowDeveloperError();
    for (let i = 1; i < SceneGISLightCollection.MAXIMUM_LIGHTS; i++) {
      lamp();
    }
    scene.renderForSpecs();
    expect(lights._state.count).toBe(16);
    expect(() => lamp()).toThrowDeveloperError();
    expect(lights.remove(light)).toBe(true);
    expect(lights.remove(light)).toBe(false);
    lights.destroy();
    expect(lights.isDestroyed()).toBe(true);
    lights = new SceneGISLightCollection({ scene });
    lights.add(light);
    scene.destroyForSpecs();
    scene = undefined;
    expect(lights.isDestroyed()).toBe(true);
    expect(light.position).toEqual(position);
  });

  [true, false].forEach(function (planar) {
    const name = planar ? "Planar" : "Globe";
    it(`${name}: adds colored PBR/clearcoat sources, smooth distance falloff and finite range in HDR/LDR`, async function () {
      setup(planar);
      await floor();
      const red = lamp();
      const blue = lamp(0, 0, 8, Color.BLUE);
      for (const hdr of [false, true]) {
        scene.highDynamicRange = hdr;
        blue.show = false;
        const near = sample();
        expect(near[0]).toBeGreaterThan(50);
        expect(near[2]).toBeLessThan(3);
        red.position = point(0, 0, 16);
        const far = sample();
        expect(far[0]).toBeLessThan(near[0] - 10);
        red.position = point(0, 0, 8);
        blue.show = true;
        const mixed = sample();
        expect(mixed[0]).toBeGreaterThan(40);
        expect(mixed[2]).toBeGreaterThan(40);
        lights.show = false;
        expect(sample().slice(0, 3)).toEqual([0, 0, 0]);
        lights.show = true;
        red.range = blue.range = 4;
        expect(sample().slice(0, 3)).toEqual([0, 0, 0]);
        red.range = blue.range = 50;
      }
      red.intensity = Number.NaN;
      expect(() => scene.renderForSpecs()).toThrowDeveloperError();
    });

    it(`${name}: rotates a spot cone and preserves world-space alignment under camera movement`, async function () {
      setup(planar);
      await floor();
      const spot = lights.add(
        new SceneGISSpotLight({
          position: point(0, 0, 8),
          direction: vector(0, 0, -1),
          intensity: 100,
          range: 30,
          innerConeAngle: 0.15,
          outerConeAngle: 0.4,
        }),
      );
      const center = sample()[0];
      expect(center).toBeGreaterThan(50);
      expect(sample(5, 0)[0]).toBeLessThan(3);
      const edge = sample(2.5, 0)[0];
      expect(edge).toBeGreaterThan(3);
      expect(edge).toBeLessThan(center);
      spot.direction = vector(1, 0, 0);
      expect(sample()[0]).toBeLessThan(3);
      spot.direction = vector(0, 0, -1);
      scene.camera.moveRight(2);
      expect(sample()[0]).toEqualEpsilon(center, 5);
    });

    it(`${name}: keeps emission and local light independent of Sun shadows and AO, and reuses shaders`, async function () {
      setup(planar);
      await floor();
      scene.primitives.add(
        new Primitive({
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(2, 2, 8),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            modelMatrix: Matrix4.multiplyByTranslation(
              frame,
              new Cartesian3(-4, 0, 4),
              new Matrix4(),
            ),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            translucent: false,
            closed: true,
          }),
          asynchronous: false,
          shadows: ShadowMode.ENABLED,
        }),
      );
      const light = lamp();
      shader.setUniform("u_emission", new Cartesian3(0, 0.2, 0));
      const lit = sample();
      scene.shadowMap.enabled = true;
      scene.shadowMap.size = 256;
      scene.shadowMap.maximumDistance = 100;
      scene.shadowMap.darkness = 0;
      scene.postProcessStages.ambientOcclusion.enabled = true;
      expect(sample()).toEqualEpsilon(lit, 2);
      light.show = false;
      const emission = sample();
      expect(emission[1]).toBeGreaterThan(30);
      expect(emission[0]).toBeLessThan(3);
      light.show = true;
      sample();
      const count = scene.context.shaderCache.numberOfShaders;
      light.position = point(1, 0, 8);
      sample();
      expect(scene.context.shaderCache.numberOfShaders).toBe(count);
      expect(lights._state.count).toBe(1);
      light.show = false;
      scene.light.color = Color.WHITE;
      const sunShadow = sample()[0];
      scene.shadowMap.enabled = false;
      expect(sample()[0]).toBeGreaterThan(sunShadow + 20);
    });

    it(`${name}: leaves unlit models unchanged`, async function () {
      setup(planar);
      await floor(true);
      const before = sample();
      lamp();
      expect(sample()).toEqual(before);
    });

    it(`${name}: lights native Phong opaque and translucent receivers without changing pick`, function () {
      setup(planar);
      const primitive = scene.primitives.add(
        new Primitive({
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(30, 30, 1),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            modelMatrix: Matrix4.multiplyByTranslation(
              frame,
              new Cartesian3(0, 0, -0.5),
              new Matrix4(),
            ),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(
                new Color(0.3, 0.3, 0.3, 0.7),
              ),
            },
            id: "local-floor",
          }),
          appearance: new PerInstanceColorAppearance({
            translucent: false,
            closed: true,
          }),
          asynchronous: false,
        }),
      );
      const before = sample()[0];
      lamp();
      expect(sample()[0]).toBeGreaterThan(before + 20);
      expect(scene.pick(new Cartesian2(64, 64)).id).toBe("local-floor");
      primitive.appearance = new PerInstanceColorAppearance({
        translucent: true,
        closed: true,
      });
      expect(sample()[0]).toBeGreaterThan(30);
      lights.show = false;
      const dim = sample()[0];
      lights.show = true;
      expect(sample()[0]).toBeGreaterThan(dim + 10);
      caster();
      primitive.shadows = ShadowMode.RECEIVE_ONLY;
      const unshadowed = sample();
      scene.shadowMap.enabled = true;
      scene.shadowMap.size = 256;
      scene.shadowMap.maximumDistance = 100;
      scene.shadowMap.darkness = 0;
      expect(sample()).toEqualEpsilon(unshadowed, 2);
    });

    it(`${name}: adds local diffuse light to lit terrain`, async function () {
      setup(planar, true);
      if (planar) {
        world.terrainProvider = {
          tilingScheme: world.tilingScheme,
          minimumHeight: 0,
          maximumHeight: 0,
          maximumLevel: 0,
          errorEvent: new Event(),
          getLevelMaximumGeometricError: () => 16,
          requestTileGeometry: () =>
            Promise.resolve(
              new SceneGISPlanarHeightmapTerrainData({
                buffer: new Float32Array(17 * 17),
                width: 17,
                height: 17,
              }),
            ),
          getTileDataAvailable: () => true,
          loadTileDataAvailability: () => undefined,
        };
      }
      await pollToPromise(
        () => {
          scene.renderForSpecs();
          return world.tilesLoaded;
        },
        { timeout: 10000 },
      );
      lights.show = false;
      const before = sample();
      lamp();
      lights.show = true;
      const after = sample();
      expect(after[0]).toBeGreaterThan(before[0] + 20);
      expect(after[1]).toEqualEpsilon(before[1], 2);
    });
  });

  it("includes local lighting in the SSR capture path and detaches cleanly", async function () {
    setup();
    scene.highDynamicRange = true;
    await floor();
    const effect = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    lamp();
    expect(sample()[0]).toBeGreaterThan(40);
    expect(effect._ready).toBe(true);
    // Lit sources can be captured in the main MRT pass or the compatible replay path.
    expect(
      effect._state.captureDraws + effect._state.mainDraws,
    ).toBeGreaterThan(0);
    lights.destroy();
    expect(sample()[0]).toBeLessThan(3);
    effect.enabled = false;
    expect(sample()[0]).toBeLessThan(3);
  });

  it("preserves dark HDR emission through native bloom and releases targets across mode changes", async function () {
    setup();
    scene.highDynamicRange = true;
    await floor();
    shader.setUniform("u_emission", new Cartesian3(0.002, 0.004, 0.008));
    const before = sample();
    const bloom = scene.postProcessStages.bloom;
    bloom.enabled = true;
    const after = sample();
    expect(after).toEqualEpsilon(before, 1);
    expect(after[2]).toBeGreaterThan(5);
    const hdrTexture = scene.postProcessStages.getOutputTexture(bloom.name);
    expect(hdrTexture.pixelDatatype).toBe(PixelDatatype.HALF_FLOAT);
    sample();
    expect(scene.postProcessStages.getOutputTexture(bloom.name)).toBe(
      hdrTexture,
    );
    scene.highDynamicRange = false;
    sample();
    expect(hdrTexture.isDestroyed()).toBe(true);
    const ldrTexture = scene.postProcessStages.getOutputTexture(bloom.name);
    expect(ldrTexture.pixelDatatype).toBe(PixelDatatype.UNSIGNED_BYTE);
    scene.destroyForSpecs();
    scene = undefined;
    expect(ldrTexture.isDestroyed()).toBe(true);
  });
});
