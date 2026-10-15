import {
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  Cesium3DTileStyle,
  ClearCommand,
  Color,
  Cesium3DTileColorBlendMode,
  DirectionalLight,
  DrawCommand,
  FramebufferManager,
  HeadingPitchRange,
  ImageBasedLighting,
  Matrix4,
  Pass,
  PixelDatatype,
  SceneGISScreenSpaceReflections,
  SceneGISScreenSpaceIndirectLighting,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredPointCloud", function () {
  let scene, ibl;
  function render() {
    scene.renderForSpecs();
  }
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.logarithmicDepthBuffer = false;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.farToNearRatio = 10000;
    ibl = new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(1, 0),
      sphericalHarmonicCoefficients: Array.from(
        { length: 9 },
        (_, i) =>
          new Cartesian3(i === 0 ? 1 : 0, i === 0 ? 1 : 0, i === 0 ? 1 : 0),
      ),
    });
  });
  afterEach(function () {
    scene?.destroyForSpecs();
    ibl.destroy();
    scene = undefined;
  });
  async function tiles(kind) {
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        `./Data/Cesium3DTiles/PointCloud/${kind}/tileset.json`,
        { imageBasedLighting: ibl, environmentMapOptions: { enabled: false } },
      ),
    );
    scene.camera.lookAt(
      tileset.boundingSphere.center,
      new HeadingPitchRange(0, -0.6, 18),
    );
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 100;
    scene.light = new DirectionalLight({
      direction: Cartesian3.clone(scene.camera.directionWC),
      intensity: 2,
    });
    tileset.style = new Cesium3DTileStyle({
      color: "rgb(153, 89, 51)",
      pointSize: 5,
    });
    await pollToPromise(
      () => {
        render();
        return (
          tileset.tilesLoaded &&
          scene.frameState.commandList.some(
            (c) => c.pass === Pass.CESIUM_3D_TILE,
          )
        );
      },
      { timeout: 30000 },
    );
    render();
    return tileset;
  }
  function pixels(texture) {
    const layer = texture._sceneGISArrayLayer;
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 64, 64);
    const copy = scene.context.createViewportQuadCommand(
      `uniform highp ${layer === undefined ? "sampler2D" : "sampler2DArray"} u_texture; void main() {out_FragColor=texelFetch(u_texture,${layer === undefined ? "ivec2(gl_FragCoord.xy)" : `ivec3(gl_FragCoord.xy, ${layer})`},0);}`,
      {
        framebuffer: target.framebuffer,
        uniformMap: { u_texture: () => texture },
      },
    );
    try {
      copy.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: target.framebuffer,
          width: 64,
          height: 64,
        }),
      );
    } finally {
      copy.shaderProgram.destroy();
      target.destroy();
    }
  }
  function hdr() {
    return pixels(scene._sceneGISDeferred._source.getColorTexture(0));
  }
  function coverage() {
    return pixels(scene._sceneGISDeferred._raw.getColorTexture(2));
  }
  function occupied() {
    return coverage().reduce((n, v, i) => n + Number(i % 4 === 3 && v > 0), 0);
  }
  function expectNative() {
    const actual = hdr();
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      depthStencil: true,
      supportsDepthTexture: true,
    });
    target.update(scene.context, 64, 64);
    try {
      new ClearCommand({
        color: Color.TRANSPARENT,
        depth: 1,
        stencil: 0,
        framebuffer: target.framebuffer,
      }).execute(scene.context);
      for (const source of scene.frameState.commandList.filter(
        (c) => c.pass === Pass.CESIUM_3D_TILE,
      )) {
        const command = DrawCommand.shallowClone(
          source.derivedCommands.hdr.command,
        );
        command.framebuffer = target.framebuffer;
        command.execute(scene.context);
      }
      const expected = pixels(target.getColorTexture());
      const mask = coverage();
      let count = 0,
        error = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if (mask[i + 3] > 0) {
          ++count;
          for (let c = 0; c < 3; ++c) {
            error = Math.max(error, Math.abs(actual[i + c] - expected[i + c]));
          }
        }
      }
      expect(count).toBeGreaterThan(30);
      expect(error).toBeLessThan(0.006);
    } finally {
      target.destroy();
    }
  }
  it("preserves per-point color, show, point size, transparency and picking", async function () {
    const tileset = await tiles("PointCloudWithPerPointProperties");
    expectNative();
    const count = occupied();
    const mask = coverage();
    const at = mask.findIndex((v, i) => i % 4 === 3 && v > 0);
    const pixel = at >> 2;
    const picked = scene.pick(
      new Cartesian2(pixel % 64, 63 - Math.floor(pixel / 64)),
    );
    expect(picked).toBeDefined();
    expect(picked.content).toBe(tileset.root.content);
    tileset.style = new Cesium3DTileStyle({
      color: "rgb(51, 128, 204)",
      pointSize: 1,
    });
    render();
    expect(occupied()).toBeLessThan(count);
    expectNative();
    tileset.style = new Cesium3DTileStyle({ show: false });
    render();
    expect(occupied()).toBe(0);
    tileset.style = new Cesium3DTileStyle({
      color: "rgba(153, 89, 51, 0.4)",
      pointSize: 5,
    });
    render();
    expect(
      scene.frameState.commandList.some((c) => c.pass === Pass.TRANSLUCENT),
    ).toBe(true);
    expect(occupied()).toBe(0);
    tileset.style = undefined;
    render();
    expectNative();
  });
  it("applies point color gamma after PBR and composes AO before that transform", async function () {
    const tileset = await tiles("PointCloudNormals");
    expectNative();
    const model = tileset.root.content._model;
    model.color = new Color(0.3, 0.7, 0.0, 1);
    tileset.colorBlendMode = Cesium3DTileColorBlendMode.MIX;
    tileset.colorBlendAmount = 0.35;
    render();
    expectNative();
    const ao = scene.postProcessStages.ambientOcclusion;
    ao.enabled = true;
    ao.uniforms.lengthCap = 3;
    ao.uniforms.directionCount = 8;
    ao.uniforms.stepCount = 8;
    render();
    const state = ao._sceneGISAmbientOcclusion;
    expect(state.mainPass).toBe(true);
    const renderer = scene._sceneGISDeferred;
    expect(renderer.colorCorrectionDrawCount).toBe(1);
    expect(renderer.materialExtensionDrawCount).toBe(0);
    const actual = hdr(),
      baseline = pixels(state.main.color),
      indirect = pixels(state.main.indirect.getColorTexture()),
      visibility = pixels(state.filtered.getColorTexture()),
      mask = coverage();
    const uniforms = renderer._groups[0].command.uniformMap;
    const tint = uniforms.model_color();
    const blend = uniforms.model_colorBlend();
    let maxError = 0,
      darkened = 0,
      debug;
    for (let i = 0; i < actual.length; i += 4) {
      if (mask[i + 3] <= 0) {
        continue;
      }
      for (let c = 0; c < 3; ++c) {
        const constant = [tint.red, tint.green, tint.blue][c] * blend;
        const response = 1 - blend;
        const linear = Math.pow(
          Math.max((baseline[i + c] - constant) / response, 0),
          1 / scene.gamma,
        );
        const delta = (visibility[i] - 1) * indirect[i + c];
        const expected =
          response *
            Math.pow(Math.max(linear + delta / response, 0), scene.gamma) +
          constant;
        if (Math.abs(expected - actual[i + c]) > maxError) {
          maxError = Math.abs(expected - actual[i + c]);
          debug = {
            i,
            c,
            expected,
            actual: actual[i + c],
            baseline: baseline[i + c],
            response,
            constant,
            delta,
            visibility: visibility[i],
            indirect: indirect[i + c],
            tint,
            blend,
          };
        }
        if (expected < baseline[i + c] - 0.005) {
          ++darkened;
        }
      }
    }
    expect(maxError).withContext(JSON.stringify(debug)).toBeLessThan(0.006);
    expect(darkened).toBeGreaterThan(5);
    tileset.colorBlendMode = Cesium3DTileColorBlendMode.REPLACE;
    render();
    expect(hdr().every(Number.isFinite)).toBe(true);
    const old = state.main;
    tileset.style = undefined;
    render();
    expect(renderer.colorCorrectionDrawCount).toBe(0);
    expect(old.pointCommands.size).toBe(0);
  });
  it("keeps point-center coordinates finite at large view distances", async function () {
    const tileset = await tiles("PointCloudNormals");
    const center = Cartesian3.clone(tileset.boundingSphere.center);
    const scale = Matrix4.fromUniformScale(100000);
    const offset = Cartesian3.multiplyByScalar(
      center,
      -99999,
      new Cartesian3(),
    );
    tileset.modelMatrix = Matrix4.setTranslation(scale, offset, new Matrix4());
    scene.camera.lookAt(center, new HeadingPitchRange(0, -0.6, 1800000));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.camera.frustum.far = 10000000;
    render();
    expectNative();
    const fields = pixels(
      scene._sceneGISDeferred._extensions.getColorTexture(),
    );
    expect(fields.every(Number.isFinite)).toBe(true);
    expect(fields.every((v) => Math.abs(v) < 5)).toBe(true);
  });
  it("shares AO, SSR and SSIL with styled points without material replay or correction textures", async function () {
    await tiles("PointCloudNormals");
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    const ssil = new SceneGISScreenSpaceIndirectLighting({
      scene,
      enabled: true,
    });
    render();
    expect(ssr.ready).toBe(true);
    expect(ssil.ready).toBe(true);
    expect(ssr._state.captureDraws).toBe(0);
    const renderer = scene._sceneGISDeferred;
    expect(renderer.materialExtensionDrawCount).toBe(0);
    expect(renderer._extensions._colorAttachmentsLength).toBe(1);
    expect(renderer.colorCorrectionDrawCount).toBe(1);
    expect(hdr().every(Number.isFinite)).toBe(true);
    const old = ssr._state.main;
    scene.canvas.width = 80;
    render();
    expect(old.pointCommands.size).toBe(0);
    ssr.destroy();
    ssil.destroy();
    render();
    expect(renderer.colorCorrectionDrawCount).toBe(1);
  });
});
