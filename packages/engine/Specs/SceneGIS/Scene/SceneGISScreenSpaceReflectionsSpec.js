import {
  Cartesian2,
  Cartesian3,
  Color,
  CustomShader,
  DirectionalLight,
  ImageBasedLighting,
  Matrix4,
  Model,
  SceneGISScreenSpaceReflections,
  SceneTransforms,
  UniformType,
  RuntimeError,
  FramebufferManager,
  PixelDatatype,
  Globe,
  OrthographicFrustum,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  ShadowMode,
  Transforms,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISScreenSpaceReflections", function () {
  let scene, effect, shader, sourceShader, ibl, transform;
  function point(x, y, z) {
    return Matrix4.multiplyByPoint(
      transform,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function vector(x, y, z) {
    return Matrix4.multiplyByPointAsVector(
      transform,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function setup(planar = true, orthographic = false) {
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
    scene.light = new DirectionalLight({
      direction: vector(0, 0, -1),
      color: Color.BLACK,
    });
    scene.camera.setView({
      destination: point(0, -15, 10),
      orientation: {
        direction: Cartesian3.normalize(vector(0, 19, -10), new Cartesian3()),
        up: vector(0, 0, 1),
      },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 200;
    if (orthographic) {
      scene.camera.frustum = new OrthographicFrustum({
        width: 26,
        aspectRatio: 1,
        near: 0.1,
        far: 200,
      });
      scene.logarithmicDepthBuffer = false;
      scene.farToNearRatio = 2;
    }
    effect = new SceneGISScreenSpaceReflections({
      scene,
      enabled: true,
      thickness: 0.5,
    });
  }
  function render() {
    scene.renderForSpecs();
  }
  function pixel(position) {
    const p = SceneTransforms.worldToWindowCoordinates(scene, position);
    return Array.from(
      scene.context.readPixels({
        x: Math.floor(p.x),
        y: 127 - Math.floor(p.y),
        width: 1,
        height: 1,
      }),
    );
  }
  function sample(texture, position) {
    const p = SceneTransforms.worldToWindowCoordinates(scene, position);
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    const command = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_texture; uniform vec2 u_pixel; void main() { out_FragColor = texelFetch(u_texture, ivec2(u_pixel), 0); }",
      {
        uniformMap: {
          u_texture: () => texture,
          u_pixel: () => new Cartesian2(Math.floor(p.x), 127 - Math.floor(p.y)),
        },
        framebuffer: target.framebuffer,
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
  async function models(clearcoat = false) {
    shader = new CustomShader({
      uniforms: { u_roughness: { type: UniformType.FLOAT, value: 0.03 } },
      fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(0.0); material.specular = vec3(1.0); material.roughness = u_roughness; ${clearcoat ? "material.clearcoatNormal = normalize(material.normalEC + vec3(0.2, 0.0, 0.0)); material.clearcoatRoughness = 0.25; material.clearcoatFactor = 1.0;" : ""} }`,
    });
    sourceShader = new CustomShader({
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(0.0); material.specular = vec3(0.0); material.emissive = vec3(3.0, 0.0, 0.0); }",
    });
    ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(0, 1),
      specularEnvironmentMaps:
        "./Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2",
    });
    const floorMatrix = Matrix4.fromScale(new Cartesian3(30, 30, 0.2));
    Matrix4.setTranslation(
      floorMatrix,
      new Cartesian3(0, 0, -0.1),
      floorMatrix,
    );
    Matrix4.multiply(transform, floorMatrix, floorMatrix);
    const floor = scene.primitives.add(
      await Model.fromGltfAsync({
        url: clearcoat
          ? "./Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf"
          : "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: floorMatrix,
        customShader: shader,
        imageBasedLighting: ibl,
      }),
    );
    const boxMatrix = Matrix4.fromScale(new Cartesian3(4, 4, 6));
    Matrix4.setTranslation(boxMatrix, new Cartesian3(0, 4, 3), boxMatrix);
    Matrix4.multiply(transform, boxMatrix, boxMatrix);
    const box = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: boxMatrix,
        customShader: sourceShader,
      }),
    );
    await pollToPromise(
      () => {
        render();
        return (
          floor.ready && box.ready && ibl.specularEnvironmentCubeMap?.ready
        );
      },
      { timeout: 30000 },
    );
    render();
    return { floor, box };
  }
  afterEach(function () {
    ibl?.destroy();
    ibl = undefined;
    scene?.destroyForSpecs();
    scene = undefined;
    shader?.destroy();
    shader = undefined;
    sourceShader?.destroy();
    sourceShader = undefined;
  });
  [true, false].forEach(function (planar) {
    it(`reflects ${planar ? "Planar" : "Globe"} opaque geometry using evaluated roughness and preserves IBL on misses`, async function () {
      setup(planar);
      const { box } = await models();
      const receiver = point(0, -0.4, 0);
      const hit = pixel(receiver);
      effect.enabled = false;
      render();
      const environment = pixel(receiver);
      expect(hit[0]).toBeGreaterThan(hit[1] + 60);
      expect(hit[0] - hit[1]).toBeGreaterThan(
        environment[0] - environment[1] + 30,
      );
      effect.enabled = true;
      shader.setUniform("u_roughness", 0.8);
      render();
      const rough = pixel(receiver);
      effect.enabled = false;
      render();
      expect(pixel(receiver)).toEqual(rough);
      shader.setUniform("u_roughness", 0.03);
      box.show = false;
      effect.enabled = true;
      render();
      const miss = pixel(receiver);
      effect.enabled = false;
      render();
      expect(pixel(receiver)).toEqual(miss);
    });
  });
  it("avoids source-key lookups on warm draws and refreshes changed SSR shaders", async function () {
    setup();
    await models();
    const lookup = spyOn(
      scene.context.shaderCache,
      "getDerivedShaderProgram",
    ).and.callThrough();
    const ssrLookups = () =>
      lookup.calls
        .allArgs()
        .filter((args) => args[1].startsWith("sceneGIS_SSR_"));
    const receiver = point(0, -0.4, 0);
    const reflected = pixel(receiver);
    render();
    expect(ssrLookups().length).toBe(0);
    expect(pixel(receiver)).toEqual(reflected);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(ssrLookups().length).toBeGreaterThan(0);
    const resolvedSources = new Set(ssrLookups().map((args) => args[0]));
    const capture = effect._state.raw.getColorTexture();
    lookup.calls.reset();
    shader.setUniform("u_roughness", 0.8);
    render();
    expect(ssrLookups().every((args) => !resolvedSources.has(args[0]))).toBe(
      true,
    );
    expect(effect._state.raw.getColorTexture()).toBe(capture);
    const rough = pixel(receiver);
    expect(rough).not.toEqual(reflected);
    effect.enabled = false;
    render();
    expect(pixel(receiver)).toEqual(rough);
  });
  it("captures independent clearcoat and custom material directions after native evaluation", async function () {
    setup();
    await models(true);
    const receiver = point(0, -0.4, 0.4);
    const base = sample(effect._state.raw.getColorTexture(1), receiver);
    const coat = sample(effect._state.raw.getColorTexture(2), receiver);
    expect(base[3]).toEqualEpsilon(0.03, 0.001);
    expect(coat[3]).toEqualEpsilon(0.25, 0.001);
    expect(Math.abs(base[0] - coat[0])).toBeGreaterThan(0.05);
  });
  it("supports orthographic multi-frustum depth, native AO/shadows and picking without changing capture", async function () {
    setup(true, true);
    const { box, floor } = await models();
    floor.shadows = box.shadows = ShadowMode.ENABLED;
    scene.shadowMap.enabled = true;
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(effect.ready).toBe(true);
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    const receiver = point(0, -1, 0);
    const depth = sample(effect._state.depth.getColorTexture(), receiver)[0];
    expect(depth).toBeGreaterThan(10);
    expect(depth).toBeLessThan(40);
    const before = pixel(receiver);
    const captures = effect._state.captureDraws;
    const p = SceneTransforms.worldToWindowCoordinates(scene, point(0, 4, 6));
    expect(scene.pick(p)).toBeDefined();
    expect(effect._state.captureDraws).toBe(captures);
    render();
    expect(pixel(receiver)).toEqual(before);
  });
  it("validates attachment, reuses disabled resources, replaces resized targets and releases Scene-owned resources", function () {
    setup();
    render();
    expect(effect.ready).toBe(true);
    expect(
      () => new SceneGISScreenSpaceReflections({ scene }),
    ).toThrowDeveloperError();
    expect(() => {
      effect.stepCount = 0;
    }).toThrowDeveloperError();
    expect(() => {
      effect.maximumDistance = NaN;
    }).toThrowDeveloperError();
    const texture = effect._state.raw.getColorTexture();
    effect.enabled = false;
    render();
    expect(effect.ready).toBe(false);
    expect(effect._state.raw.getColorTexture()).toBe(texture);
    effect.enabled = true;
    render();
    expect(effect._state.raw.getColorTexture()).toBe(texture);
    scene.canvas.width = 160;
    render();
    expect(texture.isDestroyed()).toBe(true);
    const resized = effect._state.result.getColorTexture();
    scene.destroyForSpecs();
    scene = undefined;
    expect(effect.isDestroyed()).toBe(true);
    expect(resized.isDestroyed()).toBe(true);
  });
  it("allocates lazily, rejects non-HDR activation and detaches on explicit destroy", function () {
    scene = createScene({ canvas: createCanvas(32, 32) });
    scene.highDynamicRange = false;
    expect(
      () => new SceneGISScreenSpaceReflections({ scene, enabled: true }),
    ).toThrowError(RuntimeError);
    expect(scene._sceneGISScreenSpaceReflections).toBeUndefined();
    effect = new SceneGISScreenSpaceReflections({ scene });
    expect(effect._state).toBeUndefined();
    expect(() => {
      effect.enabled = true;
    }).toThrowError(RuntimeError);
    expect(effect.enabled).toBe(false);
    effect.destroy();
    expect(scene._sceneGISScreenSpaceReflections).toBeUndefined();
    expect(effect.isDestroyed()).toBe(true);
    effect = new SceneGISScreenSpaceReflections({ scene });
    expect(effect.enabled).toBe(false);
  });
});
