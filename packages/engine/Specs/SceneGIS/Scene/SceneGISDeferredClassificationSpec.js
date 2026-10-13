import {
  _SceneGISDeferredLighting as DeferredLighting,
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  ClassificationPrimitive,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  ContextLimits,
  DataSourceCollection,
  DataSourceDisplay,
  DirectionalLight,
  FramebufferManager,
  GeometryInstance,
  Globe,
  GroundPrimitive,
  HeadingPitchRange,
  ImageBasedLighting,
  JulianDate,
  Matrix4,
  Pass,
  PerInstanceColorAppearance,
  PixelDatatype,
  Primitive,
  Rectangle,
  RectangleGeometry,
  SceneGISScreenSpaceIndirectLighting,
  SceneGISScreenSpaceReflections,
  SceneGISTemporalAntialiasing,
  ShowGeometryInstanceAttribute,
  Transforms,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredClassification", function () {
  let scene, renderer, display, sources, ibl;
  const time = JulianDate.fromIso8601("2026-09-23T12:00:00Z");
  function render() {
    display?.update(time);
    scene.renderForSpecs(time);
  }
  async function ready(predicate) {
    await pollToPromise(
      () => {
        render();
        return predicate();
      },
      { timeout: 30000 },
    );
  }
  async function setup(options = {}) {
    await GroundPrimitive.initializeTerrainHeights();
    scene = createScene({
      canvas: createCanvas(64, 64),
      scene3DOnly: true,
      ...options,
    });
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.globe = new Globe();
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = true;
    scene.globe.lightingFadeOutDistance = 0;
    scene.globe.lightingFadeInDistance = 1;
    scene.globe.baseColor = new Color(0.2, 0.3, 0.4);
    scene.light = new DirectionalLight({ direction: new Cartesian3(-1, 0, 0) });
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(1, 1, 10000),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    renderer = new DeferredLighting(scene);
    await ready(
      () =>
        scene.globe.tilesLoaded &&
        scene.frameState.commandList.some((c) => c.pass === Pass.GLOBE),
    );
  }
  beforeEach(function () {
    return setup();
  });
  afterEach(function () {
    display?.destroy();
    sources?.destroy();
    ibl?.destroy();
    scene?.destroyForSpecs();
    scene = renderer = display = sources = ibl = undefined;
  });
  function read(texture, full = false) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    const width = full ? texture.width : 1;
    const height = full ? texture.height : 1;
    target.update(scene.context, width, height);
    const command = scene.context.createViewportQuadCommand(
      `uniform sampler2D u_texture; void main(){ out_FragColor=texelFetch(u_texture, ${full ? "ivec2(gl_FragCoord.xy)" : "ivec2(32,32)"}, 0); }`,
      {
        framebuffer: target.framebuffer,
        uniformMap: { u_texture: () => texture },
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
  function color(full = false) {
    const manager = scene._environmentState.useGlobeDepthFramebuffer
      ? scene._view.globeDepth.colorFramebufferManager
      : scene._view.sceneFramebuffer._colorFramebuffer;
    return read(manager.getColorTexture(), full);
  }
  async function ground(color, id) {
    const primitive = scene.groundPrimitives.add(
      new GroundPrimitive({
        geometryInstances: new GeometryInstance({
          id,
          geometry: new RectangleGeometry({
            rectangle: Rectangle.fromDegrees(0.96, 0.96, 1.04, 1.04),
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(color),
          },
        }),
        appearance: new PerInstanceColorAppearance({ flat: true }),
        classificationType: ClassificationType.TERRAIN,
        asynchronous: false,
      }),
    );
    await ready(() => primitive.ready);
    return primitive;
  }

  it("preserves native premultiplied classification order and picking without changing albedo", async function () {
    await ground(new Color(0, 1, 0, 0.5), "green");
    await ground(new Color(1, 0, 0, 0.25), "red");
    render();
    const before = color();
    renderer.enabled = true;
    render();
    expect(color()).toEqualEpsilon(before, 0.002);
    expect(read(renderer._raw.getColorTexture(0))).toEqualEpsilon(
      [0.2, 0.3, 0.4, 1],
      0.001,
    );
    expect(read(renderer._classification.getColorTexture())).toEqualEpsilon(
      [0.25, 0.375, 0, 0.625],
      0.005,
    );
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    expect(renderer.classificationDrawCount).toBe(4);
    expect(renderer.drawCount).toBe(
      scene.frameState.commandList.filter((c) => c.pass === Pass.GLOBE).length,
    );
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe("red");
    const nativeDepth = renderer._classificationView.depthStencilTexture;
    const overlay = renderer._classification.getColorTexture();
    scene.groundPrimitives.removeAll();
    render();
    expect(renderer._classification).toBeUndefined();
    expect(overlay.isDestroyed()).toBe(true);
    expect(nativeDepth.isDestroyed()).toBe(false);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
  });

  it("keeps a real ground Entity overlay behind subsequently drawn opaque geometry", async function () {
    sources = new DataSourceCollection();
    display = new DataSourceDisplay({ scene, dataSourceCollection: sources });
    const entity = display.defaultDataSource.entities.add({
      rectangle: {
        coordinates: Rectangle.fromDegrees(0.96, 0.96, 1.04, 1.04),
        material: new Color(0, 1, 0, 0.5),
        classificationType: ClassificationType.TERRAIN,
      },
    });
    renderer.enabled = true;
    await ready(() => renderer.classificationDrawCount > 0);
    expect(read(renderer._classification.getColorTexture())[3]).toBeGreaterThan(
      0.4,
    );
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe(entity);
    const box = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          id: "above-ground",
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(2000, 2000, 200),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(
            Cartesian3.fromDegrees(1, 1, 500),
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
    render();
    expect(read(renderer._classification.getColorTexture())).toEqual([
      0, 0, 0, 0,
    ]);
    expect(color()).toEqualEpsilon([1, 0, 0, 1], 0.001);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe("above-ground");
    box.show = false;
    render();
    expect(read(renderer._classification.getColorTexture())[3]).toBeGreaterThan(
      0.4,
    );
    entity.rectangle.material = Color.BLUE;
    await ready(() => color()[2] > 0.99 && color()[1] < 0.01);
    expect(read(renderer._classification.getColorTexture())).toEqualEpsilon(
      [0, 0, 1, 1],
      0.001,
    );
  });

  async function tiles(dimensions = new Cartesian3(1000, 1000, 100)) {
    scene.globe.show = false;
    const origin = Cartesian3.fromRadians(-1.31968, 0.698874);
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -1.57, 100));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.light.direction = Cartesian3.clone(scene.camera.directionWC);
    ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(0.5, 0.5),
      specularEnvironmentMaps:
        "./Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2",
    });
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        "./Data/Cesium3DTiles/Batched/BatchedWithBatchTable/tileset.json",
        { imageBasedLighting: ibl, environmentMapOptions: { enabled: false } },
      ),
    );
    await ready(
      () =>
        tileset.tilesLoaded &&
        tileset.root.content?.featuresLength > 0 &&
        ibl.specularEnvironmentCubeMap?.ready,
    );
    const volume = scene.primitives.add(
      new ClassificationPrimitive({
        geometryInstances: new GeometryInstance({
          id: "tile-classification",
          geometry: BoxGeometry.fromDimensions({
            dimensions,
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(origin),
          attributes: {
            show: new ShowGeometryInstanceAttribute(true),
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(0, 0, 1, 0.5),
            ),
          },
        }),
        classificationType: ClassificationType.CESIUM_3D_TILE,
        asynchronous: false,
      }),
    );
    await ready(() => volume.ready);
    return { tileset, volume };
  }

  it("combines the sixth target with feature styling and shared AO, SSR and SSIL responses", async function () {
    const { tileset, volume } = await tiles();
    tileset.root.content.getFeature(0).color = Color.YELLOW;
    render();
    const native = color(true);
    renderer.enabled = true;
    render();
    expect(color(true)).toEqualEpsilon(native, 0.008);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(6);
    const indices = read(renderer._raw.getColorTexture(2), true);
    const overlays = read(renderer._classification.getColorTexture(), true);
    const index =
      overlays.findIndex(
        (value, i) => i % 4 === 3 && value > 0.4 && indices[i] > 0,
      ) - 3;
    expect(index).toBeGreaterThanOrEqual(0);
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    const ssil = new SceneGISScreenSpaceIndirectLighting({
      scene,
      enabled: true,
    });
    scene.postProcessStages.ambientOcclusion.enabled = true;
    volume.show = false;
    render();
    const outputs = () =>
      [
        ssr._state.main.indirect.getColorTexture(),
        ssr._state.main.weights.getColorTexture(),
        ssr._state.main.ssil.getColorTexture(0),
        ssr._state.main.ssil.getColorTexture(1),
      ].map((texture) => read(texture, true).slice(index, index + 3));
    const unclassified = outputs();
    expect(ssil.ready).toBe(true);
    unclassified.forEach((value, i) =>
      expect(Math.max(...value))
        .withContext(`response ${i}`)
        .toBeGreaterThan(0),
    );
    volume.show = true;
    render();
    const classified = outputs();
    const alpha = read(renderer._classification.getColorTexture(), true)[
      index + 3
    ];
    classified.forEach((value, i) =>
      expect(value).toEqualEpsilon(
        unclassified[i].map((v) => v * (1 - alpha)),
        0.002,
      ),
    );
    const old = renderer._classification.getColorTexture();
    scene.canvas.width = 96;
    render();
    expect(old.isDestroyed()).toBe(true);
    expect(renderer._classification.getColorTexture().width).toBe(96);
    const depth = renderer._classificationView.depthStencilTexture;
    const last = renderer._classification.getColorTexture();
    renderer.destroy();
    expect(last.isDestroyed()).toBe(true);
    expect(depth.isDestroyed()).toBe(false);
  });

  it("preserves opaque inverse classification, ignore-show membership and feature colors", async function () {
    const { tileset, volume } = await tiles(new Cartesian3(15, 1000, 100));
    scene.light.intensity = 0.2;
    ibl.imageBasedLightingFactor = new Cartesian2(0.1, 0.1);
    tileset.root.content.getFeature(0).color = new Color(1, 0.5, 0.5);
    scene.invertClassification = true;
    scene.invertClassificationColor = new Color(0.5, 0.25, 0.75, 1);
    render();
    const native = color(true);
    renderer.enabled = true;
    render();
    expect(color(true)).toEqualEpsilon(native, 0.01);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(6);
    const identities = read(renderer._raw.getColorTexture(2), true);
    const overlay = read(renderer._classification.getColorTexture(), true);
    const inside =
      overlay.findIndex((v, i) => i % 4 === 3 && v > 0.4 && identities[i] > 0) -
      3;
    const outside =
      overlay.findIndex((v, i) => i % 4 === 3 && v < 0 && identities[i] > 0) -
      3;
    expect(inside).toBeGreaterThanOrEqual(0);
    expect(outside).toBeGreaterThanOrEqual(0);
    expect(overlay.slice(outside, outside + 4)).toEqual([0.5, 0.25, 0.75, -1]);
    const materials = read(renderer._raw.getColorTexture(0), true);
    const draws = renderer.drawCount;
    const classified = color(true).slice(inside, inside + 3);
    scene.invertClassificationColor = Color.WHITE;
    render();
    expect(color(true).slice(inside, inside + 3)).toEqual(classified);
    const white = color(true).slice(outside, outside + 3);
    scene.invertClassificationColor = new Color(0.5, 0.25, 0.75, 1);
    render();
    expect(color(true).slice(outside, outside + 3)).toEqualEpsilon(
      white.map((v, i) => v * [0.5, 0.25, 0.75][i]),
      0.002,
    );
    expect(read(renderer._raw.getColorTexture(0), true)).toEqual(materials);
    expect(renderer.drawCount).toBe(draws);
    const attributes = volume.getGeometryInstanceAttributes(
      "tile-classification",
    );
    attributes.show = ShowGeometryInstanceAttribute.toValue(false);
    render();
    expect(
      read(renderer._classification.getColorTexture(), true).slice(
        inside,
        inside + 4,
      ),
    ).toEqual([0, 0, 0, 0]);
    expect(
      read(renderer._classification.getColorTexture(), true).slice(
        outside,
        outside + 4,
      ),
    ).toEqual([0.5, 0.25, 0.75, -1]);
    const pixel = new Cartesian2(
      (inside / 4) % 64,
      63 - Math.floor(inside / 256),
    );
    expect(scene.pick(pixel)).toBeDefined();
    expect(scene.pickPosition(pixel)).toBeDefined();
    renderer.enabled = false;
    render();
    const hiddenNative = color(true);
    renderer.enabled = true;
    render();
    expect(color(true)).toEqualEpsilon(hiddenNative, 0.01);
  });

  it("preserves translucent inverse backgrounds and classified surfaces with one Tiles material submission", async function () {
    const { tileset, volume } = await tiles(new Cartesian3(15, 1000, 100));
    scene.light.intensity = 0.2;
    ibl.imageBasedLightingFactor = new Cartesian2(0.1, 0.1);
    tileset.root.content.getFeature(0).color = new Color(1, 0.5, 0.5);
    scene.backgroundColor = new Color(0.1, 0.2, 0.3);
    scene.invertClassification = true;
    scene.invertClassificationColor = new Color(0.5, 0.25, 0.75, 0.5);
    render();
    const native = color(true);
    renderer.enabled = true;
    render();
    expect(color(true)).toEqualEpsilon(native, 0.01);
    const inverse = renderer._inverse;
    expect(scene._environmentState.useOIT).toBe(true);
    expect(inverse.unclassifiedCommand.derivedCommands.oit).toBeDefined();
    expect(inverse.byteLength).toBe(64 * 64 * 60);
    const ids = read(inverse._raw.getColorTexture(2), true);
    const main = read(renderer._raw.getColorTexture(2), true);
    const mask = read(inverse._mask.getColorTexture(), true);
    const inside =
      ids.findIndex((v, i) => i % 4 === 3 && v > 0 && mask[i - 3] > 0) - 3;
    const outside =
      ids.findIndex((v, i) => i % 4 === 3 && v > 0 && mask[i - 3] === 0) - 3;
    expect(inside).toBeGreaterThanOrEqual(0);
    expect(outside).toBeGreaterThanOrEqual(0);
    expect(main[inside + 3]).toBe(ids[inside + 3]);
    expect(main[outside + 3]).toBe(0);
    const draws = renderer.drawCount;
    const attributes = volume.getGeometryInstanceAttributes(
      "tile-classification",
    );
    attributes.show = ShowGeometryInstanceAttribute.toValue(false);
    render();
    expect(
      read(renderer._raw.getColorTexture(2), true)[inside + 3],
    ).toBeGreaterThan(0);
    expect(renderer.drawCount).toBe(draws);
    const pixel = new Cartesian2(
      (outside / 4) % 64,
      63 - Math.floor(outside / 256),
    );
    expect(scene.pick(pixel)).toBeDefined();
    const deferredPosition = scene.pickPosition(pixel);
    expect(deferredPosition).toBeDefined();
    renderer.enabled = false;
    render();
    const hidden = color(true);
    expect(
      Cartesian3.distance(deferredPosition, scene.pickPosition(pixel)),
    ).toBeLessThan(0.01);
    renderer.enabled = true;
    render();
    expect(color(true)).toEqualEpsilon(hidden, 0.01);
    scene.invertClassificationColor.alpha = 1;
    const texture = renderer._inverse._raw.getColorTexture();
    const mainDepth = renderer._source.depthStencilTexture;
    render();
    expect(renderer._inverse).toBeUndefined();
    expect(texture.isDestroyed()).toBe(true);
    expect(mainDepth.isDestroyed()).toBe(false);
    expect(renderer.drawCount).toBe(draws);
  });

  it("keeps the opaque background, screen effects and foreground depth for sorted inverse transparency", async function () {
    scene.destroyForSpecs();
    await setup({ orderIndependentTranslucency: false });
    scene.logarithmicDepthBuffer = false;
    scene.camera.frustum.near = 10;
    await tiles(new Cartesian3(15, 1000, 100));
    scene.light.intensity = 0.2;
    ibl.imageBasedLightingFactor = new Cartesian2(0.1, 0.1);
    const box = (height, color) =>
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(200, 200, 1),
              vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
            }),
            modelMatrix: Transforms.eastNorthUpToFixedFrame(
              Cartesian3.fromRadians(-1.31968, 0.698874, height),
            ),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(color),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: color.alpha < 1,
            closed: true,
          }),
        }),
      );
    box(-20, Color.BLUE);
    scene.invertClassification = true;
    scene.invertClassificationColor = new Color(0.5, 0.25, 0.75, 0.5);
    render();
    const native = color(true);
    renderer.enabled = true;
    render();
    expect(scene._environmentState.useOIT).toBe(false);
    expect(color(true)).toEqualEpsilon(native, 0.01);
    const inverse = renderer._inverse;
    const ids = read(inverse._raw.getColorTexture(2), true);
    const mask = read(inverse._mask.getColorTexture(), true);
    const main = read(renderer._raw.getColorTexture(2), true);
    const outside =
      ids.findIndex(
        (v, i) => i % 4 === 3 && v > 0 && mask[i - 3] === 0 && main[i] === -1,
      ) - 3;
    expect(outside).toBeGreaterThanOrEqual(0);
    const background = read(renderer._raw.getColorTexture(0), true).slice(
      outside,
      outside + 3,
    );
    expect(background).toEqualEpsilon([0, 0, 1], 0.002);
    const lit = read(inverse._color.getColorTexture(), true).slice(
      outside,
      outside + 3,
    );
    expect(color(true).slice(outside, outside + 3)).toEqualEpsilon(
      lit.map((v, i) => v * [0.5, 0.25, 0.75][i] * 0.5 + background[i] * 0.5),
      0.002,
    );
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    const ssil = new SceneGISScreenSpaceIndirectLighting({
      scene,
      enabled: true,
    });
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(ssr.ready && ssil.ready && taa.ready).toBe(true);
    expect(renderer._linearDepth).toBe(ssr._state.depth.getColorTexture());
    expect(renderer.drawCount).toBe(
      scene.frameState.commandList.filter(
        (c) => c.pass === Pass.CESIUM_3D_TILE || c.pass === Pass.OPAQUE,
      ).length,
    );
    box(50, Color.LIME);
    render();
    expect(color().slice(0, 3)).toEqualEpsilon([0, 1, 0], 0.002);
    ssr.enabled = ssil.enabled = taa.enabled = false;
    scene.postProcessStages.ambientOcclusion.enabled = false;
    box(75, new Color(1, 0, 0, 0.25));
    render();
    const deferred = color(true);
    renderer.enabled = false;
    render();
    expect(color(true)).toEqualEpsilon(deferred, 0.01);
    renderer.enabled = true;
    render();
    const beforeResize = renderer._inverse._raw.getColorTexture();
    scene.canvas.width = 96;
    render();
    expect(beforeResize.isDestroyed()).toBe(true);
    expect(renderer._inverse.byteLength).toBe(96 * 64 * 60);
    const owned = [
      renderer._inverse._raw.getColorTexture(),
      renderer._inverse._raw.getDepthStencilTexture(),
      renderer._inverse._mask.getColorTexture(),
      renderer._inverse._depth.getColorTexture(),
      renderer._inverse._color.getColorTexture(),
      renderer._inverse._style.getColorTexture(),
    ];
    const borrowed = renderer._source.depthStencilTexture;
    const globeDepth = scene._view.globeDepth;
    expect(globeDepth._updateDepthFramebuffer.getDepthStencilTexture()).toBe(
      owned[1],
    );
    scene.invertClassification = false;
    render();
    expect(renderer._inverse).toBeUndefined();
    owned.forEach((texture) => expect(texture.isDestroyed()).toBe(true));
    expect(borrowed.isDestroyed()).toBe(false);
    scene.invertClassification = true;
    render();
    const removedDepth = renderer._inverse._raw.getDepthStencilTexture();
    const depthView = globeDepth._updateDepthFramebuffer.framebuffer;
    scene.primitives.removeAll();
    render();
    expect(renderer._inverse).toBeUndefined();
    expect(removedDepth.isDestroyed()).toBe(true);
    expect(depthView.isDestroyed()).toBe(true);
    expect(globeDepth._tempCopyDepthTexture).toBeUndefined();
    expect(globeDepth._updateDepthFramebuffer.framebuffer).toBeUndefined();
    expect(
      globeDepth._updateDepthFramebuffer.getDepthStencilTexture(),
    ).toBeUndefined();
  });

  [
    [true, true],
    [false, false],
  ].forEach(([logDepth, oit]) => {
    it(`retains distinct inverse layers across frustums with log depth ${logDepth} and OIT ${oit}`, async function () {
      if (!oit) {
        scene.destroyForSpecs();
        await setup({ orderIndependentTranslucency: false });
      }
      const { tileset, volume } = await tiles(new Cartesian3(15, 1000, 100));
      const origin = Cartesian3.fromRadians(-1.31968, 0.698874);
      const frame = Transforms.eastNorthUpToFixedFrame(origin);
      const far = scene.primitives.add(
        await Cesium3DTileset.fromUrl(
          "./Data/Cesium3DTiles/Batched/BatchedWithBatchTable/tileset.json",
          {
            imageBasedLighting: ibl,
            environmentMapOptions: { enabled: false },
          },
        ),
      );
      far.modelMatrix = Matrix4.multiply(
        Matrix4.multiply(
          frame,
          Matrix4.fromTranslation(new Cartesian3(0, 0, -900)),
          new Matrix4(),
        ),
        Matrix4.multiply(
          Matrix4.fromUniformScale(10),
          Matrix4.inverseTransformation(frame, new Matrix4()),
          new Matrix4(),
        ),
        new Matrix4(),
      );
      scene.light.intensity = 0.2;
      ibl.imageBasedLightingFactor = new Cartesian2(0.1, 0.1);
      scene.backgroundColor = new Color(0.1, 0.2, 0.3);
      scene.logarithmicDepthBuffer = logDepth;
      scene.camera.frustum.near = 1;
      scene.logarithmicDepthFarToNearRatio = scene.farToNearRatio = 4;
      scene.invertClassification = true;
      scene.invertClassificationColor = new Color(0.5, 0.25, 0.75, 0.5);
      await ready(
        () => far.tilesLoaded && far.root.content?.featuresLength > 0,
      );
      const native = color(true);
      renderer.enabled = true;
      render();
      expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
      expect(scene._environmentState.useOIT).toBe(oit);
      expect(color(true)).toEqualEpsilon(native, 0.01);
      const inverse = renderer._inverse;
      const layers = inverse._rangeLayers.filter(Boolean);
      expect(layers.length).toBeGreaterThan(1);
      expect(inverse.byteLength).toBe(
        64 * 64 * (60 + (layers.length - 1) * 12),
      );
      const layerColors = layers.map((layer) =>
        read(layer.color.getColorTexture(), true),
      );
      const layerDepths = layers.map((layer) =>
        read(layer.depth.getColorTexture(), true),
      );
      const overlap =
        layerColors[0].findIndex((value, i) => {
          if (i % 4 !== 3) {
            return false;
          }
          const depths = layerDepths
            .filter((values, layer) => layerColors[layer][i] > 0)
            .map((values) => values[i - 3]);
          return (
            depths.length > 1 && Math.max(...depths) - Math.min(...depths) > 100
          );
        }) - 3;
      expect(overlap).toBeGreaterThanOrEqual(0);
      expect(renderer.drawCount).toBe(
        scene._view.frustumCommandsList.reduce(
          (sum, range) => sum + range.indices[Pass.CESIUM_3D_TILE],
          0,
        ),
      );
      const surface = read(renderer._linearDepth, true);
      const classified = read(renderer._raw.getColorTexture(2), true);
      let classifiedCount = 0;
      classified.forEach((value, i) => {
        if (i % 4 === 3 && value > 0) {
          ++classifiedCount;
          const offset = i - 3;
          const range = surface[offset + 1] - 1;
          expect(range).toBeGreaterThanOrEqual(0);
          const layerIndex = layers.indexOf(inverse._rangeLayers[range]);
          expect(layerIndex).toBeGreaterThanOrEqual(0);
          expect(surface[offset]).toEqualEpsilon(
            layerDepths[layerIndex]?.[offset],
            0.03,
          );
        }
      });
      expect(classifiedCount).toBeGreaterThan(0);
      const pixel = new Cartesian2(
        (overlap / 4) % 64,
        63 - Math.floor(overlap / 256),
      );
      expect(scene.pick(pixel)).toBeDefined();
      const position = scene.pickPosition(pixel);
      renderer.enabled = false;
      render();
      const referencePosition = scene.pickPosition(pixel);
      expect(!!position).toBe(!!referencePosition);
      if (position && referencePosition) {
        expect(Cartesian3.distance(position, referencePosition)).toBeLessThan(
          0.03,
        );
      }
      renderer.enabled = true;
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          geometryInstances: new GeometryInstance({
            id: "inverse-layer-foreground",
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(10, 10, 1),
              vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
            }),
            modelMatrix: Transforms.eastNorthUpToFixedFrame(
              Cartesian3.fromRadians(-1.31968, 0.698874, 80),
            ),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.LIME),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: false,
          }),
        }),
      );
      render();
      expect(color().slice(0, 3)).toEqualEpsilon([0, 1, 0], 0.003);
      expect(scene.pick(new Cartesian2(32, 32)).id).toBe(
        "inverse-layer-foreground",
      );
      const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
      const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
      scene.postProcessStages.ambientOcclusion.enabled = true;
      render();
      expect(ssr.ready && taa.ready).toBe(true);
      const oldLayers = renderer._inverse._layers.map((layer) =>
        layer.color.getColorTexture(),
      );
      scene.canvas.width = 96;
      render();
      oldLayers.forEach((texture) => expect(texture.isDestroyed()).toBe(true));
      const removedLayers = renderer._inverse._layers
        .slice(1)
        .map((layer) => layer.color.getColorTexture());
      far.show = false;
      scene.logarithmicDepthFarToNearRatio = scene.farToNearRatio = 1e9;
      render();
      expect(renderer._inverse._layers.length).toBe(1);
      removedLayers.forEach((texture) =>
        expect(texture.isDestroyed()).toBe(true),
      );
      tileset.show = false;
      volume.show = false;
      const cacheDepth = renderer._inverse._raw.getDepthStencilTexture();
      render();
      expect(renderer._inverse).toBeUndefined();
      expect(cacheDepth.isDestroyed()).toBe(true);
      expect(scene.context._gl.getError()).toBe(0);
    });
  });

  it("scales shared responses for inverse color and releases the optional target without native color copies", async function () {
    const { volume } = await tiles();
    scene.primitives.remove(volume);
    renderer.enabled = true;
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    const ssil = new SceneGISScreenSpaceIndirectLighting({
      scene,
      enabled: true,
    });
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    const identities = read(renderer._raw.getColorTexture(2), true);
    const index = identities.findIndex((v, i) => i % 4 === 3 && v > 0) - 3;
    expect(index).toBeGreaterThanOrEqual(0);
    const outputs = () =>
      [
        ssr._state.main.indirect.getColorTexture(),
        ssr._state.main.weights.getColorTexture(),
        ssr._state.main.ssil.getColorTexture(0),
        ssr._state.main.ssil.getColorTexture(1),
      ].map((texture) => read(texture, true).slice(index, index + 3));
    const before = outputs();
    before.forEach((v) => expect(Math.max(...v)).toBeGreaterThan(0));
    const drawCount = renderer.drawCount;
    scene.invertClassification = true;
    scene.invertClassificationColor = new Color(0.5, 0.25, 0.75, 1);
    render();
    expect(ssil.ready).toBe(true);
    outputs().forEach((v, i) =>
      expect(v).toEqualEpsilon(
        before[i].map((x, j) => x * [0.5, 0.25, 0.75][j]),
        0.002,
      ),
    );
    expect(renderer.drawCount).toBe(drawCount);
    expect(renderer.classificationDrawCount).toBe(1);
    expect(scene._invertClassification._fbo.getColorTexture()).toBeUndefined();
    const cover = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(500, 500, 10),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix: Transforms.eastNorthUpToFixedFrame(
            Cartesian3.fromRadians(-1.31968, 0.698874, 70),
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
    render();
    expect(read(renderer._classification.getColorTexture())).toEqual([
      0, 0, 0, 0,
    ]);
    expect(color()).toEqualEpsilon([1, 0, 0, 1], 0.002);
    scene.primitives.remove(cover);
    render();
    const old = renderer._classification.getColorTexture();
    const limit = ContextLimits._maximumDrawBuffers;
    try {
      ContextLimits._maximumDrawBuffers = 5;
      expect(render).toThrowError(/classification requires 6/);
    } finally {
      ContextLimits._maximumDrawBuffers = limit;
    }
    scene.canvas.width = 96;
    render();
    expect(old.isDestroyed()).toBe(true);
    const last = renderer._classification.getColorTexture();
    const borrowed = renderer._classificationView.depthStencilTexture;
    scene.invertClassification = false;
    render();
    expect(last.isDestroyed()).toBe(true);
    expect(borrowed.isDestroyed()).toBe(false);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    scene.primitives.removeAll();
    scene.globe.show = true;
    scene.invertClassification = true;
    await ready(() => scene.globe.tilesLoaded && renderer.ready);
    expect(renderer._classification).toBeUndefined();
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
  });

  it("requires six attachments only while classification and feature styling coexist", async function () {
    const { volume } = await tiles();
    const previous = ContextLimits._maximumDrawBuffers;
    try {
      ContextLimits._maximumDrawBuffers = 5;
      renderer.enabled = true;
      expect(render).toThrowError(/classification requires 6/);
      expect(renderer._classification).toBeUndefined();
      volume.show = false;
      render();
      expect(renderer.ready).toBe(true);
      expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
    } finally {
      ContextLimits._maximumDrawBuffers = previous;
    }
  });
});
