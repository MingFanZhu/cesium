import {
  Axis,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  CustomShader,
  CustomShaderMode,
  CustomShaderTranslucencyMode,
  DirectionalLight,
  FramebufferManager,
  HeadingPitchRange,
  ImageBasedLighting,
  LightingModel,
  Matrix4,
  Model,
  OrthographicFrustum,
  PerspectiveFrustum,
  PixelDatatype,
  TextureUniform,
  UniformType,
  VaryingType,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredCustomShader", function () {
  let scene, renderer, ibl;
  const shaders = [];
  function render() {
    scene.renderForSpecs();
  }
  beforeEach(function () {
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
    scene.logarithmicDepthBuffer = false;
    scene.farToNearRatio = 10000;
    ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(0, 0),
    });
    renderer = scene._sceneGISDeferred;
  });
  afterEach(function () {
    scene?.destroyForSpecs();
    for (const shader of shaders.splice(0)) {
      if (!shader.isDestroyed()) {
        shader.destroy();
      }
    }
    ibl?.destroy();
    scene = renderer = ibl = undefined;
  });
  function shader(options) {
    const value = new CustomShader(options);
    shaders.push(value);
    return value;
  }
  async function model(customShader, z = 0, alphaMode = "OPAQUE") {
    const value = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        customShader,
        imageBasedLighting: ibl,
        environmentMapOptions: { enabled: false },
        // The fixture's root node already supplies its Y-up conversion.
        // Keep model X aligned with world X for deformation assertions.
        forwardAxis: Axis.X,
        modelMatrix: Matrix4.multiplyByUniformScale(
          Matrix4.fromTranslation(new Cartesian3(7000000, 0, z)),
          3,
          new Matrix4(),
        ),
        gltfCallback(gltf) {
          gltf.materials[0].alphaMode = alphaMode;
          gltf.materials[0].alphaCutoff = 0.5;
        },
      }),
    );
    await pollToPromise(() => {
      render();
      return value.ready;
    });
    render();
    return value;
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
  function composite(x = 32) {
    return sample(scene.postProcessStages._tonemapping._colorTexture, x);
  }
  function solid(
    color,
    translucencyMode = CustomShaderTranslucencyMode.INHERIT,
    lightingModel = LightingModel.UNLIT,
  ) {
    return shader({
      lightingModel,
      translucencyMode,
      fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        material.diffuse = vec3(${color}); material.alpha = 0.5;
        material.specular = vec3(0.0); material.emissive = vec3(0.0);
        material.normalEC = vec3(0.0, 0.0, 1.0);
      }`,
    });
  }
  [CustomShaderMode.MODIFY_MATERIAL, CustomShaderMode.REPLACE_MATERIAL].forEach(
    (mode) => {
      it(`captures texture and live uniforms before lighting in material mode ${mode}`, async function () {
        const custom = shader({
          mode,
          lightingModel: LightingModel.PBR,
          uniforms: {
            u_tint: { type: UniformType.FLOAT, value: 0.5 },
            u_tex: {
              type: UniformType.SAMPLER_2D,
              value: new TextureUniform({
                typedArray: new Uint8Array([51, 102, 153, 255]),
                width: 1,
                height: 1,
              }),
            },
          },
          fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          material.diffuse = texture(u_tex, fsInput.attributes.texCoord_0).rgb * u_tint;
          material.specular = vec3(0.0); material.roughness = 0.6;
          material.occlusion = 0.75; material.emissive = vec3(0.1, 0.0, 0.0);
          material.normalEC = vec3(0.0, 0.0, 1.0);
        }`,
        });
        const value = await model(custom);
        const texture = custom.uniformMap.u_tex();
        const raw = renderer._raw.getColorTexture();
        expect(sample(raw)).toEqualEpsilon([0.1, 0.2, 0.3, 0.75], 0.001);
        expect(renderer.drawCount).toBe(1);
        const bytes = renderer.byteLength;
        const before = composite();
        scene.light.intensity = 0;
        render();
        expect(sample(raw)).toEqualEpsilon([0.1, 0.2, 0.3, 0.75], 0.001);
        expect(composite()[1]).toBeLessThan(before[1]);
        expect(composite()[0]).toEqualEpsilon(0.1, 0.002);
        custom.setUniform("u_tint", 1);
        render();
        expect(sample(raw)).toEqualEpsilon([0.2, 0.4, 0.6, 0.75], 0.001);
        expect(renderer.byteLength).toBe(bytes);
        custom.setUniform(
          "u_tex",
          new TextureUniform({
            typedArray: new Uint8Array([153, 51, 102, 255]),
            width: 1,
            height: 1,
          }),
        );
        render();
        expect(sample(raw)).toEqualEpsilon([0.6, 0.2, 0.4, 0.75], 0.001);
        expect(texture.isDestroyed()).toBe(true);
        const currentTexture = custom.uniformMap.u_tex();
        scene.primitives.remove(value);
        render();
        expect(raw.isDestroyed()).toBe(true);
        expect(custom.isDestroyed()).toBe(false);
        expect(currentTexture.isDestroyed()).toBe(false);
        custom.destroy();
        expect(currentTexture.isDestroyed()).toBe(true);
        expect(scene.context._gl.getError()).toBe(0);
      });
    },
  );
  [false, true].forEach((logDepth) => {
    it(`keeps vertex deformation, varyings and discard consistent with picking (log ${logDepth})`, async function () {
      scene.logarithmicDepthBuffer = logDepth;
      const custom = shader({
        lightingModel: LightingModel.UNLIT,
        uniforms: { u_shift: { type: UniformType.FLOAT, value: 0 } },
        varyings: { v_localX: VaryingType.FLOAT },
        vertexShaderText: `void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
          v_localX = vsInput.attributes.positionMC.x;
          vsOutput.positionMC.x += u_shift;
        }`,
        fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          if (v_localX < 0.0) { discard; }
          material.diffuse = vec3(0.2, 0.7, 0.1);
        }`,
      });
      const value = await model(custom);
      expect(sample(renderer._raw.getColorTexture(2), 28)[3]).toBe(0);
      expect(scene.pick(new Cartesian2(28, 32))).toBeUndefined();
      expect(scene.pick(new Cartesian2(36, 32)).primitive).toBe(value);
      custom.setUniform("u_shift", 0.5);
      render();
      expect(sample(renderer._raw.getColorTexture(2), 36)[3]).toBe(0);
      expect(composite(52).slice(0, 3)).toEqualEpsilon([0.2, 0.7, 0.1], 0.001);
      expect(scene.pick(new Cartesian2(36, 32))).toBeUndefined();
      expect(scene.pick(new Cartesian2(52, 32)).primitive).toBe(value);
      render();
      const position = scene.pickPosition(new Cartesian2(52, 32));
      expect(position.x).toBeGreaterThan(7000002);
      expect(position.z).toEqualEpsilon(1.5, 0.02);
      expect(renderer.drawCount).toBe(1);
      expect(scene.context._gl.getError()).toBe(0);
    });
  });
  it("keeps forced translucent CustomShader in forward OIT and respects opaque depth", async function () {
    const background = await model(solid("0.0, 0.0, 1.0"));
    const red = await model(
      solid(
        "1.0, 0.0, 0.0",
        CustomShaderTranslucencyMode.TRANSLUCENT,
        LightingModel.PBR,
      ),
      3,
    );
    const green = await model(
      solid("0.0, 1.0, 0.0", CustomShaderTranslucencyMode.TRANSLUCENT),
      4,
    );
    expect(scene._view.oit.isSupported()).toBe(true);
    expect(renderer.drawCount).toBe(1);
    expect(sample(renderer._raw.getColorTexture()).slice(0, 3)).toEqualEpsilon(
      [0, 0, 1],
      0.001,
    );
    const both = composite();
    expect(both[0]).toBeGreaterThan(0.01);
    expect(both[1]).toBeGreaterThan(0.01);
    expect(both[2]).toBeGreaterThan(0.01);
    scene.primitives.raiseToTop(red);
    render();
    expect(composite()).toEqualEpsilon(both, 0.003);
    scene.light.intensity = 0;
    render();
    expect(composite()[0]).toBeLessThan(both[0] * 0.1);
    expect(composite()[1]).toEqualEpsilon(both[1], 0.003);
    background.modelMatrix = Matrix4.multiplyByUniformScale(
      Matrix4.fromTranslation(new Cartesian3(7000000, 0, 6)),
      3,
      new Matrix4(),
    );
    render();
    expect(composite().slice(0, 3)).toEqualEpsilon([0, 0, 1], 0.002);
    expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(background);
    expect(red.customShader.isDestroyed()).toBe(false);
    expect(green.customShader.isDestroyed()).toBe(false);
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("rebuilds opaque, translucent and removed shader variants without stale material groups", async function () {
    const opaque = solid("0.8, 0.1, 0.2", CustomShaderTranslucencyMode.OPAQUE);
    const value = await model(opaque, 0, "BLEND");
    expect(renderer.drawCount).toBe(1);
    expect(composite().slice(0, 3)).toEqualEpsilon([0.8, 0.1, 0.2], 0.001);
    const raw = renderer._raw.getColorTexture();
    const translucent = solid(
      "0.1, 0.8, 0.2",
      CustomShaderTranslucencyMode.TRANSLUCENT,
    );
    value.customShader = translucent;
    render();
    expect(renderer.drawCount).toBe(0);
    expect(renderer._models.size).toBe(0);
    expect(renderer._raw.getColorTexture()).toBe(raw);
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(0);
    expect(composite()[1]).toBeGreaterThan(0.1);
    value.customShader = opaque;
    render();
    expect(renderer.drawCount).toBe(1);
    expect(composite().slice(0, 3)).toEqualEpsilon([0.8, 0.1, 0.2], 0.001);
    value.customShader = undefined;
    render();
    expect(renderer.drawCount).toBe(0);
    expect(opaque.isDestroyed()).toBe(false);
    expect(translucent.isDestroyed()).toBe(false);
    expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(value);
    expect(scene.context._gl.getError()).toBe(0);
  });
  it("preserves Tileset feature inputs and identity when replacing and removing CustomShader", async function () {
    const origin = Cartesian3.fromRadians(-1.31968, 0.698874);
    scene.camera.frustum = new PerspectiveFrustum({
      near: 1,
      far: 500,
      fov: Math.PI / 3,
      aspectRatio: 1,
    });
    scene.camera.lookAt(origin, new HeadingPitchRange(0, -1.57, 100));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    const custom = shader({
      mode: CustomShaderMode.REPLACE_MATERIAL,
      lightingModel: LightingModel.UNLIT,
      uniforms: { u_selected: { type: UniformType.INT, value: -1 } },
      fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        material.diffuse = fsInput.featureIds.featureId_0 == u_selected ? vec3(0.9, 0.1, 0.2) : vec3(0.1, 0.7, 0.2);
      }`,
    });
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        "./Data/Cesium3DTiles/Batched/BatchedWithBatchTable/tileset.json",
        {
          customShader: custom,
          imageBasedLighting: ibl,
          environmentMapOptions: { enabled: false },
        },
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
    const point = new Cartesian2(32, 32);
    const feature = scene.pick(point);
    expect(feature.content).toBe(tileset.root.content);
    expect(composite().slice(0, 3)).toEqualEpsilon([0.1, 0.7, 0.2], 0.002);
    custom.setUniform("u_selected", feature.featureId);
    render();
    expect(composite().slice(0, 3)).toEqualEpsilon([0.9, 0.1, 0.2], 0.002);
    expect(scene.pick(point)).toBe(feature);
    tileset.customShader = solid("0.2, 0.1, 0.8");
    render();
    expect(composite().slice(0, 3)).toEqualEpsilon([0.2, 0.1, 0.8], 0.002);
    expect(scene.pick(point)).toBe(feature);
    tileset.customShader = undefined;
    render();
    expect(scene.pick(point)).toBe(feature);
    scene.primitives.remove(tileset);
    render();
    expect(renderer._models.size).toBe(0);
    expect(custom.isDestroyed()).toBe(false);
    expect(scene.context._gl.getError()).toBe(0);
  });
});
