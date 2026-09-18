import {
  _SceneGISSkyReflections as SceneGISSkyReflections,
  Cartesian2,
  Cartesian3,
  Color,
  CustomShader,
  DirectionalLight,
  Framebuffer,
  ImageBasedLighting,
  JulianDate,
  Matrix3,
  Matrix4,
  Model,
  PixelDatatype,
  PixelFormat,
  ShaderSource,
  Texture,
  Texture3D,
  Transforms,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISSkyReflections", function () {
  let scene;
  let probe;
  let renderer;
  let textures;
  const time = JulianDate.fromIso8601("2026-06-21T12:00:00Z");

  function texture(color, volume = false) {
    const values = new Float32Array(4 * (volume ? 8 : 4));
    for (let i = 0; i < values.length; i += 4) {
      values.set(color, i);
    }
    const result = new (volume ? Texture3D : Texture)({
      context: scene.context,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      source: { width: 2, height: 2, depth: 2, arrayBufferView: values },
    });
    textures.push(result);
    return result;
  }

  beforeEach(function () {
    scene = createScene();
    textures = [];
    renderer = {
      _mode: "planar",
      _frame: {
        altitude: 10,
        east: Cartesian3.clone(Cartesian3.UNIT_X),
        north: Cartesian3.clone(Cartesian3.UNIT_Y),
        vertical: Cartesian3.clone(Cartesian3.UNIT_Z),
      },
      _sunDirection: Cartesian3.clone(Cartesian3.UNIT_Z),
      _resources: {
        transmittanceTexture: texture([0.8, 0.8, 0.8, 1]),
        scatteringTexture: texture([32, 16, 8, 0], true),
        irradianceTexture: texture([1, 1, 1, 1]),
      },
    };
    probe = new SceneGISSkyReflections(renderer);
    scene.initializeFrame();
  });
  afterEach(function () {
    if (!probe.isDestroyed()) {
      probe.destroy();
    }
    for (const item of textures) {
      item.destroy();
    }
    scene.destroyForSpecs();
  });

  function sample(direction, lod = 0) {
    const target = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
    });
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [target],
    });
    const command = scene.context.createViewportQuadCommand(
      new ShaderSource({
        sources: [
          `uniform samplerCube u_cube; uniform vec3 u_direction; uniform float u_lod; void main() { out_FragColor = textureLod(u_cube, u_direction, u_lod); }`,
        ],
      }),
      {
        framebuffer,
        uniformMap: {
          u_cube: () => probe.texture,
          u_direction: () => direction,
          u_lod: () => lod,
        },
      },
    );
    try {
      command.execute(scene.context);
      return Array.from(
        scene.context.readPixels({ framebuffer, width: 1, height: 1 }),
      );
    } finally {
      command.shaderProgram.destroy();
      framebuffer.destroy();
    }
  }

  ["planar", "globe"].forEach((mode) => {
    it(`captures ${mode} HDR radiance and all GGX levels without clipping, and filters the horizon`, function () {
      renderer._mode = mode;
      probe.update(scene.frameState);
      const up = sample(Cartesian3.UNIT_Z);
      const down = sample(new Cartesian3(0, 0, -1));
      expect(up.every(Number.isFinite)).toBe(true);
      expect(up[0]).toBeGreaterThan(1);
      expect(up[0]).toBeGreaterThan(down[0]);
      const rough = sample(Cartesian3.UNIT_Z, 7);
      expect(Math.abs(rough[0] - up[0])).toBeGreaterThan(0.1);
      expect(rough.every(Number.isFinite)).toBe(true);
      const x = sample(new Cartesian3(1, 0, 0.1));
      const y = sample(new Cartesian3(0, 1, 0.1));
      expect(x[0]).toEqualEpsilon(y[0], 0.05);
      for (let lod = 0; lod <= 7; lod++) {
        expect(sample(Cartesian3.UNIT_Z, lod)[3]).toEqualEpsilon(1, 0.01);
      }
    });
  });

  it("reuses static maps, updates for sun/altitude/frame/LUT changes, and releases every owned target", function () {
    expect(probe.texture).toBeUndefined();
    probe.update(scene.frameState);
    const cube = probe.texture;
    const frames = [...probe._frames, ...probe._sourceFrames];
    const programs = probe._commands.map((command) => command.shaderProgram);
    probe.update(scene.frameState);
    expect(probe.generation).toBe(1);
    renderer._frame.altitude += 10;
    probe.update(scene.frameState);
    expect(probe.generation).toBe(1);
    renderer._frame.altitude += 101;
    probe.update(scene.frameState);
    expect(probe.generation).toBe(2);
    renderer._sunDirection = new Cartesian3(0, 0, -1);
    probe.update(scene.frameState);
    expect(probe.generation).toBe(3);
    renderer._frame.east = Cartesian3.UNIT_Y;
    renderer._frame.north = new Cartesian3(-1, 0, 0);
    probe.update(scene.frameState);
    expect(probe.generation).toBe(4);
    expect(
      Matrix3.multiplyByVector(
        probe.worldToLocal,
        Cartesian3.UNIT_Y,
        new Cartesian3(),
      ),
    ).toEqual(Cartesian3.UNIT_X);
    renderer._resources = { ...renderer._resources };
    probe.update(scene.frameState);
    expect(probe.generation).toBe(5);
    expect(probe.texture).toBe(cube);
    probe.destroy();
    expect(cube.isDestroyed()).toBe(true);
    expect(frames.every((frame) => frame.isDestroyed())).toBe(true);
    // ShaderCache retains released programs until its normal sweep.
    expect(programs.every((program) => program._cachedShader.count === 0)).toBe(
      true,
    );
  });

  it("keeps the readable night floor when physical scattering disappears", function () {
    renderer._resources.scatteringTexture = texture([0, 0, 0, 0], true);
    renderer._resources.irradianceTexture = texture([0, 0, 0, 1]);
    probe.update(scene.frameState);
    expect(sample(Cartesian3.UNIT_Z)[2]).toEqual(0);
    renderer._sunDirection = new Cartesian3(0, 0, -1);
    probe.update(scene.frameState);
    const night = sample(Cartesian3.UNIT_Z);
    expect(night[2]).toBeGreaterThan(night[0]);
    expect(night[0]).toBeGreaterThan(0);
  });

  [true, false].forEach((planar) => {
    it(`uses native ${planar ? "Planar" : "Globe"} PBR with world-fixed reflections and authored source precedence`, async function () {
      renderer._mode = planar ? "planar" : "globe";
      const recordKey = planar
        ? "_sceneGISPlanarLighting"
        : "_sceneGISGlobeLighting";
      scene.highDynamicRange = true;
      scene.fog.enabled = false;
      scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
      scene.light = new DirectionalLight({
        direction: new Cartesian3(0, 0, -1),
        color: Color.BLACK,
      });
      const origin = planar
        ? new Cartesian3(20000000, -30000000, 100)
        : Cartesian3.fromDegrees(0, 0, 100);
      const matrix = planar
        ? Matrix4.fromTranslation(origin)
        : Transforms.eastNorthUpToFixedFrame(origin);
      const shader = new CustomShader({
        fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(0.0); material.specular = vec3(1.0); material.roughness = 0.15; }`,
      });
      const ibl = new ImageBasedLighting({
        imageBasedLightingFactor: new Cartesian2(0, 1),
      });
      let model;
      try {
        model = scene.primitives.add(
          await Model.fromGltfAsync({
            url: "./Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
            modelMatrix: matrix,
            customShader: shader,
            imageBasedLighting: ibl,
          }),
        );
        const direction = Matrix4.multiplyByPointAsVector(
          matrix,
          new Cartesian3(0, 0, -1),
          new Cartesian3(),
        );
        const up = Matrix4.multiplyByPointAsVector(
          matrix,
          Cartesian3.UNIT_Y,
          new Cartesian3(),
        );
        scene.camera.setView({
          destination: Cartesian3.subtract(
            origin,
            Cartesian3.multiplyByScalar(direction, 3, new Cartesian3()),
            new Cartesian3(),
          ),
          orientation: { direction, up },
        });
        scene.camera.frustum.near = 0.1;
        scene.frameState[recordKey] = {
          active: true,
          skyReflections: probe,
          surfaceRadianceScale: 0.2,
          ...renderer._resources,
          atlasTexture: renderer._resources.transmittanceTexture,
          matrices: [Matrix4.IDENTITY, Matrix4.IDENTITY, Matrix4.IDENTITY],
          intervals: [
            new Cartesian2(0, 1),
            new Cartesian2(0, 1),
            new Cartesian2(0, 1),
          ],
          cascadeCount: 1,
          showCloudShadows: false,
          primaryLightDirection: Cartesian3.UNIT_Z,
          primaryLightScale: Cartesian3.ZERO,
          sunDirection: Cartesian3.UNIT_Z,
          cloudTop: 4000,
          cameraRelativePosition: new Cartesian3(0, 0, 100),
        };
        function pixel() {
          scene.renderForSpecs(time);
          return Array.from(
            scene.context.readPixels({
              x: Math.floor(scene.context.drawingBufferWidth / 2),
              y: Math.floor(scene.context.drawingBufferHeight / 2),
              width: 1,
              height: 1,
            }),
          );
        }
        await pollToPromise(
          () => {
            scene.renderForSpecs(time);
            return model.ready;
          },
          { timeout: 30000 },
        );
        const reflected = pixel();
        expect(model._sceneGISSkyReflections).toBe(probe);
        expect(reflected[0]).toBeGreaterThan(0);
        expect(model.environmentMapManager.radianceCubeMap).toBeUndefined();
        const generation = probe.generation;
        model.referenceMatrix = Matrix4.fromRotationTranslation(
          Matrix3.fromRotationY(Math.PI / 2),
          origin,
        );
        expect(pixel()).toEqualEpsilon(reflected, 2);
        expect(probe.generation).toBe(generation);
        ibl.imageBasedLightingFactor = Cartesian2.ZERO;
        const unlit = pixel();
        expect(unlit[0]).toBeLessThan(reflected[0]);
        ibl.imageBasedLightingFactor = new Cartesian2(0, 1);
        expect(pixel()).toEqualEpsilon(reflected, 2);
        const mapUrl = "./Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2";
        ibl.specularEnvironmentMaps = mapUrl;
        await pollToPromise(
          () => {
            pixel();
            return ibl.specularEnvironmentCubeMap?.ready;
          },
          { timeout: 30000 },
        );
        expect(model._sceneGISSkyReflections).toBeUndefined();
        expect(pixel()).not.toEqual(reflected);
        ibl.specularEnvironmentMaps = undefined;
        expect(pixel()).toEqualEpsilon(reflected, 2);
        scene.specularEnvironmentMaps = mapUrl;
        await pollToPromise(
          () => {
            pixel();
            return !!scene.frameState.specularEnvironmentMaps;
          },
          { timeout: 30000 },
        );
        const sceneMapPixel = pixel();
        expect(model._sceneGISSkyReflections).toBeUndefined();
        expect(sceneMapPixel[0]).toBeGreaterThan(0);
        expect(sceneMapPixel).not.toEqual(reflected);
        scene.specularEnvironmentMaps = undefined;
        await pollToPromise(() => {
          pixel();
          return !scene.frameState.specularEnvironmentMaps;
        });
        expect(pixel()).toEqualEpsilon(reflected, 2);
        model.environmentMapManager.enabled = false;
        pixel();
        expect(model._sceneGISSkyReflections).toBeUndefined();
        model.environmentMapManager.enabled = true;
        expect(pixel()).toEqualEpsilon(reflected, 2);
        delete scene.frameState[recordKey];
        pixel();
        expect(model._sceneGISSkyReflections).toBeUndefined();
        expect(probe.isDestroyed()).toBe(false);
      } finally {
        shader.destroy();
        ibl.destroy();
      }
    });
  });
});
