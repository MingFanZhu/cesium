import {
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  DirectionalLight,
  Event,
  FramebufferManager,
  GeometryInstance,
  Material,
  Matrix4,
  OrthographicFrustum,
  Pass,
  PerspectiveFrustum,
  PlaneGeometry,
  PerInstanceColorAppearance,
  PixelDatatype,
  Primitive,
  SceneGISEnvironmentEffects,
  SceneGISLightCollection,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
  SceneGISPointLight,
  SceneGISScreenSpaceIndirectLighting,
  SceneGISScreenSpaceReflections,
  SceneGISSurfaceWeather,
  ShadowMode,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredPlanar", function () {
  let scene, world, renderer, environment, effects, material;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -32,
          minimumY: -32,
          maximumX: 32,
          maximumY: 32,
        }),
      }),
      maximumLevel: 0,
      baseColor: new Color(0.2, 0.4, 0.6, 1),
      enableLighting: true,
      lambertDiffuseMultiplier: 0.9,
    });
    scene._initializeWorld(world);
    // Material fixtures control their light and environment explicitly.
    scene.environmentEffects.enabled = false;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.light = new DirectionalLight({ direction: new Cartesian3(0, 0, -1) });
    scene.camera.setView({
      destination: new Cartesian3(0, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 8,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
    scene.logarithmicDepthBuffer = false;
    renderer = scene._sceneGISDeferred;
  });
  afterEach(function () {
    effects?.disconnectedCallback(effects._element);
    environment?.disconnectedCallback(environment._element);
    scene?.destroyForSpecs();
    material?.destroy();
    scene = world = renderer = effects = environment = material = undefined;
  });
  function render() {
    scene.renderForSpecs();
  }
  function sample(texture, x = 32) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    const copy = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_texture; uniform vec2 u_pixel; void main(){out_FragColor=texelFetch(u_texture,ivec2(u_pixel),0);}",
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          u_texture: () => texture,
          u_pixel: () => new Cartesian2(x, 32),
        },
      },
    );
    try {
      copy.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: target.framebuffer,
          width: 1,
          height: 1,
        }),
      );
    } finally {
      copy.shaderProgram.destroy();
      target.destroy();
    }
  }
  function color(x = 32) {
    return sample(
      scene._view.sceneFramebuffer._colorFramebuffer.getColorTexture(),
      x,
    );
  }
  function raw(index, x = 32) {
    return sample(renderer._raw.getColorTexture(index), x);
  }
  function composed() {
    return sample(scene.postProcessStages._tonemapping._colorTexture);
  }
  function box(z, tint = Color.BLUE) {
    return scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          id: `box-${z}`,
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(4, 4, 1),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, z)),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(tint) },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
          closed: true,
        }),
      }),
    );
  }

  [false, true].forEach(function (logarithmicDepthBuffer) {
    it(`reveals objects behind translucent terrain and keeps foreground depth (${logarithmicDepthBuffer ? "log" : "linear"})`, function () {
      scene.camera.frustum = new PerspectiveFrustum({
        fov: Math.PI / 3,
        aspectRatio: 1,
        near: 0.1,
        far: 100,
      });
      scene.logarithmicDepthBuffer = logarithmicDepthBuffer;
      scene.farToNearRatio = scene.logarithmicDepthFarToNearRatio = 2;
      const behind = box(-2);
      const foreground = box(3, Color.RED);
      foreground.show = false;
      render();
      const surface = world._surface;
      const command = surface._renderCommands[0];
      const geometry = command.vertexArray;
      const opaque = composed();
      expect(opaque).toEqualEpsilon([0.2, 0.4, 0.6, 1], 0.001);
      world.opacity = 0.5;
      render();
      expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
      expect(composed()).toEqualEpsilon([0.1, 0.2, 0.8, 1], 0.003);
      expect(command.pass).toBe(Pass.TRANSLUCENT);
      expect(command.renderState.depthMask).toBeFalse();
      expect(renderer._planar).toBeUndefined();
      expect(scene.pick(new Cartesian2(32, 32)).id).toBe("box--2");
      expect(scene.pickPosition(new Cartesian2(32, 32)).z).toEqualEpsilon(
        -1.5,
        0.01,
      );
      scene.pickTranslucentDepth = true;
      render();
      expect(scene.pickPosition(new Cartesian2(32, 32)).z).toEqualEpsilon(
        0,
        0.01,
      );
      scene.pickTranslucentDepth = false;
      foreground.show = true;
      render();
      expect(composed()).toEqualEpsilon([1, 0, 0, 1], 0.003);
      foreground.show = false;
      world.opacity = 0;
      render();
      expect(composed()).toEqualEpsilon([0, 0, 1, 1], 0.003);
      expect(scene.pick(new Cartesian2(32, 32)).id).toBe("box--2");
      world.opacity = 1;
      render();
      expect(composed()).toEqualEpsilon(opaque, 0.003);
      expect(command.pass).toBe(Pass.GLOBE);
      expect(command.renderState.depthMask).toBeTrue();
      expect(surface._renderCommands[0]).toBe(command);
      expect(command.vertexArray).toBe(geometry);
      expect(renderer._planar).toBeDefined();
      expect(surface._debug.createdCommands).toBe(1);
      scene.primitives.remove(behind);
    });
  });

  it("composes translucent objects on both sides of the surface through the same OIT", function () {
    box(-3);
    for (const [z, tint] of [
      [-1, Color.LIME],
      [1, Color.RED],
    ]) {
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          geometryInstances: new GeometryInstance({
            geometry: new PlaneGeometry({
              vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
            }),
            modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, z)),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(
                tint.withAlpha(0.5),
              ),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: true,
          }),
        }),
      );
    }
    world.opacity = 0.5;
    render();
    expect(scene._environmentState.useOIT).toBeTrue();
    // Three half-alpha layers share native weighted OIT over the blue opaque box.
    expect(composed().slice(0, 3)).toEqualEpsilon([0.35, 0.408333, 0.3], 0.003);
    world.opacity = 1;
    render();
    expect(composed().slice(0, 3)).toEqualEpsilon([0.6, 0.2, 0.3], 0.003);
  });

  it("stores unlit material and applies enableLighting and Lambert parameters in one light pass", function () {
    render();
    const albedo = raw(0);
    expect(albedo).toEqualEpsilon([0.2, 0.4, 0.6, 1], 0.001);
    expect(raw(2)).toEqualEpsilon([1, 0.9, 0.3, -5], 0.001);
    expect(color()).toEqualEpsilon(albedo, 0.001);
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(10, 0.001);
    expect(renderer.drawCount).toBe(1);
    expect(renderer.lightDrawCount).toBe(1);
    scene.light.direction = Cartesian3.UNIT_X;
    render();
    expect(raw(0)).toEqual(albedo);
    expect(color()).toEqualEpsilon([0.06, 0.12, 0.18, 1], 0.001);
    world.enableLighting = false;
    render();
    expect(raw(2)[0]).toBe(0);
    expect(color()).toEqualEpsilon(albedo, 0.001);
    const pixels = Array.from(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
    );
    expect(pixels).toEqualEpsilon(
      [0.2, 0.4, 0.6]
        .map((v) => Math.round(255 * v ** (1 / scene.gamma)))
        .concat(255),
      1,
    );
    const texture = renderer._raw.getColorTexture();
    world.show = false;
    render();
    expect(renderer._planar).toBeUndefined();
    scene.destroyForSpecs();
    scene = undefined;
    expect(texture.isDestroyed()).toBeTrue();
  });

  it("composes imagery and Fabric before translucent lighting in linear LDR color", async function () {
    const image = document.createElement("canvas");
    image.width = image.height = 1;
    const context = image.getContext("2d");
    context.fillStyle = "blue";
    context.fillRect(0, 0, 1, 1);
    world.imageryLayers.addImageryProvider({
      tilingScheme: world.tilingScheme,
      minimumLevel: 0,
      maximumLevel: 0,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: false,
      errorEvent: new Event(),
      requestImage: () => Promise.resolve(image),
    });
    material = Material.fromType(Material.ColorType, {
      color: new Color(1, 0, 0, 0.5),
    });
    world.material = material;
    await pollToPromise(() => {
      render();
      return world.tilesLoaded;
    });
    expect(raw(0)).toEqualEpsilon([0.5, 0, 0.5, 1], 0.001);
    scene.backgroundColor = Color.LIME;
    world.opacity = 0.5;
    render();
    expect(renderer._planar).toBeUndefined();
    // Native OIT retains its coverage alpha over the untouched background.
    expect(composed()).toEqualEpsilon([0.25, 0.5, 0.25, 0.75], 0.001);
    expect(scene.pickPosition(new Cartesian2(32, 32))).toBeUndefined();
    world.opacity = 0;
    render();
    expect(composed()).toEqualEpsilon([0, 1, 0, 1], 0.001);
    expect(sample(renderer._linearDepth)[0]).toBe(0);
    scene.destroyForSpecs();
    scene = undefined;
  });

  it("keeps direct-only geometry shadows and evaluates terrain weather and local lights after capture", function () {
    scene.primitives.add(
      new Primitive({
        asynchronous: false,
        shadows: ShadowMode.ENABLED,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(1, 1, 1),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(-1.5, 0, 3)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
          },
        }),
        appearance: new PerInstanceColorAppearance({ translucent: false }),
      }),
    );
    scene.light.direction = new Cartesian3(1, 0, -1);
    scene.shadowMap.maximumDistance = 30;
    scene.shadowMap.size = 1024;
    scene.shadowMap.darkness = 0;
    render();
    const lit = color(43);
    const albedo = raw(0, 43);
    scene.shadowMap.enabled = true;
    render();
    expect(raw(3, 43)[3]).toBeLessThan(0.2);
    expect(color(43)[0]).toBeLessThan(lit[0] - 0.01);
    expect(color(43)[0]).toBeGreaterThan(0.055);
    scene.highDynamicRange = true;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const sharedEffects = [
      new SceneGISScreenSpaceReflections({ scene, enabled: true }),
      new SceneGISScreenSpaceIndirectLighting({ scene, enabled: true }),
    ];
    render();
    const shared = sharedEffects[0]._state;
    expect(sample(shared.main.indirect.getColorTexture(), 43)).toEqualEpsilon(
      [0.06, 0.12, 0.18, 1],
      0.001,
    );
    expect(sharedEffects.every((effect) => effect.ready)).toBeTrue();
    const weather = new SceneGISSurfaceWeather({ scene, enabled: true });
    weather.wetness = 1;
    render();
    const wet = color(43);
    weather.snowCoverage = 1;
    render();
    expect(color(43)[0]).toBeGreaterThan(wet[0]);
    expect(raw(0, 43)).toEqual(albedo);
    weather.destroy();
    const lights = new SceneGISLightCollection({ scene, enabled: true });
    lights.add(
      new SceneGISPointLight({
        position: new Cartesian3(0, 0, 3),
        color: Color.ORANGE,
        intensity: 3,
        range: 10,
      }),
    );
    render();
    const local = color(43);
    lights.get(0).show = false;
    render();
    expect(local[0]).toBeGreaterThan(color(43)[0] + 0.01);
    expect(raw(0, 43)).toEqual(albedo);
    lights.destroy();
    sharedEffects.forEach((effect) => effect.destroy());

    world.opacity = 0.5;
    scene.highDynamicRange = false;
    scene.backgroundColor = Color.BLACK;
    render();
    const transparentShadow = sample(
      scene.postProcessStages._tonemapping._colorTexture,
      43,
    );
    scene.shadowMap.enabled = false;
    render();
    expect(
      sample(scene.postProcessStages._tonemapping._colorTexture, 43)[0],
    ).toBeGreaterThan(transparentShadow[0] + 0.01);
    const transparentWeather = new SceneGISSurfaceWeather({
      scene,
      enabled: true,
    });
    transparentWeather.wetness = 1;
    render();
    const transparentWet = composed();
    transparentWeather.snowCoverage = 1;
    render();
    expect(composed()[0]).toBeGreaterThan(transparentWet[0] + 0.01);
    transparentWeather.destroy();
    const transparentLights = new SceneGISLightCollection({
      scene,
      enabled: true,
    });
    transparentLights.add(
      new SceneGISPointLight({
        position: new Cartesian3(0, 0, 3),
        color: Color.ORANGE,
        intensity: 3,
        range: 10,
      }),
    );
    render();
    const transparentLit = composed();
    transparentLights.show = false;
    render();
    expect(transparentLit[0]).toBeGreaterThan(composed()[0] + 0.01);
    transparentLights.destroy();
  });

  it("borrows physical Sun and sky inputs for Planar lighting without changing captured material", async function () {
    scene.highDynamicRange = true;
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([0, 2, 0, 2]),
      width: 2,
      height: 2,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0,
      maximumHeight: 2,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 0,
      requestTileGeometry: () => Promise.resolve(data),
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    environment = new SceneGISPlanarEnvironment({
      world,
      showAtmosphere: false,
      showSun: false,
      showMoon: false,
      sunDirection: Cartesian3.UNIT_Z,
      moonDirection: new Cartesian3(0, 0, -1),
    });
    environment.connectedCallback({});
    environment.firstUpdate(scene, scene.frameState.time);
    effects = new SceneGISEnvironmentEffects({
      mode: "planar",
      world,
      enabled: true,
      showAtmosphere: false,
      showAerialPerspective: false,
      showHeightFog: false,
      showClouds: false,
      showBloom: false,
      showLensFlare: false,
    });
    effects.connectedCallback({});
    effects.firstUpdate(scene, scene.frameState.time);
    await pollToPromise(() => {
      effects.update(scene, scene.frameState.time);
      return effects.ready;
    });
    await pollToPromise(() => {
      render();
      return world.tilesLoaded;
    });
    expect(
      world._surface._quadtree._renderTiles[0].command.vertexArray
        .numberOfAttributes,
    ).toBe(2);
    expect(raw(2)[0]).toBe(2);
    const albedo = raw(0);
    const physical = color();
    expect(physical[0]).toBeGreaterThan(0.01);
    const before = effects.surfaceRadianceScale;
    effects.surfaceRadianceScale = before * 2;
    effects.update(scene, scene.frameState.time);
    render();
    expect(raw(0)).toEqual(albedo);
    expect(color().slice(0, 3)).toEqualEpsilon(
      physical.slice(0, 3).map((v) => v * 2),
      0.004,
    );
    expect(renderer.drawCount).toBe(1);
    expect(renderer.lightDrawCount).toBe(1);
    world.opacity = 0.5;
    scene.backgroundColor = Color.BLACK;
    render();
    expect(renderer._planar).toBeUndefined();
    expect(composed().slice(0, 3)).toEqualEpsilon(physical.slice(0, 3), 0.004);
    world.opacity = 1;
    render();
    expect(raw(0)).toEqual(albedo);
  });
});
