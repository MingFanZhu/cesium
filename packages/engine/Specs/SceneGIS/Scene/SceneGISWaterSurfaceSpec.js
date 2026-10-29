import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix4,
  PerInstanceColorAppearance,
  PolygonHierarchy,
  Primitive,
  SceneGISWaterSurface,
  SceneGISWindWaves,
  SceneGISScreenSpaceReflections,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneTransforms,
  Transforms,
  DirectionalLight,
  OrthographicFrustum,
  BoxGeometry,
  CustomShader,
  Model,
  Texture,
  PixelFormat,
  PixelDatatype,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISWaterSurface", function () {
  let scene, water, transform, sourceShader, borrowedWaves;
  const time = JulianDate.fromIso8601("2026-06-21T10:00:00Z");
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
  function ring(size, z = 0) {
    return new PolygonHierarchy([
      new Cartesian3(-size, -size, z),
      new Cartesian3(size, -size, z),
      new Cartesian3(size, size, z),
      new Cartesian3(-size, size, z),
    ]);
  }
  function render(t = time) {
    scene.renderForSpecs(t);
  }
  function pixel(p) {
    const screen = SceneTransforms.worldToWindowCoordinates(scene, p);
    return Array.from(
      scene.context.readPixels({
        x: Math.floor(screen.x),
        y: 127 - Math.floor(screen.y),
        width: 1,
        height: 1,
      }),
    );
  }
  function flat(geometry, color, matrix = transform, id) {
    return scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry,
          id,
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(color),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          flat: true,
        }),
        modelMatrix: matrix,
        asynchronous: false,
      }),
    );
  }
  function setup(
    planar = true,
    orthographic = false,
    hole = false,
    windWaves,
    options = {},
  ) {
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
    const hierarchy = ring(12);
    if (hole) {
      hierarchy.holes.push(ring(2));
    }
    water = scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: hierarchy,
        windWaves,
        modelMatrix: transform,
        id: "water",
        waveAmplitude: 0,
        foamIntensity: 0,
        reflections: false,
        refractionStrength: 0,
        waterColor: Color.BLACK,
        reflectionColor: Color.BLACK,
        absorption: new Cartesian3(1, 0, 0),
        ...options,
      }),
    );
    flat(
      new CoplanarPolygonGeometry({
        polygonHierarchy: ring(20, -1),
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      Color.WHITE,
      transform,
      "bottom",
    );
  }
  [true, false].forEach(function (planar) {
    it(`bounds underwater absorption by the local volume and holes in ${planar ? "Planar" : "Globe"}`, function () {
      setup(planar, false, true);
      const down = (x) =>
        scene.camera.setView({
          destination: point(x, 0, -0.25),
          orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
        });
      const center = () =>
        Array.from(
          scene.context.readPixels({ x: 64, y: 64, width: 1, height: 1 }),
        );
      down(6);
      render();
      const clear = center();
      water.underwaterDepth = 2;
      water.scattering = Cartesian3.clone(Cartesian3.ZERO);
      render();
      expect(water._underwater.active).toBeTrue();
      expect(scene.frameState._sceneGISWater.ready).toBeTrue();
      expect(center()[0]).toBeLessThan(clear[0] * 0.9);
      expect(center()[1]).toEqualEpsilon(clear[1], 1);
      const texture = water._underwater.texture;
      down(0);
      render();
      expect(water._underwater.active).toBeFalse();
      expect(center()).toEqual(clear);
      down(13);
      render();
      expect(water._underwater.active).toBeFalse();
      expect(center()).toEqual(clear);
      down(6);
      water.underwaterDepth = 0;
      render();
      expect(center()).toEqual(clear);
      water.underwaterDepth = 2;
      water.reflectionColor = Color.BLUE;
      scene.camera.setView({
        destination: point(6, 0, -0.25),
        orientation: { direction: vector(0, 0, 1), up: vector(0, 1, 0) },
      });
      render();
      expect(center()[2]).toBeGreaterThan(100);
      scene.primitives.remove(water);
      water = undefined;
      expect(texture.isDestroyed()).toBeTrue();
    });
    it(`renders displaced wind water and hole picking in ${planar ? "Planar" : "Globe"} without owning the simulation`, function () {
      const waves = new SceneGISWindWaves({
        resolution: 32,
        patchLength: 16,
        windSpeed: 10,
      });
      setup(planar, false, true, waves);
      render();
      expect(water._commands.length).toBeGreaterThan(0);
      expect(waves.ready).toBeTrue();
      const p = point(6, 0, 0),
        screen = SceneTransforms.worldToWindowCoordinates(scene, p);
      expect(scene.pick(screen).id).toBe("water");
      expect(
        scene.pick(
          SceneTransforms.worldToWindowCoordinates(scene, point(0, 0, -1)),
        ).id,
      ).toBe("bottom");
      render();
      const before = pixel(p);
      const depthBefore = scene.pickPosition(screen);
      render(JulianDate.addSeconds(time, 0.8, new JulianDate()));
      expect(waves._state.seconds).toEqualEpsilon(0.8, 1e-7);
      expect(
        Cartesian3.distance(scene.pickPosition(screen), depthBefore),
      ).toBeGreaterThan(0.0001);
      expect(pixel(p).some((v, i) => v !== before[i])).toBeTrue();
      const arrays = water._mesh.tiles.flatMap((t) =>
        t.cache.map((e) => e.vertexArray),
      );
      scene.primitives.remove(water);
      water = undefined;
      expect(arrays.every((a) => a.isDestroyed())).toBeTrue();
      expect(waves.isDestroyed()).toBeFalse();
      waves.destroy();
    });
  });
  it("lazily shares the foam material and keeps water identical when foam is disabled", async function () {
    setup();
    render();
    const state = scene.frameState._sceneGISWater;
    expect(state.foamMaterial).toBeUndefined();
    const before = scene.context.readPixels();
    water.foamIntensity = 1;
    render();
    await state.foamMaterial._promise;
    render();
    const material = state.foamMaterial;
    const texture = material.texture;
    expect(texture).toBeDefined();
    const second = scene.primitives.add(
      new SceneGISWaterSurface({
        polygonHierarchy: ring(1),
        modelMatrix: transform,
        foamIntensity: 1,
        reflections: false,
      }),
    );
    render();
    expect(second._command.uniformMap.u_foamDetail()).toBe(texture);
    scene.primitives.remove(second);
    expect(texture.isDestroyed()).toBeFalse();
    water.foamIntensity = 0;
    render();
    expect(scene.context.readPixels()).toEqual(before);
    scene.primitives.remove(water);
    water = undefined;
    expect(texture.isDestroyed()).toBeFalse();
    scene.destroyForSpecs();
    scene = undefined;
    expect(texture.isDestroyed()).toBeTrue();
  });
  it("rejects submerged geometry from wind-wave reflection rays", function () {
    borrowedWaves = new SceneGISWindWaves({
      resolution: 32,
      patchLength: 16,
      windSpeed: 12,
      amplitudeScale: 2,
    });
    setup(true, false, false, borrowedWaves);
    water.reflections = true;
    water.absorption = new Cartesian3(1000, 1000, 1000);
    water.reflectionColor = Color.BLUE;
    scene.camera.setView({
      destination: point(0, -8, 2),
      orientation: {
        direction: Cartesian3.normalize(vector(0, 8, -2), new Cartesian3()),
        up: vector(0, 0, 1),
      },
    });
    flat(
      new CoplanarPolygonGeometry({
        polygonHierarchy: ring(20, -0.8),
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      Color.RED,
    );
    render();
    for (const x of [-2, 0, 2]) {
      for (const y of [0, 2, 4]) {
        expect(pixel(point(x, y, 0))[0]).toBeLessThan(2);
      }
    }
  });
  it("reflects a continuous submerged bottom from the FFT underside at a coarse ray budget", function () {
    borrowedWaves = new SceneGISWindWaves({
      resolution: 32,
      patchLength: 16,
      windSpeed: 0,
    });
    setup(true, false, false, borrowedWaves);
    water.underwaterDepth = 2;
    water.absorption = Cartesian3.clone(Cartesian3.ZERO);
    scene.camera.setView({
      destination: point(0, -4, -0.5),
      orientation: {
        direction: Cartesian3.normalize(vector(0, 4, 0.5), new Cartesian3()),
        up: vector(0, 0, 1),
      },
    });
    render();
    const without = scene.context.readPixels();
    water.reflections = true;
    water.reflectionSteps = 16;
    render();
    expect(
      scene.context
        .readPixels()
        .some((v, i) => i % 4 !== 3 && v > without[i] + 20),
    ).toBeTrue();
    // Every ray in this TIR patch sees the same white floor. Long projected
    // strides must not alternate between that floor and the black environment.
    const patch = scene.context.readPixels({
      x: 48,
      y: 82,
      width: 32,
      height: 26,
    });
    let darkest = 255;
    for (let i = 0; i < patch.length; i += 4) {
      darkest = Math.min(darkest, patch[i]);
    }
    expect(darkest).toBeGreaterThan(150);
  });
  afterEach(function () {
    if (borrowedWaves && !borrowedWaves.isDestroyed()) {
      scene.primitives.remove(water);
      borrowedWaves.destroy();
    }
    borrowedWaves = undefined;
    scene?.destroyForSpecs();
    scene = undefined;
    sourceShader?.destroy();
    sourceShader = undefined;
  });
  [true, false].forEach(function (planar) {
    it(`composes ${planar ? "Planar" : "Globe"} absorption from opaque bottom depth and preserves picking`, async function () {
      setup(planar);
      await pollToPromise(() => {
        render();
        return water.ready && scene.frameState._sceneGISWater.ready;
      });
      render();
      const p = point(4, 0, 0);
      const shallow = pixel(p);
      expect(shallow[1]).toBeGreaterThan(shallow[0] + 25);
      expect(shallow[1]).toEqualEpsilon(shallow[2], 2);
      const screen = SceneTransforms.worldToWindowCoordinates(scene, p);
      expect(scene.pick(screen).id).toEqual("water");
      render();
      expect(pixel(p)).toEqual(shallow);
      water.absorption.x = 4;
      render();
      expect(pixel(p)[0]).toBeLessThan(shallow[0]);
      water.show = false;
      render();
      const bare = pixel(p);
      expect(bare[0]).toBeGreaterThan(shallow[0] + 25);
      expect(scene.frameState._sceneGISWater.ready).toBe(false);
      water.show = true;
      render();
      expect(scene.frameState._sceneGISWater.ready).toBe(true);
    });
  });
  it("keeps holes and above-water occluders with orthographic multiple frusta", async function () {
    setup(true, true, true);
    const box = flat(
      BoxGeometry.fromDimensions({
        dimensions: new Cartesian3(2, 2, 4),
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      Color.RED,
      Matrix4.multiplyByTranslation(
        transform,
        new Cartesian3(5, 0, 2),
        new Matrix4(),
      ),
      "box",
    );
    await pollToPromise(() => {
      render();
      return box.ready;
    });
    render();
    const throughHole = pixel(point(0, 0, 0));
    expect(throughHole[0]).toEqualEpsilon(throughHole[1], 2);
    expect(pixel(point(-4, 0, 0))[1]).toBeGreaterThan(
      pixel(point(-4, 0, 0))[0] + 25,
    );
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expect(
      scene.pick(
        SceneTransforms.worldToWindowCoordinates(scene, point(5, 0, 4)),
      ).id,
    ).toEqual("box");
  });
  it("reflects an opaque object and shares SSR inputs without capturing water", async function () {
    setup();
    water.absorption = new Cartesian3(2, 2, 2);
    water.reflections = true;
    sourceShader = new CustomShader({
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(0.0); material.specular = vec3(0.0); material.emissive = vec3(3.0, 0.0, 0.0); }",
    });
    const modelMatrix = Matrix4.multiplyByScale(
      Matrix4.multiplyByTranslation(
        transform,
        new Cartesian3(0, 4, 3),
        new Matrix4(),
      ),
      new Cartesian3(4, 4, 6),
      new Matrix4(),
    );
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix,
        customShader: sourceShader,
      }),
    );
    await pollToPromise(() => {
      render();
      return model.ready;
    });
    render();
    const p = point(0, -0.4, 0);
    const hit = pixel(p);
    water.reflections = false;
    render();
    expect(hit[0]).toBeGreaterThan(pixel(p)[0] + 10);
    water.reflections = true;
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    render();
    const state = scene.frameState._sceneGISWater;
    expect(state.borrowed).toBe(true);
    expect(state.captureDraws).toBe(0);
    expect(state.colorTexture).toBe(ssr._state.radianceTexture);
    expect(pixel(p)).toEqualEpsilon(hit, 2);
    ssr.destroy();
    render();
    expect(state.borrowed).toBe(true);
    expect(state.colorTexture).toBe(
      scene._sceneGISDeferred._waterColor.getColorTexture(),
    );
    expect(pixel(p)).toEqualEpsilon(hit, 2);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    render();
    const ao =
      scene.postProcessStages.ambientOcclusion._sceneGISAmbientOcclusion;
    expect(ao.mainPass).toBe(true);
    expect(ao.prepassDraws).toBe(0);
    expect(state.borrowed).toBe(true);
    expect(state.captureDraws).toBe(0);
    expect(state.colorTexture).toBe(ao.radianceTexture);
    expect(pixel(p)).toEqualEpsilon(hit, 2);
  });
  [true, false].forEach(function (planar) {
    [false, true].forEach(function (windy) {
      it(`shares ${planar ? "Planar" : "Globe"} ${windy ? "wind" : "normal-only"} physical light for scattering and foam without relighting transmission`, async function () {
        borrowedWaves = windy
          ? new SceneGISWindWaves({ resolution: 32 })
          : undefined;
        setup(planar, false, false, borrowedWaves);
        water.absorption = new Cartesian3(10, 10, 10);
        water.waterColor = new Color(0.15, 0.15, 0.15);
        await pollToPromise(() => {
          render();
          return water.ready;
        });
        const c = scene.context;
        const texture = new Texture({
          context: c,
          pixelFormat: PixelFormat.RGBA,
          source: {
            width: 2,
            height: 2,
            arrayBufferView: new Uint8Array(16).fill(128),
          },
        });
        const key = planar
          ? "_sceneGISPlanarLighting"
          : "_sceneGISGlobeLighting";
        const record = {
          active: true,
          atlasTexture: texture,
          transmittanceTexture: texture,
          irradianceTexture: texture,
          matrices: Array.from({ length: 3 }, () =>
            Matrix4.fromScale(Cartesian3.ZERO),
          ),
          intervals: Array.from({ length: 3 }, () => new Cartesian2(0, 100000)),
          cascadeCount: 1,
          showCloudShadows: false,
          primaryLightDirection: vector(0, 0, 1),
          sunDirection: vector(0, 0, 1),
          primaryLightScale: new Cartesian3(1, 1, 1),
          cameraRelativePosition: new Cartesian3(
            0,
            0,
            scene.camera.positionWC.z,
          ),
          surfaceRadianceScale: 1,
          nightAmbientIntensity: 1,
          cloudTop: 4000,
        };
        try {
          scene.frameState[key] = record;
          render();
          const p = point(4, 0, 0);
          const lit = pixel(p);
          expect(water._lightingMode).toEqual(planar ? "planar" : "globe");
          const program = water._command.shaderProgram;
          record.surfaceRadianceScale = 0;
          render();
          expect(pixel(p)[0]).toBeLessThan(lit[0]);
          expect(water._command.shaderProgram).toBe(program);
          water.absorption = Cartesian3.clone(Cartesian3.ZERO);
          render();
          const unlitTransmission = pixel(p);
          record.surfaceRadianceScale = 1;
          render();
          expect(pixel(p)).toEqual(unlitTransmission);
          record.active = false;
          render();
          expect(water._lightingMode).toEqual("none");
          expect(texture.isDestroyed()).toBe(false);
        } finally {
          scene.frameState[key] = undefined;
          texture.destroy();
        }
      });
    });
  });
  it("rejects above-plane refraction samples instead of pulling foreground color into water", async function () {
    setup();
    water.absorption = Cartesian3.clone(Cartesian3.ZERO);
    water.waveAmplitude = 0.3;
    water.waveLength = 1;
    water.refractionStrength = 1;
    const box = flat(
      BoxGeometry.fromDimensions({
        dimensions: new Cartesian3(3, 3, 3),
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      Color.RED,
      Matrix4.multiplyByTranslation(
        transform,
        new Cartesian3(0, 6, 2),
        new Matrix4(),
      ),
    );
    await pollToPromise(() => {
      render();
      return box.ready;
    });
    water.show = false;
    render();
    const bare = scene.context.readPixels();
    water.show = true;
    render();
    const wet = scene.context.readPixels();
    let red = 0;
    for (let i = 0; i < wet.length; i += 4) {
      if (wet[i] > wet[i + 1] + 30) {
        ++red;
        expect(bare[i]).toBeGreaterThan(bare[i + 1] + 20);
      }
    }
    expect(red).toBeGreaterThan(10);
  });

  it("attenuates the accepted refracted depth at a submerged depth step", function () {
    setup(true, true);
    scene.camera.setView({
      destination: point(0, 0, 10),
      orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
    });
    scene.camera.frustum.width = 12;
    water.waveAmplitude = 0.2;
    water.refractionStrength = 1;
    water.absorption = new Cartesian3(0.15, 0.15, 0.15);
    render();
    const textures = [];
    function depthTexture(value) {
      const data = new Float32Array(128 * 128 * 4);
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const i = (y * 128 + x) * 4;
          data[i] = value ?? (x < 64 ? 15 : 30);
          data[i + 3] = 1;
        }
      }
      const texture = new Texture({
        context: scene.context,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.FLOAT,
        source: { width: 128, height: 128, arrayBufferView: data },
      });
      textures.push(texture);
      return texture;
    }
    try {
      const near = depthTexture(15),
        far = depthTexture(30),
        stepped = depthTexture();
      water._command.uniformMap.u_color = () => scene.context.defaultTexture;
      function capture(texture) {
        water._command.uniformMap.u_depth = () => texture;
        render();
        return scene.context.readPixels();
      }
      const nearPixels = capture(near),
        farPixels = capture(far),
        stepPixels = capture(stepped);
      let acrossLeft = 0,
        acrossRight = 0;
      for (let y = 20; y < 108; y++) {
        for (let x = 20; x < 108; x++) {
          const i = (y * 128 + x) * 4;
          if (Math.abs(nearPixels[i] - farPixels[i]) < 20) {
            continue;
          }
          if (x < 62 && Math.abs(stepPixels[i] - farPixels[i]) <= 1) {
            acrossLeft++;
          }
          if (x > 65 && Math.abs(stepPixels[i] - nearPixels[i]) <= 1) {
            acrossRight++;
          }
        }
      }
      expect(acrossLeft).toBeGreaterThan(20);
      expect(acrossRight).toBeGreaterThan(20);
    } finally {
      textures.forEach((texture) => texture.destroy());
    }
  });

  [true, false].forEach(function (planar) {
    it(`switches coefficient optics in ${planar ? "Planar" : "Globe"} without changing resources or legacy defaults`, function () {
      setup(planar);
      render();
      const p = point(4, 0, 0),
        legacy = pixel(p);
      const program = water._command.shaderProgram,
        va = water._command.vertexArray;
      const input = scene.frameState._sceneGISWater.colorTexture;
      water.scattering = Cartesian3.clone(Cartesian3.ZERO);
      render();
      expect(pixel(p)).toEqual(legacy);
      water.scattering = new Cartesian3(0.4, 0.7, 0.3);
      water.scatteringAnisotropy = 0.6;
      render();
      const coefficient = pixel(p);
      expect(coefficient).not.toEqual(legacy);
      water.waterColor = Color.clone(Color.RED);
      render();
      expect(pixel(p)).toEqual(coefficient);
      expect(water._command.shaderProgram).toBe(program);
      expect(water._command.vertexArray).toBe(va);
      expect(scene.frameState._sceneGISWater.colorTexture).toBe(input);
      water.scattering = undefined;
      water.waterColor = Color.clone(Color.BLACK);
      render();
      expect(pixel(p)).toEqual(legacy);
      water.scattering = new Cartesian3(NaN, 0, 0);
      expect(render).toThrowDeveloperError();
    });
  });

  it("uses deep-water scattering without a captured bottom even at zero absorption", function () {
    setup(false);
    scene.globe.show = false;
    scene.primitives.get(1).show = false;
    water.absorption = Cartesian3.clone(Cartesian3.ZERO);
    water.waterColor = new Color(0.02, 0.3, 0.12);
    render();
    const deep = pixel(point(4, 0, 0));
    expect(deep[1]).toBeGreaterThan(deep[0] + 30);
    expect(deep[1]).toBeGreaterThan(deep[2]);
    water.foamIntensity = 1;
    render();
    expect(pixel(point(4, 0, 0))).toEqual(deep);
  });

  [true, false].forEach(function (planar) {
    it(`renders broken ${planar ? "Planar" : "Globe"} shallow foam with frozen simulation time and exact disable`, async function () {
      setup(planar, true);
      scene.camera.setView({
        destination: point(0, 0, 10),
        orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
      });
      // Native Globe setView adjusts orthographic width from the destination height.
      scene.camera.frustum.width = 12;
      water.absorption = new Cartesian3(1000, 1000, 1000);
      water.foamWidth = 0.3;
      const shallow = flat(
        new CoplanarPolygonGeometry({
          polygonHierarchy: ring(3, -0.05),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        Color.BLACK,
      );
      await pollToPromise(() => {
        render();
        return shallow.ready && water.ready;
      });
      const bare = scene.context.readPixels();
      expect(pixel(point(0, 0, 0))[0]).toBeLessThan(10);
      const deep = pixel(point(5, 0, 0));
      const targets = scene.frameState._sceneGISWater.raw;
      const program = water._command.shaderProgram;
      // Partial concentration must preserve open water between textured films.
      water.foamIntensity = 0.5;
      render();
      await scene.frameState._sceneGISWater.foamMaterial._promise;
      render();
      const foam = scene.context.readPixels();
      const patch = scene.context.readPixels({
        x: 40,
        y: 40,
        width: 48,
        height: 48,
      });
      let visible = 0;
      let openings = 0;
      for (let i = 0; i < patch.length; i += 4) {
        visible += patch[i] > 50 ? 1 : 0;
        openings += patch[i] < 10 ? 1 : 0;
      }
      expect(visible).toBeGreaterThan(100);
      expect(openings).toBeGreaterThan(100);
      expect(pixel(point(5, 0, 0))).toEqual(deep);
      render();
      expect(scene.context.readPixels()).toEqual(foam);
      const later = JulianDate.addSeconds(time, 8, new JulianDate());
      render(later);
      const drifting = scene.context.readPixels();
      expect(water._time).toEqual(8);
      let changed = 0;
      for (let i = 0; i < foam.length; i += 4) {
        changed += Math.abs(foam[i] - drifting[i]) > 20 ? 1 : 0;
      }
      expect(changed).toBeGreaterThan(100);
      render(later);
      expect(scene.context.readPixels()).toEqual(drifting);
      expect(scene.frameState._sceneGISWater.raw).toBe(targets);
      expect(water._command.shaderProgram).toBe(program);
      water.foamWidth = 0;
      render();
      expect(scene.context.readPixels()).toEqual(bare);
      water.foamWidth = 0.3;
      water.foamIntensity = 0;
      render();
      expect(scene.context.readPixels()).toEqual(bare);
    });
  });

  it("uses simulation time and releases surface and shared targets deterministically", async function () {
    setup();
    water.waveAmplitude = 0.08;
    water.refractionStrength = 0.5;
    await pollToPromise(() => {
      render();
      return water.ready;
    });
    render();
    const state = scene.frameState._sceneGISWater;
    const first = state.colorTexture;
    render(JulianDate.addSeconds(time, 2, new JulianDate()));
    expect(water._time).toEqual(2);
    render(JulianDate.addSeconds(time, 2, new JulianDate()));
    expect(water._time).toEqual(2);
    const command = water._command;
    scene.canvas.width = 96;
    render();
    expect(first.isDestroyed()).toBe(true);
    expect(state.colorTexture.width).toEqual(96);
    expect(water._command).toBe(command);
    const va = command.vertexArray;
    scene.primitives.remove(water);
    expect(water.isDestroyed()).toBe(true);
    expect(va.isDestroyed()).toBe(true);
    render();
    expect(state.ready).toBe(false);
    const finalTexture = state.colorTexture;
    scene.destroyForSpecs();
    scene = undefined;
    expect(finalTexture.isDestroyed()).toBe(true);
  });
  it("rejects invalid geometry and material values and supports HDR-disabled display", function () {
    for (const options of [
      { scattering: new Cartesian3(-1, 0, 0) },
      { scattering: new Cartesian3(0, Infinity, 0) },
      { scatteringAnisotropy: 1 },
      { scatteringAnisotropy: -1 },
      { underwaterDepth: -1 },
      { causticsIntensity: -1 },
      { causticsIntensity: 3 },
    ]) {
      expect(
        () =>
          new SceneGISWaterSurface({ polygonHierarchy: ring(1), ...options }),
      ).toThrowDeveloperError();
    }
    const scattering = new Cartesian3(0.1, 0.2, 0.3);
    const surface = new SceneGISWaterSurface({
      polygonHierarchy: ring(1),
      scattering,
    });
    expect(surface.scattering).toEqual(scattering);
    expect(surface.scattering).not.toBe(scattering);
    surface.destroy();
    expect(
      () => new SceneGISWaterSurface({ polygonHierarchy: ring(1, 2) }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISWaterSurface({
          polygonHierarchy: ring(1),
          flowDirection: Cartesian2.ZERO,
        }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISWaterSurface({
          polygonHierarchy: ring(1),
          absorption: new Cartesian3(-1, 0, 0),
        }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISWaterSurface({
          polygonHierarchy: ring(1),
          modelMatrix: Matrix4.fromUniformScale(2),
        }),
    ).toThrowDeveloperError();
    setup();
    water.show = false;
    render();
    expect(water.ready).toBe(false);
    expect(scene.frameState._sceneGISWater.raw).toBeUndefined();
    water.show = true;
    scene.highDynamicRange = false;
    render();
    expect(water.ready).toBe(true);
    expect(scene._hdr).toBe(true);
    expect(scene.frameState._sceneGISWater.borrowed).toBe(true);
  });
});
