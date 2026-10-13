import {
  _SceneGISDeferredLighting as DeferredLighting,
  BoxGeometry,
  BufferPolygon,
  BufferPolygonCollection,
  BufferPolygonMaterial,
  BufferPolyline,
  BufferPolylineCollection,
  BufferPolylineMaterial,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  ClassificationPrimitive,
  ClassificationType,
  ClippingPlane,
  ClippingPlaneCollection,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  ColorGeometryInstanceAttribute,
  ContextLimits,
  CustomHeightmapTerrainProvider,
  DirectionalLight,
  FramebufferManager,
  GeometryInstance,
  Globe,
  GroundPrimitive,
  HeadingPitchRange,
  HeightReference,
  HeightmapTerrainData,
  Material,
  Matrix4,
  NearFarScalar,
  Pass,
  PerInstanceColorAppearance,
  PixelDatatype,
  PixelFormat,
  PolygonHierarchy,
  Primitive,
  Rectangle,
  RectangleGeometry,
  RuntimeError,
  SceneGISLightCollection,
  SceneGISEnvironmentEffects,
  SceneGISPointLight,
  SceneGISSurfaceWeather,
  SceneGISTemporalAntialiasing,
  SceneGISWaterSurface,
  SingleTileImageryProvider,
  SunLight,
  Texture,
  Transforms,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredGlobe", function () {
  let scene, renderer, lights, oceanImageRequest, environment;
  let textures = [];
  let materials = [];
  let vectorCollections = [];
  const radius = 6378137;
  function render() {
    scene.renderForSpecs();
  }
  async function ready(layerCount = 0) {
    await pollToPromise(
      () => {
        render();
        const counts = new Map();
        for (const command of scene.frameState.commandList) {
          if (command.pass === Pass.GLOBE) {
            counts.set(
              command.owner,
              (counts.get(command.owner) ?? 0) +
                command.uniformMap.u_dayTextures().length,
            );
          }
        }
        return (
          scene.globe.tilesLoaded &&
          counts.size > 0 &&
          [...counts.values()].every((count) => count >= layerCount)
        );
      },
      { timeout: 30000 },
    );
  }
  async function setup() {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.globe = new Globe();
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = true;
    scene.globe.lightingFadeOutDistance = 0;
    scene.globe.lightingFadeInDistance = 1;
    scene.globe.baseColor = new Color(0.2, 0.3, 0.4, 1);
    scene.light = new DirectionalLight({ direction: new Cartesian3(-1, 0, 0) });
    scene.camera.setView({
      destination: new Cartesian3(radius + 10000, 0, 0),
      orientation: {
        direction: new Cartesian3(-1, 0, 0),
        up: new Cartesian3(0, 0, 1),
      },
    });
    renderer = new DeferredLighting(scene);
    renderer.enabled = true;
    lights = new SceneGISLightCollection({ scene });
    await ready();
  }
  function sample(texture, x = 32, y = 32, full = false) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    const width = full ? texture.width : 1;
    const height = full ? texture.height : 1;
    target.update(scene.context, width, height);
    const command = scene.context.createViewportQuadCommand(
      `uniform sampler2D u_texture; uniform vec2 u_pixel; void main(){out_FragColor=texelFetch(u_texture,ivec2(${full ? "gl_FragCoord.xy" : "u_pixel"}),0);}`,
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          u_texture: () => texture,
          u_pixel: () => new Cartesian2(x, y),
        },
      },
    );
    try {
      command.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: target.framebuffer,
          width,
          height,
        }),
      );
    } finally {
      command.shaderProgram.destroy();
      target.destroy();
    }
  }
  function color() {
    return sample(
      scene._view.globeDepth.colorFramebufferManager.getColorTexture(),
    );
  }
  function pointLight() {
    return lights.add(
      new SceneGISPointLight({
        position: new Cartesian3(radius + 1000, 0, 0),
        color: Color.GREEN,
        intensity: 10000000,
        range: 5000,
      }),
    );
  }
  async function raisedTerrain() {
    scene.terrainProvider = new CustomHeightmapTerrainProvider({
      width: 32,
      height: 32,
      callback: () => new Float32Array(32 * 32).fill(2000),
    });
    const box = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          id: "below-terrain",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(2000, 2000, 200),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(
            new Cartesian3(radius + 500, 0, 0),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
          closed: true,
        }),
      }),
    );
    await ready();
    return box;
  }

  it("preserves ground classification through logarithmic frustum boundaries", async function () {
    await setup();
    await GroundPrimitive.initializeTerrainHeights();
    const ground = scene.groundPrimitives.add(
      new GroundPrimitive({
        asynchronous: false,
        classificationType: ClassificationType.TERRAIN,
        geometryInstances: new GeometryInstance({
          id: "cross-frustum-ground",
          geometry: new RectangleGeometry({
            rectangle: Rectangle.fromDegrees(-0.04, -0.04, 0.04, 0.04),
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(0.2, 0.7, 1, 0.35),
            ),
          },
        }),
        appearance: new PerInstanceColorAppearance({ flat: true }),
      }),
    );
    await pollToPromise(() => {
      render();
      return ground.ready;
    });
    scene.globe._surface._debug.suspendLodUpdate = true;
    scene.logarithmicDepthFarToNearRatio = 1e9;
    render();
    const reference = sample(
      renderer._classification.getColorTexture(),
      0,
      0,
      true,
    );
    scene.logarithmicDepthFarToNearRatio = 2;
    render();
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    const multiple = sample(
      renderer._classification.getColorTexture(),
      0,
      0,
      true,
    );
    let covered = 0;
    let missing = 0;
    let outside = 0;
    for (let i = 3; i < reference.length; i += 4) {
      if (reference[i] > 0.3) {
        ++covered;
        if (multiple[i] < 0.3) {
          ++missing;
        }
      } else if (multiple[i] > 0.3) {
        ++outside;
      }
    }
    expect(covered).toBeGreaterThan(500);
    expect(missing).toBe(0);
    expect(outside).toBe(0);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe("cross-frustum-ground");
    expect(scene.context._gl.getError()).toBe(0);
  });
  function image(cssColor) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 4;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 4, 4);
    return canvas;
  }
  async function imagery(count) {
    const expected = [0.2, 0.3, 0.4];
    for (let i = 0; i < count; ++i) {
      const axis = i % 3;
      const provider = await SingleTileImageryProvider.fromUrl(
        image(["#ff0000", "#00ff00", "#0000ff"][axis]).toDataURL(),
        { rectangle: Rectangle.MAX_VALUE },
      );
      scene.imageryLayers.addImageryProvider(provider).alpha = 0.1;
      expected.forEach((value, channel) => {
        expected[channel] = value * 0.9 + (channel === axis ? 0.1 : 0);
      });
    }
    return expected;
  }
  function texturedMaterial() {
    const material = new Material({
      fabric: {
        materials: {
          red: { type: "Image", uniforms: { image: image("#ff0000") } },
          blue: { type: "Image", uniforms: { image: image("#0000ff") } },
        },
        uniforms: { opacity: 0.4 },
        components: {
          diffuse: "mix(red.diffuse, blue.diffuse, 0.5)",
          alpha: "opacity",
        },
      },
    });
    materials.push(material);
    scene.globe.material = material;
    return material;
  }
  async function materialReady(material) {
    await pollToPromise(() => {
      render();
      return Object.values(material.materials).every(
        (child) => child._textures.image !== child._defaultTexture,
      );
    });
  }
  async function waterTerrain(mask = 255) {
    const base = new CustomHeightmapTerrainProvider({
      width: 32,
      height: 32,
      callback: () => new Float32Array(32 * 32),
    });
    // Exercise the supported flat-ocean state while its normal map is loading.
    oceanImageRequest ??= spyOn(
      scene.globe._oceanNormalMapResource,
      "fetchImage",
    ).and.returnValue(new Promise(() => {}));
    scene.terrainProvider = {
      tilingScheme: base.tilingScheme,
      errorEvent: base.errorEvent,
      hasVertexNormals: false,
      hasWaterMask: true,
      getLevelMaximumGeometricError: (level) =>
        base.getLevelMaximumGeometricError(level),
      getTileDataAvailable: () => undefined,
      requestTileGeometry: () =>
        Promise.resolve(
          new HeightmapTerrainData({
            buffer: new Float32Array(32 * 32),
            width: 32,
            height: 32,
            waterMask: new Uint8Array(4).fill(mask),
          }),
        ),
    };
    await ready();
  }
  async function nativeVectors() {
    const origin = Cartesian3.fromDegrees(1, 1);
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -Math.PI / 2, 10000));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    await ready();
    const draws = renderer.drawCount;
    const polygons = new BufferPolygonCollection({
      primitiveCountMax: 1,
      vertexCountMax: 4,
      triangleCountMax: 2,
      heightReference: HeightReference.CLAMP_TO_TERRAIN,
    });
    const lines = new BufferPolylineCollection({
      primitiveCountMax: 1,
      vertexCountMax: 2,
      heightReference: HeightReference.CLAMP_TO_TERRAIN,
    });
    function positions(degrees) {
      return new Float64Array(
        Cartesian3.packArray(Cartesian3.fromDegreesArray(degrees)),
      );
    }
    const polygon = polygons.add(
      {
        positions: positions([0.96, 0.96, 1.04, 0.96, 1.04, 1.04, 0.96, 1.04]),
        material: new BufferPolygonMaterial({ color: new Color(1, 0, 0, 0.5) }),
      },
      new BufferPolygon(),
    );
    const line = lines.add(
      {
        positions: positions([0.96, 1, 1.04, 1]),
        material: new BufferPolylineMaterial({
          color: new Color(0, 1, 0, 0.6),
          width: 4,
        }),
      },
      new BufferPolyline(),
    );
    vectorCollections.push(polygons, lines);
    scene.globe.vectorProvider.add(polygons);
    scene.globe.vectorProvider.add(lines);
    await pollToPromise(() => {
      render();
      return scene.frameState.commandList.some(
        (command) =>
          command.pass === Pass.GLOBE &&
          command.shaderProgram.fragmentShaderSource.defines.includes(
            "HAS_VECTOR_LAYER",
          ),
      );
    });
    return { origin, draws, polygon, line, polygons, lines };
  }
  afterEach(function () {
    environment?.disconnectedCallback(environment._element);
    environment = undefined;
    materials.forEach((material) => material.destroy());
    materials = [];
    scene?.destroyForSpecs();
    vectorCollections.forEach((collection) => collection.destroy());
    vectorCollections = [];
    textures.forEach((texture) => texture.destroy());
    textures = [];
    scene = renderer = lights = oceanImageRequest = undefined;
  });

  it("preserves raised terrain depth across native clears and replaces only visible object pixels", async function () {
    await setup();
    const box = await raisedTerrain();
    const terrain = sample(renderer._linearDepth)[0];
    expect(terrain).toEqualEpsilon(8000, 5);
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(-3);
    const bytes = renderer.byteLength;
    scene.globe.depthTestAgainstTerrain = false;
    render();
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(-1);
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(9400, 1);
    expect(sample(renderer._linearDepth, 8)[0]).toEqualEpsilon(terrain, 10);
    expect(sample(renderer._raw.getColorTexture(2), 8)[3]).toBe(-3);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe("below-terrain");
    expect(renderer.byteLength).toBe(bytes);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    const ao =
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
    expect(renderer._linearDepth).toBe(ao.depth.getColorTexture());
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(9400, 1);
    expect(sample(renderer._linearDepth, 8)[0]).toEqualEpsilon(terrain, 10);
    box.show = false;
    render();
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(terrain, 5);
    scene.camera.setView({
      orientation: { direction: Cartesian3.UNIT_X, up: Cartesian3.UNIT_Z },
    });
    render();
    expect(renderer.ready).toBe(false);
    expect(renderer._linearDepth).toBeUndefined();
  });

  it("retains terrain depth and near objects across multiple frustum clears", async function () {
    await setup();
    await raisedTerrain();
    scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          id: "near-camera",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(1, 1, 1),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(
            new Cartesian3(radius + 9990, 2, 0),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.GREEN),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
      }),
    );
    scene.logarithmicDepthFarToNearRatio = 100;
    render();
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(8000, 5);
    const corner = sample(renderer._linearDepth, 44);
    expect(corner[0]).toEqualEpsilon(9.5, 0.01);
    expect(corner[1]).toBeLessThan(sample(renderer._linearDepth)[1]);
    scene.globe.depthTestAgainstTerrain = false;
    render();
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(9400, 1);
    expect(sample(renderer._linearDepth, 8)[0]).toEqualEpsilon(8000, 10);
    expect(sample(renderer._linearDepth, 44)[0]).toEqualEpsilon(9.5, 0.01);
    expect(renderer.lightDrawCount).toBe(renderer.groupCount + 1);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    const ao =
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
    expect(renderer._linearDepth).toBe(ao.depth.getColorTexture());
    expect(ao.sourceDepth).toBe(renderer._linearDepth);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe("below-terrain");
    expect(scene.pick(new Cartesian2(44, 32)).id).toBe("near-camera");
    scene.canvas.width = 96;
    render();
    expect(renderer._linearDepth.width).toBe(96);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("uses complete deferred depth for advanced aerial perspective and cloud receivers", async function () {
    await setup();
    await raisedTerrain();
    scene.sunBloom = false;
    scene.light = new SunLight();
    scene.globe.enableLighting = false;
    environment = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
      showHeightFog: true,
      heightFogDensity: 0.0002,
      heightFogHeightFalloff: 0,
      showClouds: false,
      showCloudShadows: false,
      showCrepuscularRays: false,
      showBloom: false,
      showLensFlare: false,
    });
    environment.connectedCallback({});
    environment.firstUpdate(scene, scene.frameState.time);
    await pollToPromise(() => {
      environment.update(scene, scene.frameState.time);
      return environment.ready;
    });
    const pipeline = environment._pipeline;
    const aerial = () =>
      sample(pipeline._resources.aerialFramebuffer.getColorTexture());
    render();
    const oneSegment = aerial();
    const expectedDepth = sample(renderer._linearDepth)[0];
    scene.logarithmicDepthFarToNearRatio = 2;
    render();
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(expectedDepth, 1);
    expect(
      sample(
        scene._view.globeDepth.colorFramebufferManager.getDepthStencilTexture(),
      )[0],
    ).toBe(1);
    expect(aerial()).toEqualEpsilon(oneSegment, 0.005);
    expect(pipeline._linearSceneDepth).toBe(true);
    const unified = renderer._linearDepth;
    const aerialExecute = spyOn(
      pipeline._resources.aerialCommand,
      "execute",
    ).and.callThrough();
    const borrowed = [];
    aerialExecute.and.callFake(function (...args) {
      borrowed.push(pipeline._uniformMap.u_depthTexture());
      return aerialExecute.and.originalFn.apply(this, args);
    });
    render();
    expect(borrowed.pop()).toBe(unified);
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    render();
    expect(borrowed.pop()).toBe(taa._state.depth.getColorTexture());
    expect(aerial()).toEqualEpsilon(oneSegment, 0.005);
    const water = scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: new PolygonHierarchy([
          new Cartesian3(-1000, -1000, 0),
          new Cartesian3(1000, -1000, 0),
          new Cartesian3(1000, 1000, 0),
          new Cartesian3(-1000, 1000, 0),
        ]),
        modelMatrix: Transforms.eastNorthUpToFixedFrame(
          new Cartesian3(radius + 3000, 0, 0),
        ),
        waveAmplitude: 0,
        flowSpeed: 0,
      }),
    );
    await pollToPromise(() => {
      render();
      return taa._state.waterFramebuffer !== undefined;
    });
    expect(borrowed.pop()).toBe(taa._state.depth.getColorTexture());
    expect(sample(taa._state.depth.getColorTexture())[0]).toEqualEpsilon(
      7000,
      1,
    );
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(expectedDepth, 1);
    expect(scene.frameState._sceneGISWater.captureDraws).toBe(0);
    taa.enabled = false;
    render();
    const final = scene.frameState._sceneGISWater.finalDepth;
    let finalTexture = final.depth.getColorTexture();
    expect(borrowed.pop()).toBe(finalTexture);
    expect(finalTexture.pixelFormat).toBe(PixelFormat.RED);
    expect(final.byteLength).toBe(64 * 64 * 4);
    expect(sample(finalTexture)[0]).toEqualEpsilon(7000, 1);
    expect(sample(finalTexture, 8)[0]).toEqualEpsilon(expectedDepth, 10);
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(expectedDepth, 1);
    expect(scene.frameState._sceneGISWater.captureDraws).toBe(0);
    const multiWater = aerial();
    scene.logarithmicDepthFarToNearRatio = 1e9;
    render();
    expect(finalTexture.isDestroyed()).toBe(true);
    expect(scene.frameState._sceneGISWater.finalDepth).toBeUndefined();
    expect(aerial()).toEqualEpsilon(multiWater, 0.005);
    scene.logarithmicDepthFarToNearRatio = 2;
    render();
    finalTexture =
      scene.frameState._sceneGISWater.finalDepth.depth.getColorTexture();
    const waterView =
      scene.frameState._sceneGISWater.finalDepth.waterFramebuffer;
    scene.canvas.width = 80;
    render();
    expect(finalTexture.isDestroyed()).toBe(true);
    expect(waterView.isDestroyed()).toBe(true);
    finalTexture =
      scene.frameState._sceneGISWater.finalDepth.depth.getColorTexture();
    expect(finalTexture.width).toBe(80);
    expect(sample(finalTexture, 40)[0]).toEqualEpsilon(7000, 1);
    taa.enabled = true;
    render();
    expect(finalTexture.isDestroyed()).toBe(true);
    expect(scene.frameState._sceneGISWater.finalDepth).toBeUndefined();
    expect(borrowed.pop()).toBe(taa._state.depth.getColorTexture());
    taa.enabled = false;
    render();
    finalTexture =
      scene.frameState._sceneGISWater.finalDepth.depth.getColorTexture();
    environment.showAerialPerspective = false;
    environment.showHeightFog = false;
    environment.update(scene, scene.frameState.time);
    render();
    expect(finalTexture.isDestroyed()).toBe(true);
    expect(scene.frameState._sceneGISWater.finalDepth).toBeUndefined();
    environment.showAerialPerspective = true;
    environment.update(scene, scene.frameState.time);
    render();
    finalTexture =
      scene.frameState._sceneGISWater.finalDepth.depth.getColorTexture();
    water.show = false;
    render();
    expect(finalTexture.isDestroyed()).toBe(true);
    expect(scene.frameState._sceneGISWater.finalDepth).toBeUndefined();
    expect(renderer._linearDepth.isDestroyed()).toBe(false);
    scene.canvas.width = 64;
    render();
    environment.showClouds = true;
    environment.cloudQuality = "medium";
    environment.cloudBaseHeight = 6000;
    environment.cloudThickness = 1500;
    environment.update(scene, scene.frameState.time);
    const cloudExecute = spyOn(
      pipeline._resources.cloudCommand,
      "execute",
    ).and.callThrough();
    render();
    expect(cloudExecute).toHaveBeenCalledTimes(1);
    const cloudDistance =
      pipeline._resources.cloudResolveCommand.framebuffer.getColorTexture(1);
    expect(sample(cloudDistance)[2] * 1000000).toEqualEpsilon(
      expectedDepth,
      20,
    );
    expect(aerial().every(Number.isFinite)).toBe(true);
    expect(borrowed.pop()).toBe(renderer._linearDepth);
    environment.showClouds = false;
    environment.update(scene, scene.frameState.time);
    scene.camera.switchToOrthographicFrustum();
    scene.camera.frustum.width = 5000;
    scene.camera.frustum.far = 20000;
    scene.farToNearRatio = 2;
    render();
    const orthographic = aerial();
    scene.farToNearRatio = 1e9;
    render();
    expect(aerial()).toEqualEpsilon(orthographic, 0.005);
    const depth = renderer._linearDepth;
    environment.disconnectedCallback(environment._element);
    environment = undefined;
    expect(depth.isDestroyed()).toBe(false);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("composes water depth into TAA while preserving the opaque surface and native terrain visibility", async function () {
    await setup();
    await raisedTerrain();
    scene.globe.depthTestAgainstTerrain = false;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    const water = scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: new PolygonHierarchy(
          [
            [-1000, -1000, 0],
            [1000, -1000, 0],
            [1000, 1000, 0],
            [-1000, 1000, 0],
          ].map((p) => Cartesian3.fromArray(p)),
        ),
        modelMatrix: Transforms.eastNorthUpToFixedFrame(
          new Cartesian3(radius + 1000, 0, 0),
        ),
        waveAmplitude: 0,
        flowSpeed: 0,
      }),
    );
    await pollToPromise(() => {
      render();
      return (
        scene.frameState._sceneGISWater?.drawing === false &&
        taa._state.waterFramebuffer !== undefined
      );
    });
    const depth = () =>
      sample(
        taa._state.depth.getColorTexture(),
        scene.drawingBufferWidth / 2,
      )[0];
    expect(taa.ready).toBe(true);
    expect(depth()).toEqualEpsilon(9000, 1);
    expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(9400, 1);
    expect(sample(taa._state.depth.getColorTexture(), 8)[0]).toEqualEpsilon(
      8000,
      10,
    );
    expect(scene.frameState._sceneGISWater.captureDraws).toBe(0);
    expect(scene.frameState._sceneGISWater.borrowed).toBe(true);
    water.show = false;
    render();
    expect(depth()).toEqualEpsilon(9400, 1);
    water.show = true;
    scene.globe.depthTestAgainstTerrain = true;
    render();
    expect(depth()).toEqualEpsilon(8000, 5);
    const oldView = taa._state.waterFramebuffer;
    scene.canvas.width = 96;
    render();
    expect(oldView.isDestroyed()).toBe(true);
    expect(depth()).toEqualEpsilon(8000, 5);
    const view = taa._state.waterFramebuffer;
    expect(view.numberOfColorAttachments).toBe(2);
    const sourceDepth = view.depthStencilTexture;
    taa.enabled = false;
    expect(view.isDestroyed()).toBe(true);
    expect(sourceDepth.isDestroyed()).toBe(false);
  });

  it("reuses physical sky irradiance and cloud shadows only in screen lighting", async function () {
    await setup();
    function texture(rgba) {
      const result = new Texture({
        context: scene.context,
        width: 2,
        height: 2,
        pixelFormat: PixelFormat.RGBA,
        source: {
          arrayBufferView: new Uint8Array([...rgba, ...rgba, ...rgba, ...rgba]),
        },
      });
      textures.push(result);
      return result;
    }
    const record = {
      active: true,
      atlasTexture: texture([0, 255, 177, 0]),
      transmittanceTexture: texture([128, 160, 192, 255]),
      irradianceTexture: texture([8, 12, 16, 255]),
      matrices: Array.from({ length: 3 }, () =>
        Matrix4.fromScale(Cartesian3.ZERO),
      ),
      intervals: Array.from({ length: 3 }, () => new Cartesian2(0, 100000)),
      cascadeCount: 1,
      showCloudShadows: false,
      primaryLightDirection: Cartesian3.UNIT_X,
      sunDirection: Cartesian3.UNIT_X,
      primaryLightScale: new Cartesian3(1, 1, 1),
      surfaceRadianceScale: 1,
      cloudTop: 4000,
    };
    scene.frameState._sceneGISGlobeLighting = record;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    const program = renderer._globe.command.shaderProgram;
    const albedo = sample(renderer._raw.getColorTexture(0));
    const lit = color();
    const ao =
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
    const ambient = sample(ao.main.indirect.getColorTexture());
    expect(sample(renderer._raw.getColorTexture(2))[0]).toBe(3);
    expect(lit[0]).toBeGreaterThan(ambient[0]);
    expect(ambient[0]).toBeGreaterThan(0);
    record.showCloudShadows = true;
    render();
    expect(color()[0]).toBeLessThan(lit[0]);
    expect(sample(ao.main.indirect.getColorTexture())).toEqual(ambient);
    record.primaryLightScale = Cartesian3.ZERO;
    render();
    expect(color().slice(0, 3)).toEqualEpsilon(ambient.slice(0, 3), 0.002);
    pointLight();
    render();
    expect(color()[1]).toBeGreaterThan(ambient[1]);
    expect(sample(ao.main.indirect.getColorTexture())).toEqual(ambient);
    expect(sample(renderer._raw.getColorTexture(0))).toEqual(albedo);
    expect(renderer._globe.command.shaderProgram).toBe(program);
    lights.removeAll();
    record.surfaceRadianceScale = 2;
    render();
    expect(color().slice(0, 3)).toEqualEpsilon(
      ambient.slice(0, 3).map((v) => v * 2),
      0.002,
    );
    const weather = new SceneGISSurfaceWeather({ scene, enabled: true });
    weather.snowCoverage = 1;
    render();
    expect(color()[0]).toBeGreaterThan(ambient[0] * 2);
    expect(sample(renderer._raw.getColorTexture(0))).toEqual(albedo);
    expect(
      sample(ao.main.indirect.getColorTexture()).slice(0, 3),
    ).toEqualEpsilon(color().slice(0, 3), 0.002);
    scene.globe.showWaterEffect = false;
    scene.globe.material = Material.fromType("Color", {
      color: new Color(1, 0, 0, 0),
    });
    materials.push(scene.globe.material);
    record.primaryLightScale = new Cartesian3(1, 1, 1);
    record.showCloudShadows = false;
    await waterTerrain();
    weather.enabled = false;
    render();
    const waterRadiance = color();
    weather.enabled = true;
    weather.wetness = 1;
    render();
    expect(color()).toEqualEpsilon(waterRadiance, 0.002);
    record.active = false;
    render();
    expect(sample(renderer._raw.getColorTexture(2))[0]).toBe(34);
    expect(renderer._globe.command.shaderProgram).not.toBe(program);
    expect(textures.every((texture) => !texture.isDestroyed())).toBe(true);
  });

  ["ground atmosphere", "fog"].forEach((mode) => {
    it(`composes native ${mode} after lighting and attenuates only the surface AO response`, async function () {
      await setup();
      scene.light.direction = Cartesian3.UNIT_X;
      scene.globe.dynamicAtmosphereLighting = false;
      scene.globe.showGroundAtmosphere = true;
      scene.fog.enabled = mode === "fog";
      scene.fog.density = 0.001;
      scene.fog.heightScalar = 1;
      scene.fog.heightFalloff = 0;
      scene.fog.visualDensityScalar = 0.02;
      if (mode === "fog") {
        scene.camera.setView({
          orientation: {
            direction: Cartesian3.normalize(
              new Cartesian3(-1, 0.5, 0),
              new Cartesian3(),
            ),
            up: Cartesian3.UNIT_Z,
          },
        });
      }
      scene.postProcessStages.ambientOcclusion.enabled = true;
      await ready();
      const flags = sample(renderer._raw.getColorTexture(2))[0];
      expect(flags).toBe(mode === "fog" ? 6 : 10);
      expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
        [0.2, 0.3, 0.4, 1],
        0.001,
      );
      const lit = color();
      const ao =
        scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
      const ambient = sample(ao.main.indirect.getColorTexture());
      const bytes = renderer.byteLength;
      scene.globe.baseColor = Color.BLACK;
      render();
      const scattering = color();
      expect(scattering.slice(0, 3).some((value) => value > 0)).toBe(true);
      expect(
        lit.slice(0, 3).map((value, i) => value - scattering[i]),
      ).toEqualEpsilon(ambient.slice(0, 3), 0.001);
      expect(sample(ao.main.indirect.getColorTexture()).slice(0, 3)).toEqual([
        0, 0, 0,
      ]);
      scene.globe.atmosphereBrightnessShift = 0.2;
      render();
      expect(color()).not.toEqual(scattering);
      expect(renderer.byteLength).toBe(bytes);
      expect(renderer.lightDrawCount).toBe(1);
    });
  });

  it("submits unlit surface values and evaluates native and local light on screen", async function () {
    await setup();
    const albedo = sample(renderer._raw.getColorTexture(0));
    expect(albedo).toEqualEpsilon([0.2, 0.3, 0.4, 1], 0.001);
    expect(sample(renderer._raw.getColorTexture(2))).toEqualEpsilon(
      [2, 5, 0.3, -3],
      0.001,
    );
    const lit = color();
    scene.light.direction = new Cartesian3(1, 0, 0);
    render();
    const ambient = color();
    expect(ambient[1]).toBeLessThan(lit[1] * 0.5);
    expect(sample(renderer._raw.getColorTexture(0))).toEqual(albedo);
    pointLight();
    render();
    expect(color()[1]).toBeGreaterThan(ambient[1] + 0.02);
    expect(sample(renderer._raw.getColorTexture(0))).toEqual(albedo);
    expect(renderer.groupCount).toBe(1);
    expect(renderer.lightDrawCount).toBe(1);
    scene.globe.enableLighting = false;
    render();
    expect(color()).toEqualEpsilon(albedo, 0.001);
    expect(sample(renderer._raw.getColorTexture(2))[0]).toBe(0);
  });

  it("composites overflow imagery only into albedo while local lights stay independent", async function () {
    await setup();
    const normal = sample(renderer._raw.getColorTexture(1));
    const parameters = sample(renderer._raw.getColorTexture(2));
    const bytes = renderer.byteLength;
    const count = ContextLimits.maximumTextureImageUnits + 1;
    const expected = await imagery(count);
    pointLight();
    await ready(count);
    const commands = scene.frameState.commandList.filter(
      (c) => c.pass === Pass.GLOBE,
    );
    expect(commands.some((c) => c.renderState.blending.enabled)).toBe(true);
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [...expected, 1],
      0.002,
    );
    expect(sample(renderer._raw.getColorTexture(1))).toEqualEpsilon(
      normal,
      0.001,
    );
    expect(sample(renderer._raw.getColorTexture(2))).toEqual(parameters);
    lights.removeAll();
    scene.globe.enableLighting = false;
    const weather = new SceneGISSurfaceWeather({ scene, enabled: true });
    weather.wetness = 1;
    render();
    expect(color().slice(0, 3)).toEqualEpsilon(
      expected.map((v) => v * 0.62),
      0.002,
    );
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [...expected, 1],
      0.002,
    );
    weather.snowCoverage = 1;
    render();
    expect(color().slice(0, 3)).toEqualEpsilon(
      [weather.snowColor.red, weather.snowColor.green, weather.snowColor.blue],
      0.002,
    );
    expect(renderer._globeBlend.numberOfColorAttachments).toBe(1);
    expect(renderer.byteLength).toBe(bytes);
    expect(renderer.drawCount).toBe(commands.length);
    expect(renderer.lightDrawCount).toBe(1);
    scene.globe.enableLighting = true;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion.ready,
    ).toBe(true);
    expect(sample(renderer._raw.getColorTexture(2))).toEqual(parameters);
  });

  it("preserves plane clipping and unlit edge colors before native atmosphere without extra targets", async function () {
    await setup();
    const bytes = renderer.byteLength;
    scene.globe.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_Z, 0)],
      edgeWidth: 3,
      edgeColor: new Color(2, 0.3, 0.4),
    });
    await ready();
    expect(sample(renderer._raw.getColorTexture(2), 32, 8)[3]).toBe(0);
    expect(sample(renderer._raw.getColorTexture(2), 32, 48)[3]).toBe(-3);
    expect(color()).toEqualEpsilon([2, 0.3, 0.4, 1], 0.002);
    expect(sample(renderer._raw.getColorTexture(2))[0]).toBe(18);
    expect(renderer.byteLength).toBe(bytes);
    scene.light.direction = Cartesian3.UNIT_X;
    pointLight();
    const weather = new SceneGISSurfaceWeather({ scene, enabled: true });
    weather.snowCoverage = 1;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(color()).toEqualEpsilon([2, 0.3, 0.4, 1], 0.002);
    const ao =
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
    expect(sample(ao.main.indirect.getColorTexture()).slice(0, 3)).toEqual([
      0, 0, 0,
    ]);
    scene.globe.clippingPlanes.get(0).distance = -2000;
    render();
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(0);
    expect(scene.pickPosition(new Cartesian2(32, 32))).toBeUndefined();
    scene.globe.clippingPlanes = undefined;
    render();
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(-3);
  });

  it("discards clipped polygons before material and depth capture and preserves inverse updates", async function () {
    await setup();
    const bytes = renderer.byteLength;
    scene.globe.clippingPolygons = new ClippingPolygonCollection({
      polygons: [
        new ClippingPolygon({
          positions: Cartesian3.fromDegreesArray([
            -0.02, -0.02, 0.02, -0.02, 0.02, 0.02, -0.02, 0.02,
          ]),
        }),
      ],
    });
    await ready();
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(0);
    expect(sample(renderer._linearDepth)[0]).toBe(0);
    expect(sample(renderer._raw.getColorTexture(2), 8)[3]).toBe(-3);
    expect(scene.pickPosition(new Cartesian2(32, 32))).toBeUndefined();
    scene.globe.clippingPolygons.inverse = true;
    await ready();
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(-3);
    expect(sample(renderer._raw.getColorTexture(2), 8)[3]).toBe(0);
    expect(sample(renderer._linearDepth)[0]).toBeGreaterThan(0);
    expect(scene.pickPosition(new Cartesian2(32, 32))).toBeDefined();
    expect(renderer.byteLength).toBe(bytes);
    scene.globe.clippingPolygons = undefined;
    render();
    expect(sample(renderer._raw.getColorTexture(2), 8)[3]).toBe(-3);
  });

  it("evaluates Fabric colors before lighting and preserves live uniforms and caller ownership", async function () {
    await setup();
    const material = Material.fromType("Color", {
      color: new Color(1, 0, 0, 0.5),
    });
    materials.push(material);
    scene.globe.material = material;
    render();
    const albedo = sample(renderer._raw.getColorTexture(0));
    expect(albedo).toEqualEpsilon([0.6, 0.15, 0.2, 1], 0.002);
    const lit = color();
    renderer.enabled = false;
    render();
    expect(color()).toEqualEpsilon(lit, 0.002);
    renderer.enabled = true;
    scene.light.direction = Cartesian3.UNIT_X;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(color()[0]).toBeLessThan(lit[0] * 0.5);
    expect(sample(renderer._raw.getColorTexture(0))).toEqual(albedo);
    const ambient = color();
    pointLight();
    render();
    expect(color()[1]).toBeGreaterThan(ambient[1]);
    material.uniforms.color = new Color(0, 1, 0, 0.25);
    render();
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [0.15, 0.475, 0.3, 1],
      0.002,
    );
    material.uniforms.color.alpha = 0;
    render();
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [0.2, 0.3, 0.4, 1],
      0.002,
    );
    scene.globe.material = undefined;
    render();
    expect(material.isDestroyed()).toBe(false);
  });

  it("reserves nested Fabric samplers and composites material once after overflow imagery", async function () {
    await setup();
    const limit = ContextLimits.maximumTextureImageUnits;
    const count = limit + 1;
    const expected = await imagery(count);
    const material = texturedMaterial();
    pointLight();
    await materialReady(material);
    await ready(count);
    const commands = scene.frameState.commandList.filter(
      (c) => c.pass === Pass.GLOBE,
    );
    const largestBatch = Math.max(
      ...commands.map((c) => c.uniformMap.u_dayTextures().length),
    );
    expect(largestBatch).toBe(limit - 2);
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [...expected.map((v, i) => v * 0.6 + (i === 1 ? 0 : 0.2)), 1],
      0.002,
    );
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
    expect(renderer.drawCount).toBe(commands.length);
    expect(renderer.lightDrawCount).toBe(1);
    material.uniforms.opacity = 0;
    render();
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [...expected, 1],
      0.002,
    );
    material.uniforms.opacity = 1;
    render();
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [0.5, 0, 0.5, 1],
      0.002,
    );
    const oldTexture = material.materials.red._textures.image;
    material.materials.red.uniforms.image = image("#00ff00");
    await pollToPromise(() => {
      render();
      return material.materials.red._textures.image !== oldTexture;
    });
    expect(oldTexture.isDestroyed()).toBe(true);
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [0, 0.5, 0.5, 1],
      0.002,
    );
    const texture = material.materials.red._textures.image;
    scene.globe.material = undefined;
    render();
    expect(texture.isDestroyed()).toBe(false);
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [...expected, 1],
      0.002,
    );
    expect(
      Math.max(
        ...scene.frameState.commandList
          .filter((c) => c.pass === Pass.GLOBE)
          .map((c) => c.uniformMap.u_dayTextures().length),
      ),
    ).toBe(limit);
  });

  it("rejects insufficient Fabric sampler capacity before submitting imagery", async function () {
    await setup();
    const material = texturedMaterial();
    await materialReady(material);
    const limit = ContextLimits.maximumTextureImageUnits;
    try {
      ContextLimits._maximumTextureImageUnits = 1;
      expect(render).toThrowError(RuntimeError, /Fabric textures/);
      ContextLimits._maximumTextureImageUnits = 2;
      render();
      expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
        [0.32, 0.18, 0.44, 1],
        0.002,
      );
      await imagery(1);
      expect(render).toThrowError(RuntimeError, /Fabric textures/);
    } finally {
      ContextLimits._maximumTextureImageUnits = limit;
    }
    await ready(1);
    expect(renderer.ready).toBe(true);
  });

  it("captures ocean material without lighting and preserves native flat-water highlights", async function () {
    await setup();
    const bytes = renderer.byteLength;
    await waterTerrain();
    expect(renderer.byteLength - bytes).toBe(64 * 64 * 8);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    expect(sample(renderer._ocean.getColorTexture())[3]).toBe(1);
    const albedo = sample(renderer._raw.getColorTexture(0));
    expect(albedo).toEqualEpsilon([0.2, 0.3, 0.4, 1], 0.002);
    const lit = color();
    expect(lit[0]).toBeGreaterThan(albedo[0]);
    renderer.enabled = false;
    render();
    expect(color()).toEqualEpsilon(lit, 0.004);
    renderer.enabled = true;
    scene.light.direction = Cartesian3.UNIT_X;
    render();
    expect(sample(renderer._raw.getColorTexture(0))).toEqual(albedo);
    expect(color()[0]).toBeLessThan(lit[0]);
    scene.globe.showWaterEffect = false;
    render();
    expect(renderer._ocean).toBeUndefined();
    expect(renderer.byteLength).toBe(bytes);
  });

  it("keeps ocean before Fabric across imagery batches and releases optional targets", async function () {
    await setup();
    await waterTerrain();
    scene.globe.enableLighting = false;
    const count = ContextLimits.maximumTextureImageUnits + 1;
    const expected = await imagery(count);
    await ready(count);
    const ocean = color();
    const material = texturedMaterial();
    await materialReady(material);
    await ready(count);
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [...expected, 1],
      0.002,
    );
    expect(sample(renderer._style.getColorTexture())).toEqualEpsilon(
      [0.5, 0, 0.5, 0.4],
      0.002,
    );
    expect(color().slice(0, 3)).toEqualEpsilon(
      ocean.slice(0, 3).map((value, i) => value * 0.6 + (i === 1 ? 0 : 0.2)),
      0.006,
    );
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(6);
    expect(renderer.byteLength).toBe(64 * 64 * (48 + 4));
    expect(renderer.drawCount).toBe(
      scene.frameState.commandList.filter((c) => c.pass === Pass.GLOBE).length,
    );
    material.uniforms.opacity = 1;
    render();
    expect(color()).toEqualEpsilon([0.5, 0, 0.5, 1], 0.002);
    const oldOcean = renderer._ocean.getColorTexture();
    const borrowed = renderer._source.depthStencilTexture;
    scene.canvas.width = 96;
    render();
    expect(oldOcean.isDestroyed()).toBe(true);
    const overlay = renderer._style.getColorTexture();
    scene.globe.showWaterEffect = false;
    render();
    expect(overlay.isDestroyed()).toBe(true);
    expect(renderer._style).toBeUndefined();
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    expect(color()).toEqualEpsilon([0.5, 0, 0.5, 1], 0.002);
    expect(borrowed.isDestroyed()).toBe(true);
    const depth = renderer._source.depthStencilTexture;
    const water = renderer._ocean.getColorTexture();
    scene.globe.material = undefined;
    render();
    expect(water.isDestroyed()).toBe(true);
    expect(depth.isDestroyed()).toBe(false);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
  });

  it("preserves Fabric water masks and excludes wetness and snow in water", async function () {
    await setup();
    scene.globe.showWaterEffect = false;
    const material = Material.fromType("WaterMask");
    materials.push(material);
    scene.globe.material = material;
    await waterTerrain(128);
    const mask = sample(renderer._ocean.getColorTexture())[3];
    expect(mask).toEqualEpsilon(128 / 255, 0.001);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    const mapped = color();
    renderer.enabled = false;
    render();
    expect(color()).toEqualEpsilon(mapped, 0.003);
    renderer.enabled = true;
    scene.globe.material = Material.fromType("Color", {
      color: new Color(1, 0, 0, 0),
    });
    materials.push(scene.globe.material);
    await waterTerrain();
    const original = color();
    const weather = new SceneGISSurfaceWeather({ scene, enabled: true });
    weather.wetness = 1;
    weather.snowCoverage = 1;
    render();
    expect(color()).toEqualEpsilon(original, 0.002);
    await waterTerrain(0);
    expect(color()[0]).toBeGreaterThan(original[0]);
  });

  it("captures animated native wave normals without adding material draws", async function () {
    await setup();
    await waterTerrain();
    const flat = sample(renderer._ocean.getColorTexture());
    const canvas = image("#8080ff");
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e070ff";
    ctx.fillRect(0, 0, 2, 4);
    ctx.fillStyle = "#70e0ff";
    ctx.fillRect(0, 0, 4, 2);
    oceanImageRequest.and.callThrough();
    scene.globe.oceanNormalMapUrl = canvas.toDataURL();
    await pollToPromise(() => {
      render();
      return scene.globe._oceanNormalMap !== undefined;
    });
    const waves = sample(renderer._ocean.getColorTexture());
    expect(waves).not.toEqual(flat);
    expect(Math.hypot(...waves.slice(0, 3))).toEqualEpsilon(1, 0.002);
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [0.2, 0.3, 0.4, 1],
      0.002,
    );
    // Sample another animation time rather than require a sub-texel change each frame.
    scene.frameState.frameNumber += 120;
    render();
    expect(sample(renderer._ocean.getColorTexture())).not.toEqual(waves);
    expect(renderer.drawCount).toBe(
      scene.frameState.commandList.filter((c) => c.pass === Pass.GLOBE).length,
    );
    expect(scene.pickPosition(new Cartesian2(32, 32))).toBeDefined();
  });

  it("shares Fabric and feature storage in the seven-target ocean and classification layout", async function () {
    await setup();
    const origin = Cartesian3.fromRadians(-1.31968, 0.698874);
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -1.57, 150));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.light.direction = Cartesian3.clone(scene.camera.directionWC);
    const material = Material.fromType("Color", {
      color: new Color(1, 0, 0, 0.25),
    });
    materials.push(material);
    scene.globe.material = material;
    await waterTerrain();
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        "./Data/Cesium3DTiles/Batched/BatchedWithBatchTable/tileset.json",
        { environmentMapOptions: { enabled: false } },
      ),
    );
    await pollToPromise(() => {
      render();
      return tileset.tilesLoaded && tileset.root.content?.featuresLength > 0;
    });
    for (let i = 0; i < tileset.root.content.featuresLength; ++i) {
      tileset.root.content.getFeature(i).color = Color.YELLOW;
    }
    const volume = scene.primitives.add(
      new ClassificationPrimitive({
        geometryInstances: new GeometryInstance({
          id: "ocean-tile-classification",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(1000, 1000, 100),
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(origin),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(0, 0, 1, 0.5),
            ),
          },
        }),
        classificationType: ClassificationType.CESIUM_3D_TILE,
        asynchronous: false,
      }),
    );
    await pollToPromise(() => {
      render();
      return volume.ready && renderer.classificationDrawCount > 0;
    });
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(7);
    expect(renderer.byteLength).toBe(64 * 64 * (56 + 4));
    const identities = sample(renderer._raw.getColorTexture(2), 0, 0, true);
    const styles = sample(renderer._style.getColorTexture(), 0, 0, true);
    const ocean = sample(renderer._ocean.getColorTexture(), 0, 0, true);
    const overlay = sample(
      renderer._classification.getColorTexture(),
      0,
      0,
      true,
    );
    const globeIndex =
      identities.findIndex((v, i) => i % 4 === 3 && v === -3) - 3;
    const tileIndex =
      identities.findIndex((v, i) => i % 4 === 3 && v > 0 && overlay[i] > 0.4) -
      3;
    expect(globeIndex).toBeGreaterThanOrEqual(0);
    expect(tileIndex).toBeGreaterThanOrEqual(0);
    expect(styles.slice(globeIndex, globeIndex + 4)).toEqualEpsilon(
      [1, 0, 0, 0.25],
      0.001,
    );
    expect(styles.slice(tileIndex, tileIndex + 4)).toEqualEpsilon(
      [1, 1, 0, 1],
      0.001,
    );
    expect(ocean[globeIndex + 3]).toBe(1);
    expect(ocean.slice(tileIndex, tileIndex + 4)).toEqual([0, 0, 0, 0]);
    expect(overlay[globeIndex + 3]).toBe(0);
    const draws = renderer.drawCount;
    scene.invertClassification = true;
    scene.invertClassificationColor = new Color(0.5, 0.5, 0.5, 0.5);
    render();
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(7);
    expect(renderer._inverse.byteLength).toBe(64 * 64 * 60);
    expect(renderer.drawCount).toBe(draws);
    expect(
      sample(renderer._style.getColorTexture(), 0, 0, true).slice(
        tileIndex,
        tileIndex + 4,
      ),
    ).toEqualEpsilon([1, 1, 0, 1], 0.001);
    expect(
      sample(renderer._ocean.getColorTexture(), 0, 0, true).slice(
        tileIndex,
        tileIndex + 4,
      ),
    ).toEqual([0, 0, 0, 0]);
    expect(
      sample(renderer._style.getColorTexture(), 0, 0, true).slice(
        globeIndex,
        globeIndex + 4,
      ),
    ).toEqualEpsilon([1, 0, 0, 0.25], 0.001);
    scene.invertClassification = false;
    scene.logarithmicDepthFarToNearRatio = 2;
    render();
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(8);
    expect(renderer._linearDepth.pixelFormat).toBe(PixelFormat.RG);
    expect(renderer.byteLength).toBe(64 * 64 * 64);
    expect(renderer.lightDrawCount).toBe(renderer.groupCount);
    const limit = ContextLimits._maximumDrawBuffers;
    try {
      ContextLimits._maximumDrawBuffers = 7;
      expect(render).toThrowError(RuntimeError, /requires 8/);
      scene.logarithmicDepthFarToNearRatio = 1e9;
      ContextLimits._maximumDrawBuffers = 6;
      expect(render).toThrowError(
        RuntimeError,
        /Globe water material requires 7/,
      );
      volume.show = false;
      render();
      expect(renderer.ready).toBe(true);
      expect(renderer._framebuffer.numberOfColorAttachments).toBe(6);
    } finally {
      ContextLimits._maximumDrawBuffers = limit;
    }
  });

  it("applies native fill highlights after lighting without changing surface data or draws", async function () {
    await setup();
    scene.light.direction = Cartesian3.UNIT_X;
    const quadtree = scene.globe._surface;
    quadtree._debug.suspendLodUpdate = true;
    // Keep the selected terrain fixed and exercise its native missing-mesh fill path.
    const meshes = quadtree._tilesToRender.map((tile) => ({
      surface: tile.data,
      vertexArray: tile.data.vertexArray,
    }));
    meshes.forEach(({ surface }) => {
      surface.vertexArray = undefined;
    });
    try {
      render();
      expect(meshes.every(({ surface }) => surface.fill?.vertexArray)).toBe(
        true,
      );
      const base = color();
      const albedo = sample(renderer._raw.getColorTexture(0));
      const draws = renderer.drawCount;
      const bytes = renderer.byteLength;
      scene.globe.fillHighlightColor = new Color(1, 0, 0, 0.5);
      render();
      expect(color()).toEqualEpsilon(
        [0.5 + base[0] * 0.5, base[1] * 0.5, base[2] * 0.5, 1],
        0.002,
      );
      expect(sample(renderer._raw.getColorTexture(0))).toEqual(albedo);
      expect(sample(renderer._raw.getColorTexture(2))[0]).toBe(514);
      expect(renderer.drawCount).toBe(draws);
      expect(renderer.byteLength).toBe(bytes);
      const highlighted = color();
      renderer.enabled = false;
      render();
      expect(color()).toEqualEpsilon(highlighted, 0.002);
      renderer.enabled = true;
      scene.postProcessStages.ambientOcclusion.enabled = true;
      scene.globe.fillHighlightColor.alpha = 0;
      render();
      const ao =
        scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
      const indirect = sample(ao.main.indirect.getColorTexture());
      expect(indirect[0]).toBeGreaterThan(0);
      scene.globe.fillHighlightColor.alpha = 0.5;
      render();
      expect(
        sample(ao.main.indirect.getColorTexture()).slice(0, 3),
      ).toEqualEpsilon(
        indirect.slice(0, 3).map((value) => value * 0.5),
        0.002,
      );
      scene.globe.fillHighlightColor = new Color(0, 1, 0, 1);
      render();
      expect(color()).toEqualEpsilon([0, 1, 0, 1], 0.002);
      expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
    } finally {
      meshes.forEach(({ surface, vertexArray }) => {
        surface.vertexArray = vertexArray;
        surface.fill = surface.fill?.destroy();
      });
      quadtree._debug.suspendLodUpdate = false;
    }
  });

  it("composes distance-faded underground color only on native back-facing terrain", async function () {
    await setup();
    scene.globe.backFaceCulling = false;
    scene.globe.undergroundColor = Color.TRANSPARENT;
    scene.globe.showGroundAtmosphere = true;
    scene.camera.setView({
      destination: new Cartesian3(radius - 1000, 0, 0),
      orientation: { direction: Cartesian3.UNIT_X, up: Cartesian3.UNIT_Z },
    });
    scene.postProcessStages.ambientOcclusion.enabled = true;
    await ready();
    const base = color();
    const albedo = sample(renderer._raw.getColorTexture(0));
    const bytes = renderer.byteLength;
    const ao =
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
    const indirect = sample(ao.main.indirect.getColorTexture());
    expect(indirect[0]).toBeGreaterThan(0);
    scene.globe.undergroundColor = new Color(1, 0, 0, 0.6);
    scene.globe.undergroundColorAlphaByDistance = new NearFarScalar(
      0,
      0,
      2000,
      1,
    );
    render();
    expect(scene.frameState.cameraUnderground).toBe(true);
    expect(sample(renderer._raw.getColorTexture(2))[0]).toBe(1026);
    expect(color()).toEqualEpsilon(
      [0.3 + base[0] * 0.7, base[1] * 0.7, base[2] * 0.7, 1],
      0.01,
    );
    expect(
      sample(ao.main.indirect.getColorTexture()).slice(0, 3),
    ).toEqualEpsilon(
      indirect.slice(0, 3).map((value) => value * 0.7),
      0.003,
    );
    expect(sample(renderer._raw.getColorTexture(0))).toEqual(albedo);
    expect(renderer.byteLength).toBe(bytes);
    const underground = color();
    renderer.enabled = false;
    render();
    expect(color()).toEqualEpsilon(underground, 0.01);
    renderer.enabled = true;
    scene.globe.undergroundColorAlphaByDistance = new NearFarScalar(
      0,
      1,
      2000,
      1,
    );
    scene.globe.undergroundColor = Color.GREEN;
    render();
    expect(color()).toEqualEpsilon([0, 0.5, 0, 1], 0.002);
    expect(sample(ao.main.indirect.getColorTexture()).slice(0, 3)).toEqual([
      0, 0, 0,
    ]);
    expect(scene.pickPosition(new Cartesian2(32, 32))).toBeDefined();
    scene.globe.showGroundAtmosphere = false;
    scene.camera.setView({
      destination: new Cartesian3(radius + 10000, 0, 0),
      orientation: {
        direction: new Cartesian3(-1, 0, 0),
        up: Cartesian3.UNIT_Z,
      },
    });
    await ready();
    expect(sample(renderer._raw.getColorTexture(2))[0]).toBe(2);
    expect(sample(renderer._raw.getColorTexture(0))).toEqual(albedo);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
  });

  it("composes native vector polygons and lines after lighting with live colors and foreground replacement", async function () {
    await setup();
    const vectors = await nativeVectors();
    const overlay = sample(renderer._classification.getColorTexture());
    expect(overlay).toEqualEpsilon([0.2, 0.6, 0, 0.8], 0.004);
    expect(renderer.drawCount).toBe(vectors.draws);
    expect(renderer.lightDrawCount).toBe(1);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    renderer.enabled = false;
    render();
    const native = color();
    renderer.enabled = true;
    render();
    expect(color()).toEqualEpsilon(native, 0.004);
    const lit = color();
    Cartesian3.negate(scene.light.direction, scene.light.direction);
    render();
    expect(sample(renderer._classification.getColorTexture())).toEqualEpsilon(
      overlay,
      0.001,
    );
    expect(color()[2]).toBeLessThan(lit[2]);
    vectors.polygon.setMaterial(
      new BufferPolygonMaterial({ color: new Color(0, 0, 1, 0.5) }),
    );
    render();
    expect(sample(renderer._classification.getColorTexture())).toEqualEpsilon(
      [0, 0.6, 0.2, 0.8],
      0.004,
    );
    const volume = scene.primitives.add(
      new ClassificationPrimitive({
        asynchronous: false,
        classificationType: ClassificationType.TERRAIN,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(2000, 2000, 1000),
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(vectors.origin),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(1, 0, 0, 0.25),
            ),
          },
        }),
      }),
    );
    await pollToPromise(() => {
      render();
      return volume.ready && renderer.classificationDrawCount > 0;
    });
    expect(sample(renderer._classification.getColorTexture())).toEqualEpsilon(
      [0.25, 0.45, 0.15, 0.85],
      0.005,
    );
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    scene.primitives.remove(volume);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(renderer.ready).toBe(true);
    const position = Cartesian3.fromDegrees(1, 1, 3000);
    const box = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          id: "above-native-vector",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(2000, 2000, 200),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(position),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
          closed: true,
        }),
      }),
    );
    render();
    expect(sample(renderer._classification.getColorTexture())).toEqual([
      0, 0, 0, 0,
    ]);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe("above-native-vector");
    scene.primitives.remove(box);
    scene.globe.vectorProvider.remove(vectors.polygons);
    scene.globe.vectorProvider.remove(vectors.lines);
    const target = renderer._classification.getColorTexture();
    render();
    expect(renderer._classification).toBeUndefined();
    expect(target.isDestroyed()).toBe(true);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
  });

  it("reserves vector and Fabric samplers across imagery batches and preserves borrowed vector textures", async function () {
    await setup();
    const vectors = await nativeVectors();
    const limit = ContextLimits.maximumTextureImageUnits;
    const count = limit + 1;
    const expected = await imagery(count);
    const material = texturedMaterial();
    await materialReady(material);
    await ready(count);
    const commands = scene.frameState.commandList.filter(
      (command) => command.pass === Pass.GLOBE,
    );
    const vectorCommands = commands.filter((command) =>
      command.shaderProgram.fragmentShaderSource.defines.includes(
        "HAS_VECTOR_LAYER",
      ),
    );
    expect(
      Math.max(
        ...vectorCommands.map(
          (command) => command.uniformMap.u_dayTextures().length,
        ),
      ),
    ).toBe(limit - 10);
    expect(renderer.drawCount).toBe(commands.length);
    expect(renderer.lightDrawCount).toBe(1);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [...expected.map((v, i) => v * 0.6 + (i === 1 ? 0 : 0.2)), 1],
      0.003,
    );
    expect(sample(renderer._classification.getColorTexture())).toEqualEpsilon(
      [0.2, 0.6, 0, 0.8],
      0.004,
    );
    try {
      ContextLimits._maximumTextureImageUnits = 10;
      expect(render).toThrowError(RuntimeError, /Fabric\/vector textures/);
    } finally {
      ContextLimits._maximumTextureImageUnits = limit;
    }
    const maxDrawBuffers = ContextLimits._maximumDrawBuffers;
    try {
      ContextLimits._maximumDrawBuffers = 4;
      expect(render).toThrowError(RuntimeError, /classification requires 5/);
    } finally {
      ContextLimits._maximumDrawBuffers = maxDrawBuffers;
    }
    render();
    const texture = vectorCommands[0].uniformMap.u_vectorColorTexture();
    const oldTarget = renderer._classification.getColorTexture();
    scene.canvas.width = scene.canvas.height = 80;
    render();
    expect(oldTarget.isDestroyed()).toBe(true);
    expect(renderer._classification.getColorTexture().width).toBe(80);
    renderer.enabled = false;
    expect(texture.isDestroyed()).toBe(false);
    expect(renderer._classification).toBeUndefined();
    scene.globe.vectorProvider.remove(vectors.polygons);
    scene.globe.vectorProvider.remove(vectors.lines);
  });

  it("keeps native translucent Globe faces separate from opaque material and shared effects", async function () {
    await setup();
    const origin = Cartesian3.fromDegrees(1, 1);
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -Math.PI / 2, 10000));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.globe.translucency.enabled = true;
    for (const [front, back] of [
      [0.5, 1],
      [1, 0.5],
      [0.5, 0.25],
    ]) {
      scene.globe.translucency.frontFaceAlpha = front;
      scene.globe.translucency.backFaceAlpha = back;
      await ready();
      renderer.enabled = false;
      render();
      const native = color();
      renderer.enabled = true;
      render();
      expect(color()).toEqualEpsilon(native, 0.008);
      expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
      expect(renderer.drawCount).toBe(
        scene.frameState.commandList.filter(
          (command) =>
            command.pass === Pass.GLOBE &&
            Object.values(command.renderState.colorMask).some(Boolean),
        ).length,
      );
    }
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const taa = new SceneGISTemporalAntialiasing({ scene });
    taa.enabled = true;
    render();
    expect(taa.ready).toBe(true);
    expect(renderer.ready).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
    scene.globe.translucency.enabled = false;
    render();
    expect(renderer.drawCount).toBeGreaterThan(0);
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(-3);
    taa.enabled = false;
    scene.postProcessStages.ambientOcclusion.enabled = false;
    scene.globe.translucency.enabled = true;
    scene.globe.translucency.frontFaceAlpha = 0.5;
    scene.globe.translucency.backFaceAlpha = 0.25;
    scene.camera.setView({
      destination: new Cartesian3(radius - 1000, 0, 0),
      orientation: { direction: Cartesian3.UNIT_X, up: Cartesian3.UNIT_Z },
    });
    await ready();
    expect(scene.frameState.cameraUnderground).toBe(true);
    expect(scene._globeTranslucencyState.translucent).toBe(true);
    const underground = color();
    renderer.enabled = false;
    render();
    expect(color()).toEqualEpsilon(underground, 0.008);
  });

  it("keeps translucent Globe classification in its native depth-peel target", async function () {
    await setup();
    const origin = Cartesian3.fromDegrees(1, 1);
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -Math.PI / 2, 10000));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.globe.translucency.enabled = true;
    scene.globe.translucency.frontFaceAlpha = 0.5;
    scene.globe.translucency.backFaceAlpha = 0.25;
    const volume = scene.primitives.add(
      new ClassificationPrimitive({
        asynchronous: false,
        classificationType: ClassificationType.TERRAIN,
        geometryInstances: new GeometryInstance({
          id: "translucent-globe-classification",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(8000, 8000, 1000),
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(origin),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(1, 0, 0, 0.5),
            ),
          },
        }),
      }),
    );
    let native;
    for (const back of [1, 0.25]) {
      scene.globe.translucency.backFaceAlpha = back;
      await ready();
      expect(volume.ready).toBe(true);
      renderer.enabled = false;
      render();
      native = color();
      renderer.enabled = true;
      render();
      expect(color()).toEqualEpsilon(native, 0.01);
      expect(sample(renderer._classification.getColorTexture())).toEqual([
        0, 0, 0, 0,
      ]);
    }
    expect(renderer.drawCount).toBe(0);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe(
      "translucent-globe-classification",
    );
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(color()).toEqualEpsilon(native, 0.01);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("isolates translucent Globe classification and foreground depth across frustums", async function () {
    await setup();
    const origin = Cartesian3.fromDegrees(1, 1);
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -Math.PI / 2, 10000));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.globe.depthTestAgainstTerrain = false;
    scene.globe.translucency.enabled = true;
    scene.globe.translucency.frontFaceAlpha = 0.5;
    const volume = scene.primitives.add(
      new ClassificationPrimitive({
        asynchronous: false,
        classificationType: ClassificationType.TERRAIN,
        geometryInstances: new GeometryInstance({
          id: "multi-translucent-classification",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(8000, 8000, 1000),
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(origin),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(1, 0, 0, 0.5),
            ),
          },
        }),
      }),
    );
    const foreground = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          id: "multi-translucent-foreground",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(1, 1, 1),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(
            Cartesian3.fromDegrees(1, 1, 9990),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.GREEN),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
      }),
    );
    await ready();
    const surfaceColor = () =>
      sample(
        scene._view.globeDepth.colorFramebufferManager.getColorTexture(),
        16,
        32,
      );
    scene.logarithmicDepthFarToNearRatio = 100;
    for (const back of [1, 0.25]) {
      scene.globe.translucency.backFaceAlpha = back;
      renderer.enabled = false;
      render();
      const nativeSurface = surfaceColor();
      const nativeForeground = color();
      renderer.enabled = true;
      render();
      expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
      expect(surfaceColor()).toEqualEpsilon(nativeSurface, 0.01);
      expect(color()).toEqualEpsilon(nativeForeground, 0.01);
      expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(9.5, 0.02);
      expect(
        sample(renderer._classification.getColorTexture(), 16, 32),
      ).toEqual([0, 0, 0, 0]);
    }
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe(
      "multi-translucent-foreground",
    );
    expect(scene.pick(new Cartesian2(16, 32)).id).toBe(
      "multi-translucent-classification",
    );
    const classified = surfaceColor();
    volume.show = false;
    render();
    const unclassified = surfaceColor();
    expect(unclassified[0]).toBeLessThan(classified[0]);
    volume.show = true;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    render();
    expect(taa.ready).toBe(true);
    const depth = renderer._linearDepth;
    const peel =
      scene._view.globeTranslucencyFramebuffer.classificationFramebuffer;
    scene.canvas.width = scene.canvas.height = 80;
    render();
    expect(depth.isDestroyed()).toBe(true);
    expect(renderer._linearDepth.width).toBe(80);
    expect(peel.isDestroyed()).toBe(true);
    foreground.show = false;
    scene.logarithmicDepthFarToNearRatio = 1e9;
    render();
    expect(renderer._multiFrustum).toBe(false);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("reserves lighting samplers for transparent Globe imagery batches", async function () {
    await setup();
    scene.globe.translucency.enabled = true;
    scene.globe.translucency.frontFaceAlpha = 0.5;
    pointLight();
    const limit = ContextLimits.maximumTextureImageUnits;
    const count = limit + 1;
    await imagery(count);
    await ready(count);
    const batchSize = () =>
      Math.max(
        ...scene.frameState.commandList
          .filter((command) => command.pass === Pass.GLOBE)
          .map((command) => command.uniformMap.u_dayTextures().length),
      );
    expect(batchSize()).toBe(limit - 2);
    expect(renderer.ready).toBe(true);
    lights.removeAll();
    render();
    expect(batchSize()).toBe(limit - 1);
    const record = {
      active: true,
      atlasTexture: scene.context.defaultTexture,
      transmittanceTexture: scene.context.defaultTexture,
      irradianceTexture: scene.context.defaultTexture,
      matrices: Array.from({ length: 3 }, () =>
        Matrix4.fromScale(Cartesian3.ZERO),
      ),
      intervals: Array.from({ length: 3 }, () => new Cartesian2(0, 100000)),
      cascadeCount: 1,
      showCloudShadows: false,
      primaryLightDirection: Cartesian3.UNIT_X,
      sunDirection: Cartesian3.UNIT_X,
      primaryLightScale: new Cartesian3(1, 1, 1),
      surfaceRadianceScale: 1,
      cloudTop: 4000,
    };
    scene.frameState._sceneGISGlobeLighting = record;
    render();
    expect(batchSize()).toBe(limit - 4);
    pointLight();
    render();
    expect(batchSize()).toBe(limit - 5);
    record.active = false;
    render();
    expect(batchSize()).toBe(limit - 2);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("releases Globe material views while preserving borrowed native depth", async function () {
    await setup();
    const blend = renderer._globeBlend;
    const depth = renderer._source.depthStencilTexture;
    const albedo = renderer._raw.getColorTexture(0);
    renderer.enabled = false;
    expect(blend.isDestroyed()).toBe(true);
    expect(albedo.isDestroyed()).toBe(true);
    expect(depth.isDestroyed()).toBe(false);
    expect(renderer._globe).not.toBeDefined();
    renderer.enabled = true;
    render();
    expect(renderer._globe).toBeDefined();
    scene.globe.show = false;
    render();
    expect(renderer._globe).not.toBeDefined();
  });
});
