import {
  Cartesian2,
  Cartesian3,
  Color,
  CustomShader,
  DirectionalLight,
  ImageBasedLighting,
  Matrix4,
  Model,
  SceneGISScreenSpaceIndirectLighting,
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
  Transforms,
  ColorBlendMode,
  LightingModel,
  SceneGISLightCollection,
  SceneGISPointLight,
  SceneGISWaterSurface,
  PolygonHierarchy,
} from "../../../index.js";
import estimateShader from "../../../Source/Shaders/SceneGIS/IndirectLighting/SceneGISSILEstimate.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";
describe("SceneGIS/Scene/SceneGISScreenSpaceIndirectLighting", function () {
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
      scene.globe.depthTestAgainstTerrain = true;
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
      scene.farToNearRatio = 10000;
    }
    effect = new SceneGISScreenSpaceIndirectLighting({
      scene,
      enabled: true,
      thickness: 1.0,
      radius: 8.0,
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

  async function models(clearcoat = false, unlit = false) {
    shader = new CustomShader({
      lightingModel: unlit ? LightingModel.UNLIT : LightingModel.PBR,
      uniforms: { u_metal: { type: UniformType.FLOAT, value: 0 } },
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { m.diffuse=vec3(0.5)*(1.0-u_metal); m.specular=mix(vec3(0.04),vec3(1.0),u_metal); m.emissive=vec3(0.0); m.roughness=0.5; }",
    });
    sourceShader = new CustomShader({
      uniforms: {
        u_emission: { type: UniformType.VEC3, value: new Cartesian3(3, 0, 0) },
        u_diffuse: { type: UniformType.VEC3, value: new Cartesian3() },
      },
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { m.diffuse=u_diffuse; m.specular=vec3(0.0); m.emissive=u_emission; }",
    });
    ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(0, 0),
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
        imageBasedLighting: ibl,
      }),
    );
    await pollToPromise(
      () => {
        render();
        return (
          floor.ready && box.ready && floor._drawCommandsBuilt && effect.ready
        );
      },
      { timeout: 30000 },
    );
    render();
    return { floor, box };
  }
  function output(p = point(0, 0, 0.01)) {
    return sample(effect._state.result.getColorTexture(), p);
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    ibl?.destroy();
    shader?.destroy();
    sourceShader?.destroy();
    scene = ibl = shader = sourceShader = undefined;
  });
  it("defaults disabled, validates options atomically and owns its lifecycle", function () {
    scene = createScene();
    effect = new SceneGISScreenSpaceIndirectLighting({ scene });
    expect(effect.enabled).toBe(false);
    expect(effect.ready).toBe(false);
    expect(effect._state).toBeUndefined();
    expect(
      () => new SceneGISScreenSpaceIndirectLighting({ scene }),
    ).toThrowDeveloperError();
    [
      ["radius", 0],
      ["thickness", NaN],
      ["intensity", -1],
      ["directionCount", 1.5],
      ["stepCount", 17],
      ["resolutionScale", 0.25],
      ["enabled", 1],
    ].forEach(([name, value]) => {
      expect(() => {
        effect[name] = value;
      }).toThrowDeveloperError();
    });
    scene.highDynamicRange = false;
    expect(() => {
      effect.enabled = true;
    }).toThrowError(RuntimeError);
    effect.destroy();
    expect(scene._sceneGISScreenSpaceIndirectLighting).toBeUndefined();
    effect = new SceneGISScreenSpaceIndirectLighting({ scene });
    scene.destroyForSpecs();
    expect(effect.isDestroyed()).toBe(true);
    scene = undefined;
  });
  it("integrates finite angular sectors correctly on the GPU, including bit 31", function () {
    scene = createScene();
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    const helpers = estimateShader.slice(
      0,
      estimateShader.indexOf("void main()"),
    );
    const command = scene.context.createViewportQuadCommand(
      `${helpers}void main(){uint m=sceneGISSILMask(0.1,0.8);out_FragColor=vec4(sceneGISSILCount(m),sceneGISSILCount(sceneGISSILMask(-0.8,-0.1)),sceneGISSILCount(sceneGISSILMask(-czm_piOverTwo,czm_piOverTwo)),sceneGISSILCount(m & ~m));}`,
      { framebuffer: target.framebuffer },
    );
    try {
      command.execute(scene.context);
      expect(
        Array.from(
          scene.context.readPixels({
            framebuffer: target.framebuffer,
            width: 1,
            height: 1,
          }),
        ),
      ).toEqual([7, 7, 32, 0]);
    } finally {
      command.shaderProgram.destroy();
      target.destroy();
    }
  });
  [true, false].forEach((planar) => {
    it(`${
      planar ? "planar" : "globe"
    } adds a bounded red bounce and does not feed it back`, async function () {
      setup(planar);
      if (planar) {
        scene.world.show = false;
      } else {
        scene.globe.show = false;
      }
      await models();
      const first = output();
      expect(first[0]).toBeGreaterThan(0.003);
      expect(first[1]).toBeLessThan(0.0001);
      expect(first[2]).toBeLessThan(0.0001);
      expect(first[3]).toBe(0);
      const lit = pixel(point(0, 0, 0.01));
      effect.enabled = false;
      render();
      const dark = pixel(point(0, 0, 0.01));
      expect(lit[0]).toBeGreaterThan(dark[0]);
      expect(lit[3]).toBe(dark[3]);
      effect.enabled = true;
      render();
      expect(output()).toEqualEpsilon(first, 0.00001);
      shader.setUniform("u_metal", 1);
      render();
      expect(output().slice(0, 3)).toEqualEpsilon([0, 0, 0], 0.00001);
      shader.setUniform("u_metal", 0);
      sourceShader.setUniform("u_emission", new Cartesian3(0, 0, 0));
      render();
      expect(output().slice(0, 3)).toEqualEpsilon([0, 0, 0], 0.00001);
      expect(effect._state.mainDraws).toBe(2);
    });
  });
  it("reconstructs orthographic depth without changing camera state", async function () {
    setup(true, true);
    scene.world.show = false;
    await models();
    expect(output()[0]).toBeGreaterThan(0.003);
    expect(scene.camera.frustum.width).toBe(26);
  });
  it("captures directional and local diffuse sources without IBL or highlights", async function () {
    setup();
    scene.world.show = false;
    await models();
    sourceShader.setUniform("u_emission", new Cartesian3());
    sourceShader.setUniform("u_diffuse", new Cartesian3(0, 0.5, 0));
    scene.light.color = Color.WHITE;
    scene.light.intensity = 3;
    scene.light.direction = vector(0, 1, -1);
    render();
    const source = () =>
      sample(effect._state.main.ssil.getColorTexture(0), point(0, 2, 3));
    const directional = source();
    expect(directional[0]).toBe(0);
    expect(directional[1]).toBeGreaterThan(0.1);
    expect(output()[1]).toBeGreaterThan(0.0005);
    scene.light.color = Color.BLACK;
    render();
    expect(source().slice(0, 3)).toEqual([0, 0, 0]);
    const lights = new SceneGISLightCollection({ scene });
    lights.add(
      new SceneGISPointLight({
        position: point(0, -1, 3),
        range: 10,
        intensity: 100,
      }),
    );
    render();
    expect(source()[1]).toBeGreaterThan(0.1);
    expect(output()[1]).toBeGreaterThan(0.0005);
  });
  it("does not light unlit receivers", async function () {
    setup();
    scene.world.show = false;
    await models(false, true);
    expect(output().slice(0, 3)).toEqual([0, 0, 0]);
  });
  it("lets an unlit opaque blocker occlude an emissive source", async function () {
    setup();
    scene.world.show = false;
    await models();
    const first = output()[0];
    const matrix = Matrix4.fromScale(new Cartesian3(12, 0.2, 4));
    Matrix4.setTranslation(matrix, new Cartesian3(0, 0.8, 2), matrix);
    Matrix4.multiply(transform, matrix, matrix);
    const black = new CustomShader({
      lightingModel: LightingModel.UNLIT,
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { m.diffuse=vec3(0.0); }",
    });
    try {
      const blocker = scene.primitives.add(
        await Model.fromGltfAsync({
          url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
          modelMatrix: matrix,
          customShader: black,
          imageBasedLighting: ibl,
        }),
      );
      await pollToPromise(() => {
        render();
        return blocker.ready && blocker._drawCommandsBuilt;
      });
      render();
      expect(output()[0]).toBeLessThan(first * 0.5);
    } finally {
      black.destroy();
    }
  });
  it("shares MRT with AO and SSR without a geometry prepass", async function () {
    setup();
    scene.world.show = false;
    await models();
    const first = output();
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(output()).toEqualEpsilon(first, 0.0001);
    expect(
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion
        .prepassDraws,
    ).toBe(0);
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    render();
    expect(output()).toEqualEpsilon(first, 0.0001);
    expect(ssr._state.captureDraws).toBe(0);
    expect(ssr._state.mainDraws).toBe(2);
    expect(ssr._state.main.framebuffer.numberOfColorAttachments).toBe(7);
  });
  it("preserves finite range and linear model styling and rejects MSAA", async function () {
    setup();
    scene.world.show = false;
    const { floor } = await models();
    const original = output()[0];
    effect.radius = 0.05;
    render();
    expect(output()[0]).toBeLessThan(original * 0.05);
    effect.radius = 8;
    floor.color = new Color(0.5, 0.5, 0.5, 1);
    floor.colorBlendMode = ColorBlendMode.HIGHLIGHT;
    render();
    expect(output()[0]).toBeLessThan(original * 0.6);
    expect(output()[0]).toBeGreaterThan(original * 0.4);
    const material = effect._state.main;
    scene.msaaSamples = 4;
    expect(render).toThrowDeveloperError();
    expect(effect._state.main).toBe(material);
    scene.msaaSamples = 1;
    render();
    expect(output()[0]).toBeGreaterThan(0.001);
  });
  it("does not change pixels when disabled or intensity is zero and releases resources", async function () {
    setup();
    scene.world.show = false;
    await models();
    effect.enabled = false;
    render();
    const off = pixel(point(0, 0, 0.01));
    expect(effect.ready).toBe(false);
    effect.enabled = true;
    effect.intensity = 0;
    render();
    expect(pixel(point(0, 0, 0.01))).toEqual(off);
    const old = effect._state.estimate.getColorTexture();
    effect.resolutionScale = 1;
    render();
    expect(old.isDestroyed()).toBe(true);
    const current = effect._state.result.getColorTexture(),
      material = effect._state.main.ssil.getColorTexture();
    effect.destroy();
    expect(current.isDestroyed()).toBe(true);
    expect(material.isDestroyed()).toBe(true);
    render();
    expect(pixel(point(0, 0, 0.01))).toEqual(off);
  });
  it("splits clearcoat SSR and indirect screen outputs without replaying geometry", async function () {
    setup();
    scene.world.show = false;
    await models(true);
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    render();
    expect(ssr._state.main.split).toBe(true);
    expect(ssr._state.captureDraws).toBe(0);
    expect(ssr._state.main.framebuffer.numberOfColorAttachments).toBe(7);
    expect(ssr._state.main.auxiliaryFramebuffer.numberOfColorAttachments).toBe(
      3,
    );
    expect(effect.ready).toBe(true);
    expect(output().every(Number.isFinite)).toBe(true);
    expect(output()[0]).toBeGreaterThan(0);
    expect(scene._sceneGISDeferred.drawCount).toBe(2);
    expect(scene._sceneGISDeferred.materialExtensionDrawCount).toBe(0);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    expect(ssr._state.main.auxiliaryFramebuffer.numberOfColorAttachments).toBe(
      4,
    );
    expect(effect.ready).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("publishes standalone opaque radiance to water without replay", async function () {
    setup();
    scene.world.show = false;
    await models();
    const water = scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: new PolygonHierarchy([
          new Cartesian3(-3, -4, 0),
          new Cartesian3(3, -4, 0),
          new Cartesian3(3, 1, 0),
          new Cartesian3(-3, 1, 0),
        ]),
        modelMatrix: Matrix4.multiplyByTranslation(
          transform,
          new Cartesian3(0, 0, 0.1),
          new Matrix4(),
        ),
        waveAmplitude: 0,
        foamIntensity: 0,
      }),
    );
    await pollToPromise(() => {
      render();
      return water.ready && scene.frameState._sceneGISWater.ready;
    });
    const frame = scene.frameState._sceneGISWater;
    expect(frame.borrowed).toBe(true);
    expect(frame.raw).toBeUndefined();
    expect(frame.colorTexture).toBe(
      effect._state.main.radiance.getColorTexture(),
    );
    expect(frame.depthTexture).toBe(effect._state.depth.getColorTexture());
    expect(effect._state.mainDraws).toBe(2);
  });
});
