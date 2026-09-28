import {
  _SceneGISSkyReflections,
  Cartesian2,
  Cartesian3,
  Color,
  CustomShader,
  DirectionalLight,
  Framebuffer,
  JulianDate,
  Matrix4,
  Model,
  PixelDatatype,
  PixelFormat,
  SceneGISReflectionProbe,
  SceneGISReflectionProbeCollection,
  ShaderSource,
  ShadowMode,
  Texture,
  Texture3D,
  Transforms,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISReflectionProbe", function () {
  let scene, collection, sky, resources, frame, record, shaders;
  const time = JulianDate.fromIso8601("2026-06-21T12:00:00Z");
  function render() {
    scene.renderForSpecs(time);
  }
  function texture(color, volume = false) {
    const values = new Float32Array(volume ? 32 : 16);
    for (let i = 0; i < values.length; i += 4) {
      values.set(color, i);
    }
    const result = new (volume ? Texture3D : Texture)({
      context: scene.context,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      source: { width: 2, height: 2, depth: 2, arrayBufferView: values },
    });
    resources.push(result);
    return result;
  }
  function setup(globe = false) {
    scene.shadowMap.enabled = true;
    frame = globe
      ? Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(0, 35, 10))
      : Matrix4.fromTranslation(new Cartesian3(20000000, -30000000, 10));
    const east = Matrix4.multiplyByPointAsVector(
      frame,
      Cartesian3.UNIT_X,
      new Cartesian3(),
    );
    const north = Matrix4.multiplyByPointAsVector(
      frame,
      Cartesian3.UNIT_Y,
      new Cartesian3(),
    );
    const up = Matrix4.multiplyByPointAsVector(
      frame,
      Cartesian3.UNIT_Z,
      new Cartesian3(),
    );
    const renderer = {
      _mode: globe ? "globe" : "planar",
      _frame: { altitude: 10, east, north, vertical: up },
      _sunDirection: up,
      _resources: {
        transmittanceTexture: texture([0.8, 0.8, 0.8, 1]),
        scatteringTexture: texture([2, 3, 4, 0], true),
        irradianceTexture: texture([30, 30, 30, 1]),
      },
    };
    sky = new _SceneGISSkyReflections(renderer);
    record = {
      active: true,
      skyReflections: sky,
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
      primaryLightDirection: up,
      primaryLightScale: Cartesian3.ZERO,
      sunDirection: up,
      cloudTop: 4000,
      cameraRelativePosition: new Cartesian3(0, -4, 10),
    };
    Object.freeze(record);
    scene.frameState[
      globe ? "_sceneGISGlobeLighting" : "_sceneGISPlanarLighting"
    ] = record;
    scene.camera.setView({
      destination: Matrix4.multiplyByPoint(
        frame,
        new Cartesian3(0, -4, 0),
        new Cartesian3(),
      ),
      orientation: { direction: north, up },
    });
    scene.camera.frustum.near = 0.05;
    scene.camera.frustum.far = 100;
  }
  async function model(
    position,
    color,
    scale = Cartesian3.ONE,
    receiver = false,
  ) {
    const shader = new CustomShader({
      fragmentShaderText: receiver
        ? "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { m.diffuse = vec3(0.0); m.specular = vec3(1.0); m.roughness = 0.05; m.clearcoatFactor = 0.0; }"
        : `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { m.diffuse = vec3(0.0); m.specular = vec3(0.0); m.emissive = vec3(${color.join(",")}); m.clearcoatFactor = 0.0; }`,
    });
    shaders.push(shader);
    const matrix = Matrix4.multiply(
      frame,
      Matrix4.fromTranslation(position),
      new Matrix4(),
    );
    Matrix4.multiplyByScale(matrix, scale, matrix);
    const value = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
        modelMatrix: matrix,
        customShader: shader,
        incrementallyLoadTextures: false,
        shadows: ShadowMode.ENABLED,
      }),
    );
    await pollToPromise(
      () => {
        render();
        return value.ready;
      },
      { timeout: 30000 },
    );
    return value;
  }
  function addProbe() {
    return collection.add(
      new SceneGISReflectionProbe({
        modelMatrix: Matrix4.multiply(
          frame,
          Matrix4.fromTranslation(new Cartesian3(0, -2, 0)),
          new Matrix4(),
        ),
        halfSize: new Cartesian3(8, 8, 8),
        maximumDistance: 30,
      }),
    );
  }
  function sample(cubeMap, direction, lod = 0) {
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
          "uniform samplerCube u_cube; uniform vec3 u_direction; uniform float u_lod; void main() { out_FragColor = textureLod(u_cube, u_direction, u_lod); }",
        ],
      }),
      {
        framebuffer,
        uniformMap: {
          u_cube: () => cubeMap,
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
  function pixel() {
    render();
    return Array.from(
      scene.context.readPixels({
        x: Math.floor(scene.context.drawingBufferWidth / 2),
        y: Math.floor(scene.context.drawingBufferHeight / 2),
        width: 1,
        height: 1,
      }),
    );
  }
  beforeEach(function () {
    scene = createScene();
    resources = [];
    shaders = [];
    scene.highDynamicRange = true;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.light = new DirectionalLight({
      direction: new Cartesian3(0, 0, -1),
      color: Color.BLACK,
    });
    collection = new SceneGISReflectionProbeCollection({
      scene,
      resolution: 32,
    });
  });
  afterEach(function () {
    sky?.destroy();
    sky = undefined;
    for (const resource of resources) {
      resource.destroy();
    }
    for (const shader of shaders) {
      shader.destroy();
    }
    scene.destroyForSpecs();
  });

  it("validates immutable rigid placement, capacity, source readiness and ownership", function () {
    expect(() => new SceneGISReflectionProbe({})).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISReflectionProbe({
          modelMatrix: Matrix4.fromUniformScale(2),
          halfSize: Cartesian3.ONE,
        }),
    ).toThrowDeveloperError();
    const create = () =>
      new SceneGISReflectionProbe({
        modelMatrix: Matrix4.IDENTITY,
        halfSize: Cartesian3.ONE,
      });
    const probe = create();
    collection.add(probe);
    collection.add(probe);
    expect(collection.length).toBe(1);
    collection.add(create());
    expect(() => collection.add(create())).toThrowDeveloperError();
    expect(() => collection.capture([{}])).toThrowDeveloperError();
    expect(() => {
      collection.occlusion = 0;
    }).toThrowDeveloperError();
    expect(collection.remove(probe)).toBe(true);
    expect(probe.ready).toBe(false);
    expect(probe._owner).toBeUndefined();
  });

  [false, true].forEach((globe) => {
    it(`captures offscreen ${globe ? "Globe" : "Planar"} geometry, filters roughness, composes PBR and reuses clean maps`, async function () {
      setup(globe);
      const receiver = await model(
        Cartesian3.ZERO,
        [0, 0, 0],
        Cartesian3.ONE,
        true,
      );
      const emitter = await model(
        new Cartesian3(0, -6, 0),
        [5, 0.05, 0.01],
        new Cartesian3(5, 0.5, 5),
      );
      const roof = await model(
        new Cartesian3(0, -2, 3),
        [0.02, 0.02, 0.02],
        new Cartesian3(16, 16, 0.5),
      );
      const probe = addProbe();
      const original = pixel();
      const position = Cartesian3.clone(scene.camera.position);
      const direction = Cartesian3.clone(scene.camera.direction);
      const capture = collection.capture([receiver, emitter, roof]);
      render();
      await capture;
      expect(probe.ready).toBe(true);
      expect(scene.camera.position).toEqual(position);
      expect(scene.camera.direction).toEqual(direction);
      expect(scene.frameState.camera).toBe(scene.camera);
      const red = sample(probe._maps.radiance, new Cartesian3(0, -1, 0));
      expect(red[0]).toBeGreaterThan(4);
      expect(red[1]).toBeLessThan(0.1);
      expect(red[3]).toBe(0);
      const rough = sample(probe._maps.radiance, new Cartesian3(0, -1, 0), 5);
      expect(rough[0]).toBeLessThan(red[0]);
      expect(sample(probe._maps.visibility, Cartesian3.UNIT_Z)[0]).toBeLessThan(
        0.35,
      );
      const reflected = pixel();
      expect(reflected[0]).toBeGreaterThan(reflected[1]);
      expect(reflected).not.toEqual(original);
      const maps = probe._maps;
      const draws = collection._state.captureDraws;
      pixel();
      pixel();
      expect(probe.generation).toBe(1);
      expect(probe._maps).toBe(maps);
      expect(collection._state.captureDraws).toBe(draws);
      collection.show = false;
      expect(pixel()).toEqualEpsilon(original, 2);
      collection.show = true;
      expect(pixel()).toEqualEpsilon(reflected, 2);
      collection.remove(probe);
      expect(maps.radiance.isDestroyed()).toBe(true);
      expect(maps.visibility.isDestroyed()).toBe(true);
      expect(pixel()).toEqualEpsilon(original, 2);
    });
  });

  it("occludes default diffuse sky with zero specular factor, preserves emission and direct light, and respects masked openings", async function () {
    setup();
    const receiver = await model(Cartesian3.ZERO, [0, 0, 0]);
    const diffuse = new CustomShader({
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { m.diffuse = vec3(0.5); m.specular = vec3(0.0); m.emissive = vec3(0.05); m.clearcoatFactor = 0.0; }",
    });
    shaders.push(diffuse);
    receiver.customShader = diffuse;
    receiver.imageBasedLighting.imageBasedLightingFactor = new Cartesian2(1, 0);
    const wall = await model(
      new Cartesian3(0, -6, 0),
      [0, 0, 0],
      new Cartesian3(16, 0.5, 16),
    );
    const probe = addProbe();
    const original = pixel();
    const first = collection.capture([receiver, wall]);
    render();
    await first;
    const occluded = pixel();
    expect(occluded[0]).toBeLessThan(original[0] - 5);
    receiver.imageBasedLighting.sphericalHarmonicCoefficients = Array.from(
      { length: 9 },
      (_, i) =>
        new Cartesian3(i === 0 ? 0.8 : 0, i === 0 ? 0.8 : 0, i === 0 ? 0.8 : 0),
    );
    const authored = pixel();
    collection.show = false;
    expect(pixel()).toEqualEpsilon(authored, 1);
    collection.show = true;
    receiver.imageBasedLighting.sphericalHarmonicCoefficients = undefined;
    receiver.imageBasedLighting.imageBasedLightingFactor = Cartesian2.ZERO;
    receiver.lightColor = new Cartesian3(1, 1, 1);
    const isolated = pixel();
    collection.show = false;
    expect(pixel()).toEqualEpsilon(isolated, 1);
    collection.show = true;
    const blocked = sample(probe._maps.visibility, new Cartesian3(0, -1, 0))[0];
    const masked = new CustomShader({
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { if (fsInput.attributes.positionMC.x > 0.0) discard; m.diffuse = vec3(0.0); m.specular = vec3(0.0); m.clearcoatFactor = 0.0; }",
    });
    shaders.push(masked);
    wall.customShader = masked;
    const update = collection.capture([receiver, wall]);
    render();
    await update;
    const opening = sample(probe._maps.visibility, new Cartesian3(0, -1, 0))[0];
    expect(opening).toBeGreaterThan(blocked + 0.15);
    expect(probe.generation).toBe(2);
  });

  it("retains published maps and restores state on capture failure without retrying", async function () {
    setup();
    const source = await model(new Cartesian3(0, 0, 0), [1, 0, 0]);
    const probe = addProbe();
    const first = collection.capture([source]);
    render();
    await first;
    const maps = probe._maps;
    const camera = scene.frameState.camera;
    const commandList = scene.frameState.commandList;
    const pending = collection.capture([source]);
    const failure = pending.catch((error) => error);
    scene.primitives.remove(source);
    render();
    expect((await failure).message).toContain("removed or destroyed");
    expect(scene.frameState.camera).toBe(camera);
    expect(scene.frameState.commandList).toBe(commandList);
    expect(probe._maps).toBe(maps);
    expect(probe.generation).toBe(1);
    render();
    expect(collection._pending).toBeUndefined();
    const state = collection._state;
    collection.destroy();
    expect(state.source.isDestroyed()).toBe(true);
    expect(state.depth.isDestroyed()).toBe(true);
    expect(maps.radiance.isDestroyed()).toBe(true);
  });
});
