import {
  Axis,
  Cartesian2,
  Cartesian3,
  Color,
  ColorBlendMode,
  ClippingPlane,
  ClippingPlaneCollection,
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
  PixelFormat,
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
  SceneGISTemporalAntialiasing,
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
    renderer = scene._sceneGISDeferred;
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
  it("selects one lighting group for different primitive uniforms and preserves native updates", async function () {
    setup();
    const ibl = new ImageBasedLighting({
      imageBasedLightingFactor: Cartesian2.ZERO,
    });
    borrowed.push(ibl);
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
        upAxis: Axis.Z,
        forwardAxis: Axis.X,
        imageBasedLighting: ibl,
        gltfCallback(gltf) {
          const primitive = gltf.meshes[0].primitives[0];
          gltf.materials = [
            [1, 0, 0, 1],
            [0, 1, 0, 1],
          ].map((baseColorFactor) => ({
            pbrMetallicRoughness: {
              baseColorFactor,
              metallicFactor: 0,
              roughnessFactor: 0.6,
            },
          }));
          gltf.meshes = [0, 1].map((material) => ({
            primitives: [{ ...primitive, material }],
          }));
          gltf.nodes = [
            { name: "left", mesh: 0, translation: [-1.5, 0, 0] },
            { name: "right", mesh: 1, translation: [1.5, 0, 0] },
          ];
          gltf.scenes[0].nodes = [0, 1];
        },
      }),
    );
    await pollToPromise(() => {
      render();
      return model.ready;
    });
    const ao = scene.postProcessStages.ambientOcclusion;
    ao.enabled = true;
    for (const directional of [false, true]) {
      ao.uniforms.directionalOcclusion = directional;
      render();
      expect(renderer.drawCount).toBe(2);
      expect(renderer.groupCount).toBe(1);
      expect(renderer.lightDrawCount).toBe(1);
      expect(
        new Set(
          scene.frameState.commandList
            .filter((c) => c.owner === model)
            .map((c) => c.uniformMap),
        ).size,
      ).toBe(2);
      expect(color(20)[0]).toBeGreaterThan(color(20)[1] + 0.2);
      expect(color(44)[1]).toBeGreaterThan(color(44)[0] + 0.2);
      const group = renderer._groups[0];
      render();
      expect(renderer._groups[0].command.shaderProgram).toBe(
        group.command.shaderProgram,
      );
    }
    const lookup = spyOn(
      scene.context.shaderCache,
      "getShaderProgram",
    ).and.callThrough();
    render();
    expect(
      lookup.calls
        .allArgs()
        .filter(([options]) =>
          options.fragmentShaderSource.defines.includes(
            "SCENEGIS_DEFERRED_LIGHTING",
          ),
        ).length,
    ).toBe(0);
    const before = renderer._groups[0];
    model.lightColor = new Cartesian3(1, 1, 1);
    render();
    expect(renderer._groups[0]).not.toBe(before);
    const changed = renderer._groups[0];
    const red = color(20)[0];
    model.lightColor = new Cartesian3(0.1, 0.1, 0.1);
    render();
    expect(renderer._groups[0].command.shaderProgram).toBe(
      changed.command.shaderProgram,
    );
    expect(color(20)[0]).toBeLessThan(red * 0.5);
    const green = color(44);
    model.getNode("left").show = false;
    render();
    expect(renderer.groupCount).toBe(1);
    expect(renderer.drawCount).toBe(1);
    expect(color(20)[0]).toBeLessThan(0.01);
    expect(color(44)).toEqualEpsilon(green, 0.001);
    model.getNode("left").show = true;
    render();
    expect(renderer.groupCount).toBe(1);
    expect(renderer.drawCount).toBe(2);
    expect(color(44)).toEqualEpsilon(green, 0.001);
    scene.primitives.remove(model);
    render();
    expect(renderer._models.size).toBe(0);
  });
  it("preserves opaque and translucent native silhouettes with deferred model lighting", async function () {
    setup();
    const model = await addModel();
    scene.light.intensity = 0;
    scene.camera.setView({
      destination: new Cartesian3(7000008, 6, 10),
      orientation: {
        direction: Cartesian3.normalize(
          new Cartesian3(-8, -6, -10),
          new Cartesian3(),
        ),
        up: Cartesian3.UNIT_Z,
      },
    });
    model.silhouetteSize = 16;
    model.silhouetteColor = Color.RED;
    render();
    const groups = Array.from(
      { length: 64 },
      (_, x) => sample(renderer._raw.getColorTexture(2), x)[3],
    );
    const edge = groups.indexOf(-1);
    expect(edge).toBeGreaterThan(-1);
    expect(color(edge)).toEqualEpsilon([1, 0, 0, 1], 0.001);
    expect(color()).toEqualEpsilon([0.1, 0.2, 0.3, 1], 0.002);
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(color(edge)).toEqualEpsilon([1, 0, 0, 1], 0.001);
    expect(
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion
        .prepassDraws,
    ).toBe(0);
    model.silhouetteColor = Color.RED.withAlpha(0.5);
    render();
    expect(sample(renderer._raw.getColorTexture(2), edge)[3]).toBe(0);
    const blended = sample(
      scene.postProcessStages._tonemapping._colorTexture,
      edge,
    );
    expect(blended[0]).toBeGreaterThan(0.4);
    expect(blended[0]).toBeLessThan(0.8);
    expect(blended[1]).toBeLessThan(0.001);
    model.silhouetteSize = 0;
    render();
    expect(
      sample(scene.postProcessStages._tonemapping._colorTexture, edge)[0],
    ).toBeLessThan(0.001);
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("preserves model clipping edges, live planes and picking without extra material targets", async function () {
    setup();
    const model = await addModel();
    model.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
      edgeWidth: 3,
      edgeColor: Color.YELLOW,
    });
    render();
    expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
    const raw = renderer._raw.getColorTexture();
    const groups = Array.from(
      { length: 64 },
      (_, x) => sample(renderer._raw.getColorTexture(2), x)[3],
    );
    const edge = groups.indexOf(-1);
    expect(edge).toBeGreaterThan(-1);
    expect(color(edge)).toEqualEpsilon([1, 1, 0, 1], 0.001);
    scene.light.intensity = 0;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    render();
    expect(color(edge)).toEqualEpsilon([1, 1, 0, 1], 0.001);
    expect(
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion
        .mainPass,
    ).toBe(true);
    expect(ssr._state.captureDraws).toBe(0);
    expect(scene.pick(new Cartesian2(edge, 32)).primitive).toBe(model);
    model.clippingPlanes.get(0).distance = -10;
    render();
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(0);
    expect(scene.pick(new Cartesian2(32, 32))).toBeUndefined();
    model.clippingPlanes.get(0).distance = 10;
    render();
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBeGreaterThan(0);
    scene.canvas.width = 80;
    render();
    expect(raw.isDestroyed()).toBe(true);
    const current = renderer._raw.getColorTexture();
    scene.primitives.remove(model);
    render();
    expect(current.isDestroyed()).toBe(true);
    ssr.destroy();
  });
  it("keeps LDR lighting and transparency linear until one display conversion", async function () {
    setup();
    scene.highDynamicRange = false;
    scene.postProcessStages.fxaa.enabled = false;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    await addModel();
    box(3, true);
    render();
    const linear = sample(scene.postProcessStages._tonemapping._colorTexture);
    const output = sample(scene.postProcessStages.outputTexture);
    const expected = linear.map((value, index) =>
      index === 3
        ? value
        : Math.pow(Math.min(Math.max(value, 0), 1), 1 / scene.gamma),
    );
    expect(output).toEqualEpsilon(expected, 2 / 255);
    expect(scene.highDynamicRange).toBe(false);
    expect(scene._hdr).toBe(true);
    expect(renderer.ready).toBe(true);
    const material = renderer._raw.getColorTexture();
    const source = renderer._source;
    scene.postProcessStages.exposure = 0.01;
    render();
    expect(sample(scene.postProcessStages.outputTexture)).toEqualEpsilon(
      output,
      1 / 255,
    );
    scene.requestRenderMode = true;
    scene._renderRequested = false;
    scene.highDynamicRange = true;
    expect(scene._renderRequested).toBe(true);
    render();
    const hdrOutput = sample(scene.postProcessStages.outputTexture);
    expect(hdrOutput[0]).toBeLessThan(output[0] - 0.1);
    expect(
      sample(scene.postProcessStages._tonemapping._colorTexture),
    ).toEqualEpsilon(linear, 0.002);
    expect(renderer._raw.getColorTexture()).toBe(material);
    expect(renderer._source).toBe(source);
    scene.highDynamicRange = false;
    render();
    expect(sample(scene.postProcessStages.outputTexture)).toEqualEpsilon(
      output,
      1 / 255,
    );
    expect(renderer._raw.getColorTexture()).toBe(material);
  });
  it("clamps LDR highlights at output while preserving material radiance and picking", async function () {
    setup();
    scene.highDynamicRange = false;
    scene.postProcessStages.fxaa.enabled = false;
    scene.light.intensity = 50;
    const model = await addModel();
    render();
    expect(color()[0]).toBeGreaterThan(1);
    expect(sample(scene.postProcessStages.outputTexture)[0]).toBe(1);
    expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(model);
    const material = renderer._raw.getColorTexture();
    renderer.destroy();
    expect(material.isDestroyed()).toBe(true);
    expect(scene.highDynamicRange).toBe(false);
    expect(scene._hdr).toBe(false);
  });
  [false, true].forEach((logDepth) => {
    it(`collects multi-frustum materials before lighting and transparency with log depth ${logDepth}`, async function () {
      setup();
      const near = await addModel(true);
      const far = await addModel(true);
      near.modelMatrix = Matrix4.multiplyByUniformScale(
        Matrix4.fromTranslation(new Cartesian3(6999998, 0, 980)),
        3,
        new Matrix4(),
      );
      far.modelMatrix = Matrix4.multiplyByUniformScale(
        Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
        300,
        new Matrix4(),
      );
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(350, 350, 1),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            modelMatrix: Matrix4.fromTranslation(
              new Cartesian3(7000000, 0, 500),
            ),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(
                new Color(1, 0, 0, 0.4),
              ),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            translucent: true,
            flat: true,
          }),
        }),
      );
      scene.camera.setView({
        destination: new Cartesian3(7000000, 0, 1000),
        orientation: {
          direction: new Cartesian3(0, 0, -1),
          up: new Cartesian3(0, 1, 0),
        },
      });
      scene.camera.frustum = new PerspectiveFrustum({
        near: 1,
        far: 2000,
        fov: Math.PI / 3,
        aspectRatio: 1,
      });
      scene.farToNearRatio = scene.logarithmicDepthFarToNearRatio = 10;
      scene.logarithmicDepthBuffer = logDepth;
      render();
      expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
      expect(color(27)).toEqualEpsilon([0.2, 0.3, 0.4, 1], 0.002);
      const composite = scene.postProcessStages._tonemapping._colorTexture;
      expect(sample(composite, 27)).toEqualEpsilon([0.2, 0.3, 0.4, 1], 0.002);
      // The transparent box contributes its front and back faces to native OIT.
      expect(sample(composite, 36)).toEqualEpsilon(
        [0.712, 0.108, 0.144, 1],
        0.004,
      );
      expect(renderer._linearDepth.pixelFormat).toBe(PixelFormat.RG);
      const nearDepth = sample(renderer._linearDepth, 27);
      const farDepth = sample(renderer._linearDepth, 36);
      expect(nearDepth[0]).toBeLessThan(30);
      expect(nearDepth[0]).toBeGreaterThan(10);
      expect(farDepth[0]).toEqualEpsilon(850, 0.02);
      expect(nearDepth[1]).toBeLessThan(farDepth[1]);
      expect(renderer.lightDrawCount).toBe(2);
      expect(renderer.drawCount).toBe(2);
      expect(renderer._framebuffer.numberOfColorAttachments).toBe(5);
      expect(renderer.byteLength).toBe(64 * 64 * 40);
      expect(scene.pick(new Cartesian2(27, 32)).primitive).toBe(near);
      render();
      expect(scene.pickPosition(new Cartesian2(27, 32)).z).toEqualEpsilon(
        981.5,
        0.02,
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
      expect(renderer._depth).toBeUndefined();
      expect(renderer.byteLength).toBe(64 * 64 * 32);
      const shared = renderer._linearDepth;
      expect(shared.isDestroyed()).toBe(false);
      scene.farToNearRatio = scene.logarithmicDepthFarToNearRatio = 1000000;
      render();
      expect(scene._view.frustumCommandsList.length).toBe(1);
      expect(renderer._linearDepth.pixelFormat).toBe(PixelFormat.RED);
      expect(renderer._framebuffer.numberOfColorAttachments).toBe(4);
      expect(shared.isDestroyed()).toBe(true);
      expect(scene.context._gl.getError()).toBe(0);
    });
  });
  [false, true].forEach((unlit) => {
    it(`evaluates ${unlit ? "unlit" : "PBR"} lighting and retains picking`, async function () {
      setup();
      const model = await addModel(unlit);
      const lit = color();
      scene.light.intensity = 0;
      render();
      expect(renderer.ready).toBe(true);
      expect(color()).toEqualEpsilon(
        unlit ? [0.2, 0.3, 0.4, 1] : [0.1, 0.2, 0.3, 1],
        0.003,
      );
      if (unlit) {
        expect(lit).toEqualEpsilon(color(), 0.001);
      } else {
        expect(lit[0]).toBeGreaterThan(color()[0] + 0.01);
      }
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
      const unstyled = color();
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
        model.colorBlendMode = mode;
        render();
        const tint = [0.25, 0.6, 0.8];
        const expected = unstyled.map((value, channel) =>
          channel === 3
            ? 1
            : mode === ColorBlendMode.HIGHLIGHT
              ? value * tint[channel]
              : mode === ColorBlendMode.REPLACE
                ? tint[channel]
                : value * 0.6 + tint[channel] * 0.4,
        );
        expect(color())
          .withContext(String(mode))
          .toEqualEpsilon(expected, 0.006);
        expect(renderer._style).toBeUndefined();
        expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(model);
      }
      model.color = undefined;
      render();
      expect(color()).toEqualEpsilon(unstyled, 0.006);
      model.color = new Color(0.5, 0.8, 1, 0.4);
      render();
      expect(
        sample(scene.postProcessStages._tonemapping._colorTexture)[0],
      ).toBeGreaterThan(0.01);
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
    expect(color(36)[0]).toBeGreaterThan(0.1);
    expect(color(28)[0]).toBeLessThan(0.001);
    expect(ssr.ready).toBe(true);
    expect(ssil.ready).toBe(true);
    expect(renderer.drawCount).toBe(1);
    expect(ssr._state.captureDraws).toBe(0);
  });
  it("clears vacated opaque pixels from current-frame linear depth", async function () {
    setup();
    const model = await addModel();
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
      expect(state.raw.getDepthStencilTexture()).toBeUndefined();
      render();
      expect(renderer._depth).toBeUndefined();
      expect(renderer._linearDepth).toBe(state.depth.getColorTexture());
      expect(state.copyDepth ?? state.copyCommand).toBeUndefined();
      expect(color(36)).toEqualEpsilon(before, 0.006);
      expect(sample(renderer._linearDepth, 36)[0]).toEqualEpsilon(8.5, 0.01);
      expect(sample(renderer._linearDepth, 28)[0]).toBe(0);
      expect(renderer.byteLength).toBe(64 * 64 * 32);
      const first = renderer._linearDepth;
      expect(first.isDestroyed()).toBe(false);
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
    const material = renderer._raw.getColorTexture();
    scene.msaaSamples = 4;
    expect(render).toThrowDeveloperError();
    expect(scene.msaaSamples).toBe(4);
    expect(renderer._raw.getColorTexture()).toBe(material);
    scene.msaaSamples = 1;
    render();
    const raw = renderer._raw.getColorTexture(),
      depth = renderer._depth.getColorTexture(),
      borrowedDepth = renderer._source.depthStencilTexture;
    scene.primitives.removeAll();
    render();
    expect(raw.isDestroyed()).toBe(true);
    expect(depth.isDestroyed()).toBe(true);
    expect(borrowedDepth.isDestroyed()).toBe(false);
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
    expect(renderer.groupCount).toBe(2);
    left.lightColor = new Cartesian3(0, 0, 2);
    left.imageBasedLighting.sphericalHarmonicCoefficients = Array.from(
      { length: 9 },
      (_, i) => new Cartesian3(i === 0 ? 0.5 : 0, 0, 0),
    );
    render();
    const changed = color(18);
    expect(changed[2]).toBeGreaterThan(beforeLeft[2] + 0.01);
    expect(changed[1]).toBeLessThan(beforeLeft[1]);
    expect(color(46)).toEqualEpsilon(beforeRight, 0.001);
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
    render();
    expect(color()).toEqualEpsilon(before, 0.004);
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(-2);
    expect(renderer.drawCount).toBe(2);
    scene.primitives.remove(opaque);
    box(4, true);
    render();
    const translucent = color();
    lights._tiled = false;
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
    expect(color()).toEqualEpsilon([0.24, 0.41, 0.58, 1], 0.003);
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
    expect(renderer.drawCount).toBe(1);
    expect(scene.frameState._sceneGISWater.captureDraws).toBe(0);
    expect(scene.frameState._sceneGISWater.borrowed).toBe(true);
    expect(scene.frameState._sceneGISWater.depthTexture).toBeDefined();
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
    // This shadow fixture controls its primary light explicitly.
    scene.environmentEffects.enabled = false;
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

    expect(sample(renderer._raw.getColorTexture(3), 43)[3]).toBeLessThan(0.2);
    expect(color(43)[0]).toBeGreaterThanOrEqual(0.099);
  });
});
