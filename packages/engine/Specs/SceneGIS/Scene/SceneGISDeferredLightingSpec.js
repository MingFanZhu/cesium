import {
  _SceneGISDeferredLighting as DeferredLighting,
  Cartesian2,
  Cartesian3,
  Color,
  ColorBlendMode,
  BoxGeometry,
  ColorGeometryInstanceAttribute,
  CustomShader,
  DirectionalLight,
  FramebufferManager,
  GeometryInstance,
  ImageBasedLighting,
  LightingModel,
  Matrix4,
  Model,
  OrthographicFrustum,
  PerspectiveFrustum,
  PerInstanceColorAppearance,
  PixelDatatype,
  PolygonHierarchy,
  Primitive,
  SceneGISLightCollection,
  SceneGISPointLight,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISWaterSurface,
  ShadowMode,
  SceneGISScreenSpaceReflections,
  SceneGISScreenSpaceIndirectLighting,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredLighting", function () {
  let scene, renderer;
  const borrowed = [];
  function setup() {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.light = new DirectionalLight({
      direction: new Cartesian3(0, 0, -1),
      intensity: 2,
    });
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: new Cartesian3(0, 1, 0),
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 8,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
    scene.farToNearRatio = 10000;
    scene.logarithmicDepthBuffer = false;
    renderer = new DeferredLighting(scene);
  }
  function render() {
    scene.renderForSpecs();
  }
  async function addModel(
    unlit = false,
    mask = false,
    x = 0,
    withoutNormals = false,
  ) {
    const custom = new CustomShader({
      lightingModel: unlit ? LightingModel.UNLIT : LightingModel.PBR,
      fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) {
        m.diffuse=vec3(0.2,0.3,0.4); m.specular=vec3(0.04,0.1,0.2);
        m.roughness=0.45; m.occlusion=0.7; m.emissive=vec3(0.1,0.2,0.3);
        m.normalEC=vec3(0.0,0.0,1.0); ${mask ? "m.alpha=step(32.0,gl_FragCoord.x);" : ""}
      }`,
    });
    const ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(0, 0),
    });
    borrowed.push(custom, ibl);
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: Matrix4.multiplyByUniformScale(
          Matrix4.fromTranslation(new Cartesian3(7000000 + x, 0, 0)),
          3,
          new Matrix4(),
        ),
        customShader: custom,
        imageBasedLighting: ibl,
        gltfCallback: (gltf) => {
          if (withoutNormals) {
            gltf.meshes.forEach((mesh) =>
              mesh.primitives.forEach((primitive) => {
                delete primitive.attributes.NORMAL;
              }),
            );
          }
          if (mask) {
            gltf.materials[0].alphaMode = "MASK";
            gltf.materials[0].alphaCutoff = 0.5;
          }
        },
      }),
    );
    await pollToPromise(
      () => {
        render();
        return model.ready;
      },
      { timeout: 30000 },
    );
    render();
    return model;
  }
  function sample(texture, x = 32, y = 32) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    const command = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_texture; uniform vec2 u_pixel; void main(){out_FragColor=texelFetch(u_texture,ivec2(u_pixel),0);}",
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
          width: 1,
          height: 1,
        }),
      );
    } finally {
      command.shaderProgram.destroy();
      target.destroy();
    }
  }
  function color(x = 32) {
    const manager = scene._environmentState.useGlobeDepthFramebuffer
      ? scene._view.globeDepth.colorFramebufferManager
      : scene._view.sceneFramebuffer._colorFramebuffer;
    return sample(manager.getColorTexture(), x);
  }
  function box(z, translucent = false, x = 0) {
    return scene.primitives.add(
      new Primitive({
        asynchronous: false,
        shadows: ShadowMode.ENABLED,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(1, 1, 0.5),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(
            new Cartesian3(7000000 + x, 0, z),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(1, 0, 0, translucent ? 0.4 : 1),
            ),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent,
          flat: false,
        }),
      }),
    );
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    borrowed.splice(0).forEach((resource) => resource.destroy());
    scene = renderer = undefined;
  });
  [false, true].forEach((unlit) => {
    it(`matches native ${unlit ? "unlit" : "PBR"} lighting and retains picking`, async function () {
      setup();
      const model = await addModel(unlit);
      const before = color();
      expect(before[0]).toBeGreaterThan(0.01);
      renderer.enabled = true;
      render();
      expect(renderer.ready).toBe(true);
      expect(color()).toEqualEpsilon(before, 0.003);
      expect(renderer.drawCount).toBe(1);
      expect(renderer.groupCount).toBe(1);
      expect(renderer.lightDrawCount).toBe(1);
      expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(model);
      expect(sample(renderer._depth.getColorTexture())[0]).toEqualEpsilon(
        8.5,
        0.01,
      );
    });
  });
  [false, true].forEach((unlit) => {
    it(`preserves model color modes in ${unlit ? "unlit" : "PBR"} without extra targets`, async function () {
      setup();
      const model = await addModel(unlit);
      model.color = new Color(0.25, 0.6, 0.8, 1);
      model.colorBlendAmount = 0.4;
      if (!unlit) {
        scene.postProcessStages.ambientOcclusion.enabled = true;
        const ssr = new SceneGISScreenSpaceReflections({
          scene,
          enabled: true,
        });
        const ssil = new SceneGISScreenSpaceIndirectLighting({
          scene,
          enabled: true,
        });
        expect(ssr.enabled && ssil.enabled).toBe(true);
      }
      for (const mode of [
        ColorBlendMode.HIGHLIGHT,
        ColorBlendMode.REPLACE,
        ColorBlendMode.MIX,
      ]) {
        renderer.enabled = false;
        model.colorBlendMode = mode;
        render();
        const before = color();
        renderer.enabled = true;
        render();
        expect(color()).withContext(String(mode)).toEqualEpsilon(before, 0.006);
        expect(renderer._style).toBeUndefined();
        expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(model);
      }
      model.color = undefined;
      render();
      const unstyled = color();
      renderer.enabled = false;
      render();
      expect(color()).toEqualEpsilon(unstyled, 0.006);
      model.color = new Color(0.5, 0.8, 1, 0.4);
      render();
      const transparent = color();
      renderer.enabled = true;
      render();
      expect(color()).toEqualEpsilon(transparent, 0.006);
      expect(renderer.groupCount).toBe(0);
    });
  });
  it("preserves MASK and the existing AO, SSR and SSIL response resolves", async function () {
    setup();
    await addModel(false, true);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    const ssil = new SceneGISScreenSpaceIndirectLighting({
      scene,
      enabled: true,
    });
    render();
    const before = color(36);
    renderer.enabled = true;
    render();
    expect(color(36)).toEqualEpsilon(before, 0.006);
    expect(color(28)[0]).toBeLessThan(0.001);
    expect(ssr.ready).toBe(true);
    expect(ssil.ready).toBe(true);
    expect(renderer.drawCount).toBe(1);
    expect(ssr._state.captureDraws).toBe(0);
  });
  it("clears vacated opaque pixels from current-frame linear depth", async function () {
    setup();
    const model = await addModel();
    renderer.enabled = true;
    render();
    const depth = renderer._depth.getColorTexture();
    expect(sample(depth)[0]).toBeGreaterThan(0);
    model.modelMatrix = Matrix4.fromTranslation(
      new Cartesian3(7000002.5, 0, 0),
    );
    render();
    expect(renderer.ready).toBe(true);
    expect(sample(depth)[0]).toBe(0);
  });
  ["ao", "ssr", "ssil"].forEach((name) => {
    it(`shares current depth with ${name} across owner and resource changes`, async function () {
      setup();
      await addModel(false, true);
      const ao = scene.postProcessStages.ambientOcclusion;
      const ssr = new SceneGISScreenSpaceReflections({ scene });
      const ssil = new SceneGISScreenSpaceIndirectLighting({ scene });
      const effect = { ao, ssr, ssil }[name];
      effect.enabled = true;
      render();
      const state =
        name === "ao" ? ao._sceneGISAmbientOcclusion : effect._state;
      const before = color(36);
      const conversion = spyOn(
        state.copyDepth ?? state.copyCommand,
        "execute",
      ).and.callThrough();
      renderer.enabled = true;
      render();
      expect(renderer._depth).toBeUndefined();
      expect(renderer._linearDepth).toBe(state.depth.getColorTexture());
      expect(conversion).not.toHaveBeenCalled();
      expect(color(36)).toEqualEpsilon(before, 0.006);
      expect(sample(renderer._linearDepth, 36)[0]).toEqualEpsilon(8.5, 0.01);
      expect(sample(renderer._linearDepth, 28)[0]).toBe(0);
      expect(renderer.byteLength).toBe(64 * 64 * 32);
      const first = renderer._linearDepth;
      renderer.enabled = false;
      expect(first.isDestroyed()).toBe(false);
      render();
      expect(conversion).toHaveBeenCalledTimes(1);
      expect(color(36)).toEqualEpsilon(before, 0.006);
      renderer.enabled = true;
      scene.camera.frustum = new PerspectiveFrustum({
        fov: Math.PI / 3,
        aspectRatio: 1,
        near: 0.1,
        far: 30,
      });
      scene.logarithmicDepthBuffer = true;
      scene.canvas.width = 96;
      render();
      expect(first.isDestroyed()).toBe(true);
      expect(renderer._linearDepth.width).toBe(96);
      expect(sample(renderer._linearDepth, 48)[0]).toEqualEpsilon(8.5, 0.003);
      effect.enabled = false;
      render();
      const owned = renderer._depth.getColorTexture();
      expect(renderer._linearDepth).toBe(owned);
      expect(renderer.byteLength).toBe(96 * 64 * 36);
      effect.enabled = true;
      render();
      expect(owned.isDestroyed()).toBe(true);
      expect(renderer._depth).toBeUndefined();
      const last = renderer._linearDepth;
      renderer.destroy();
      expect(last.isDestroyed()).toBe(false);
      scene.destroyForSpecs();
      scene = undefined;
      expect(last.isDestroyed()).toBe(true);
    });
  });
  it("rejects MSAA without changing it and releases only owned resources", async function () {
    setup();
    await addModel();
    expect(renderer._raw).toBeUndefined();
    renderer.enabled = true;
    scene.msaaSamples = 4;
    expect(render).toThrowDeveloperError();
    expect(scene.msaaSamples).toBe(4);
    scene.msaaSamples = 1;
    render();
    const raw = renderer._raw.getColorTexture(),
      depth = renderer._depth.getColorTexture(),
      borrowedDepth = renderer._source.depthStencilTexture;
    renderer.enabled = false;
    expect(raw.isDestroyed()).toBe(true);
    expect(depth.isDestroyed()).toBe(true);
    expect(borrowedDepth.isDestroyed()).toBe(false);
    renderer.enabled = true;
    render();
    scene.primitives.removeAll();
    render();
    expect(renderer.ready).toBe(false);
    expect(renderer._models.size).toBe(0);
  });
  it("keeps independent Model lightColor, SH and live IBL factors", async function () {
    setup();
    const left = await addModel(false, false, -1.7);
    const right = await addModel(false, false, 1.7);
    left.lightColor = new Cartesian3(2, 0, 0);
    right.lightColor = new Cartesian3(0, 2, 0);
    for (const [model, value] of [
      [left, 0.3],
      [right, 0.7],
    ]) {
      model.imageBasedLighting.imageBasedLightingFactor = new Cartesian2(1, 0);
      model.imageBasedLighting.sphericalHarmonicCoefficients = Array.from(
        { length: 9 },
        (_, i) =>
          new Cartesian3(
            i === 0 ? value : 0,
            i === 0 ? value : 0,
            i === 0 ? value : 0,
          ),
      );
    }
    render();
    const beforeLeft = color(18),
      beforeRight = color(46);
    expect(beforeLeft[0]).toBeGreaterThan(beforeRight[0]);
    expect(beforeRight[1]).toBeGreaterThan(beforeLeft[1]);
    renderer.enabled = true;
    render();
    expect(renderer.groupCount).toBe(2);
    expect(color(18)).toEqualEpsilon(beforeLeft, 0.004);
    expect(color(46)).toEqualEpsilon(beforeRight, 0.004);
    left.lightColor = new Cartesian3(0, 0, 2);
    left.imageBasedLighting.sphericalHarmonicCoefficients = Array.from(
      { length: 9 },
      (_, i) => new Cartesian3(i === 0 ? 0.5 : 0, 0, 0),
    );
    render();
    const changed = color(18);
    renderer.enabled = false;
    render();
    expect(changed).toEqualEpsilon(color(18), 0.004);
  });
  it("retains ordinary opaque occlusion, transparent composition and local lights", async function () {
    setup();
    await addModel();
    const lights = new SceneGISLightCollection({ scene });
    for (let i = 0; i < 256; ++i) {
      lights.add(
        new SceneGISPointLight({
          position: new Cartesian3(7000000 + (i % 16) * 0.01, 0, 6),
          intensity: 20 / 256,
          range: 10,
        }),
      );
    }
    lights._tiled = false;
    const opaque = box(4);
    render();
    const before = color();
    lights._tiled = true;
    renderer.enabled = true;
    render();
    expect(color()).toEqualEpsilon(before, 0.004);
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(-2);
    expect(renderer.drawCount).toBe(2);
    scene.primitives.remove(opaque);
    box(4, true);
    render();
    const translucent = color();
    lights._tiled = false;
    renderer.enabled = false;
    render();
    expect(color()).toEqualEpsilon(translucent, 0.004);
  });
  it("retains native missing-normal lighting, perspective log depth and resize lifecycle", async function () {
    setup();
    await addModel(false, false, 0, true);
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
    scene.logarithmicDepthBuffer = true;
    render();
    const before = color();
    renderer.enabled = true;
    render();
    expect(color()).toEqualEpsilon(before, 0.003);
    expect(sample(renderer._depth.getColorTexture())[0]).toEqualEpsilon(
      8.5,
      0.003,
    );
    const first = renderer._raw.getColorTexture();
    scene.canvas.width = 96;
    render();
    expect(first.isDestroyed()).toBe(true);
    expect(renderer._raw.getColorTexture().width).toBe(96);
    const last = renderer._raw.getColorTexture();
    scene.destroyForSpecs();
    scene = undefined;
    expect(last.isDestroyed()).toBe(true);
    expect(renderer.isDestroyed()).toBe(true);
  });
  it("publishes opaque inputs to water without replay when screen effects are off", async function () {
    setup();
    await addModel();
    scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: new PolygonHierarchy(
          [
            [-2, -2, 0],
            [2, -2, 0],
            [2, 2, 0],
            [-2, 2, 0],
          ].map((p) => Cartesian3.fromArray(p)),
        ),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 2)),
        waveAmplitude: 0,
        flowSpeed: 0,
        roughness: 0.2,
      }),
    );
    render();
    const before = color();
    renderer.enabled = true;
    render();
    expect(renderer.drawCount).toBe(1);
    expect(scene.frameState._sceneGISWater.captureDraws).toBe(0);
    expect(scene.frameState._sceneGISWater.borrowed).toBe(true);
    expect(color()).toEqualEpsilon(before, 0.008);
  });
  it("reuses native shadow visibility without darkening model emission", async function () {
    setup();
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: 6999968,
          maximumX: 7000032,
          minimumY: -32,
          maximumY: 32,
        }),
      }),
      maximumLevel: 0,
    });
    scene._initializeWorld(world);
    world.show = false;
    const floor = await addModel();
    floor.modelMatrix = Matrix4.multiplyByScale(
      Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
      new Cartesian3(8, 8, 0.1),
      new Matrix4(),
    );
    box(3, false, -1.5);
    scene.light.direction = new Cartesian3(1, 0, -1);
    scene.shadowMap.maximumDistance = 30;
    scene.shadowMap.size = 1024;
    scene.shadowMap.darkness = 0;
    render();
    const lit = color(43);
    scene.shadowMap.enabled = true;
    render();
    const shadowed = color(43);
    expect(lit[0]).toBeGreaterThan(shadowed[0] + 0.01);
    renderer.enabled = true;
    render();
    expect(color(43)).toEqualEpsilon(shadowed, 0.003);
    expect(sample(renderer._raw.getColorTexture(3), 43)[3]).toBeLessThan(0.2);
    expect(color(43)[0]).toBeGreaterThanOrEqual(0.099);
  });
});
