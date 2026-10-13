import {
  _SceneGISDeferredLighting as DeferredLighting,
  _SceneGISGBuffer as GBuffer,
  Cartesian2,
  Cartesian3,
  Cesium3DTileColorBlendMode,
  Cesium3DTileStyle,
  Cesium3DTileset,
  Color,
  ContextLimits,
  DirectionalLight,
  FramebufferManager,
  HeadingPitchRange,
  ImageBasedLighting,
  Matrix4,
  Model,
  Pass,
  PixelDatatype,
  SceneGISScreenSpaceReflections,
  SceneGISScreenSpaceIndirectLighting,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredStyling", function () {
  let scene, renderer, ibl;
  const origin = Cartesian3.fromRadians(-1.31968, 0.698874);
  function render() {
    scene.renderForSpecs();
  }
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -1.57, 100));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.light = new DirectionalLight({
      direction: Cartesian3.clone(scene.camera.directionWC),
      intensity: 2,
    });
    ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(0, 0),
    });
    renderer = new DeferredLighting(scene);
  });
  afterEach(function () {
    scene?.destroyForSpecs();
    ibl.destroy();
    scene = undefined;
  });
  async function tiles(kind = "Batched/BatchedWithBatchTable") {
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        `./Data/Cesium3DTiles/${kind}/tileset.json`,
        { imageBasedLighting: ibl, environmentMapOptions: { enabled: false } },
      ),
    );
    await pollToPromise(
      () => {
        render();
        return tileset.tilesLoaded && tileset.root.content?.featuresLength > 0;
      },
      { timeout: 30000 },
    );
    render();
    return tileset;
  }
  function pixels(texture) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, scene.canvas.width, scene.canvas.height);
    const command = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_texture; void main(){out_FragColor=texelFetch(u_texture,ivec2(gl_FragCoord.xy),0);}",
      {
        framebuffer: target.framebuffer,
        uniformMap: { u_texture: () => texture },
      },
    );
    try {
      command.execute(scene.context);
      return scene.context.readPixels({
        framebuffer: target.framebuffer,
        width: scene.canvas.width,
        height: scene.canvas.height,
      });
    } finally {
      command.shaderProgram.destroy();
      target.destroy();
    }
  }
  function hdr() {
    const view = scene._view;
    const target = scene._environmentState.useGlobeDepthFramebuffer
      ? view.globeDepth.colorFramebufferManager
      : view.sceneFramebuffer._colorFramebuffer;
    return pixels(target.getColorTexture());
  }
  function compare() {
    renderer.enabled = false;
    render();
    const before = hdr();
    renderer.enabled = true;
    render();
    const after = hdr();
    let error = 0,
      maximum = 0,
      lit = 0;
    for (let i = 0; i < before.length; ++i) {
      if (i % 4 === 3) {
        continue;
      }
      const delta = Math.abs(before[i] - after[i]);
      error += delta;
      maximum = Math.max(maximum, delta);
      lit += before[i] > 0.01 ? 1 : 0;
    }
    expect(lit).toBeGreaterThan(10);
    expect(error / before.length).toBeLessThan(0.001);
    expect(maximum).toBeLessThan(0.02);
    expect(renderer.ready).toBe(true);
  }
  [
    "Batched/BatchedWithBatchTable",
    "Instanced/InstancedWithBatchTable",
  ].forEach((kind) => {
    it(`preserves native feature modes, show, translucency and picking for ${kind}`, async function () {
      const tileset = await tiles(kind);
      const content = tileset.root.content;
      tileset.style = new Cesium3DTileStyle({ color: "color('cyan')" });
      tileset.colorBlendAmount = 0.4;
      for (const mode of [
        Cesium3DTileColorBlendMode.HIGHLIGHT,
        Cesium3DTileColorBlendMode.REPLACE,
        Cesium3DTileColorBlendMode.MIX,
      ]) {
        tileset.colorBlendMode = mode;
        compare();
        expect(renderer._style).toBeDefined();
      }
      const point = new Cartesian2(32, 32);
      const feature = scene.pick(point);
      expect(feature).toBeDefined();
      expect(feature.content).toBe(content);
      tileset.style = undefined;
      render();
      feature.color = new Color(0.6, 0.2, 0.8, 1);
      compare();
      expect(scene.pick(point)).toBe(feature);
      feature.show = false;
      compare();
      expect(scene.pick(point)).not.toBe(feature);
      feature.show = true;
      feature.color = new Color(0.6, 0.2, 0.8, 0.4);
      compare();
      expect(scene.pick(point)).toBe(feature);
      feature.color = Color.YELLOW;
      compare();
      expect(scene.pick(point)).toBe(feature);
    });
  });
  it("preserves feature and model styling in AO, SSR and SSIL responses", async function () {
    const tileset = await tiles();
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    const ssil = new SceneGISScreenSpaceIndirectLighting({
      scene,
      enabled: true,
    });
    tileset.style = new Cesium3DTileStyle({ color: "color('orange')" });
    tileset.root.content._model.color = new Color(0.3, 0.7, 0.9, 1);
    compare();
    expect(ssr.ready).toBe(true);
    expect(ssil.ready).toBe(true);
    expect(ssr._state.captureDraws).toBe(0);
    expect(renderer._linearDepth).toBe(ssr._state.depth.getColorTexture());
  });
  it("retains base targets across feature visibility, resize and unload", async function () {
    const tileset = await tiles();
    const ordinary = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: Matrix4.fromTranslation(origin),
        imageBasedLighting: ibl,
        environmentMapOptions: { enabled: false },
      }),
    );
    await pollToPromise(() => {
      render();
      return ordinary.ready;
    });
    renderer.enabled = true;
    render();
    const base = renderer._raw.getColorTexture();
    const style = renderer._style.getColorTexture();
    const depth = renderer._source.depthStencilTexture;
    tileset.show = false;
    render();
    expect(style.isDestroyed()).toBe(true);
    expect(renderer._style).toBeUndefined();
    expect(renderer._raw.getColorTexture()).toBe(base);
    expect(depth.isDestroyed()).toBe(false);
    tileset.show = true;
    render();
    expect(renderer._raw.getColorTexture()).toBe(base);
    const second = renderer._style.getColorTexture();
    scene.canvas.width = 96;
    render();
    expect(second.isDestroyed()).toBe(true);
    expect(renderer._style.getColorTexture().width).toBe(96);
    expect(renderer.byteLength).toBe(96 * 64 * 44);
    const resized = renderer._style.getColorTexture();
    scene.primitives.remove(tileset);
    render();
    expect(resized.isDestroyed()).toBe(true);
    expect(renderer._models.has(ordinary)).toBe(true);
    expect(renderer._models.size).toBe(1);
    expect(renderer._style).toBeUndefined();
    await tiles();
    render();
    const last = renderer._style.getColorTexture();
    scene.destroyForSpecs();
    scene = undefined;
    expect(last.isDestroyed()).toBe(true);
  });
  it("checks the fifth target limit while retaining diagnostic qualification", async function () {
    await tiles();
    const original = ContextLimits._maximumDrawBuffers;
    try {
      ContextLimits._maximumDrawBuffers = 4;
      renderer.enabled = true;
      expect(render).toThrowError(/five floating-point color attachments/);
      expect(renderer._style).toBeUndefined();
    } finally {
      ContextLimits._maximumDrawBuffers = original;
      renderer.enabled = false;
    }
    const probe = new GBuffer(scene);
    probe.enabled = true;
    expect(render).toThrowDeveloperError();
    probe.destroy();
  });
  it("refreshes lighting groups when native tile LOD unloads and reloads content", async function () {
    const tileset = await tiles("Tilesets/Tileset");
    tileset.maximumScreenSpaceError = 1;
    renderer.enabled = true;
    await pollToPromise(
      () => {
        render();
        return tileset.tilesLoaded && renderer.groupCount > 1;
      },
      { timeout: 30000 },
    );
    expect(renderer.groupCount).toBeGreaterThan(1);
    const models = [...renderer._models.keys()];
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -1.57, 500));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    tileset.maximumScreenSpaceError = 16;
    render();
    expect(renderer.groupCount).toBe(1);
    tileset.trimLoadedTiles();
    render();
    expect(models.some((model) => model.isDestroyed())).toBe(true);
    tileset.style = new Cesium3DTileStyle({ color: "color('orange')" });
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -1.57, 100));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    tileset.maximumScreenSpaceError = 1;
    await pollToPromise(
      () => {
        render();
        return tileset.tilesLoaded && renderer.groupCount > 1;
      },
      { timeout: 30000 },
    );
    expect(renderer.groupCount).toBeGreaterThan(1);
    expect(
      [...renderer._models.keys()].every((model) => !model.isDestroyed()),
    ).toBe(true);
    compare();
  });
  it("preserves texture feature IDs and fragment-level transparent filtering", async function () {
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/FeatureIdTextureWithTextureTransform/glTF/FeatureIdTextureWithTextureTransform.gltf",
        incrementallyLoadTextures: false,
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
        imageBasedLighting: ibl,
        environmentMapOptions: { enabled: false },
        gltfCallback(gltf) {
          // Give the native texture fixture a property table for CPU feature styling.
          const feature =
            gltf.meshes[0].primitives[0].extensions.EXT_mesh_features
              .featureIds[0];
          feature.featureCount = 256;
          feature.propertyTable = 0;
          gltf.extensionsUsed.push("EXT_structural_metadata");
          gltf.extensions = {
            ...gltf.extensions,
            EXT_structural_metadata: {
              schema: { classes: { feature: {} } },
              propertyTables: [{ class: "feature", count: 256 }],
            },
          };
        },
      }),
    );
    scene.camera.setView({
      destination: new Cartesian3(7000002, 0.5, 0.5),
      orientation: {
        direction: new Cartesian3(-1, 0, 0),
        up: Cartesian3.UNIT_Z,
      },
    });
    scene.light.direction = Cartesian3.clone(scene.camera.directionWC);
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 10;
    await pollToPromise(
      () => {
        render();
        return model.ready;
      },
      { timeout: 30000 },
    );
    render();
    const table = model.featureTables[model.featureTableId];
    for (let i = 0; i < table.featuresLength; ++i) {
      table.getFeature(i).color = new Color(0.4, 0.8, 0.3, i % 2 ? 0.4 : 1);
    }
    compare();
    const commands = scene._view.frustumCommandsList[0].commands[Pass.OPAQUE];
    expect(
      commands.some((c) =>
        c.shaderProgram.fragmentShaderSource.defines.includes(
          "HAS_SELECTED_FEATURE_ID_TEXTURE",
        ),
      ),
    ).toBe(true);
    const point = new Cartesian2(32, 32);
    const feature = scene.pick(point);
    expect(feature).toBeDefined();
    feature.show = false;
    compare();
    expect(scene.pick(point)).not.toBe(feature);
  });
});
