import {
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  CustomShader,
  DirectionalLight,
  GeometryInstance,
  Globe,
  ImageBasedLighting,
  JulianDate,
  LightingModel,
  Matrix4,
  Model,
  OrthographicFrustum,
  PerInstanceColorAppearance,
  Primitive,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISScreenSpaceReflections,
  SceneGISSurfaceWeather,
  ShaderSource,
  Transforms,
} from "../../../index.js";
import coverage from "../../../Source/Shaders/SceneGIS/Weather/SceneGISSurfaceWeather.js";
import materialWeather from "../../../Source/Shaders/SceneGIS/Weather/SceneGISSurfaceWeatherModel.js";
import SurfaceWeather from "../../../Source/SceneGIS/Scene/_private/_SceneGISSurfaceWeather.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISSurfaceWeather", function () {
  let scene, effect, frame, shader, ibl, quad;
  function point(x, y, z) {
    return Matrix4.multiplyByPoint(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function vector(x, y, z) {
    return Matrix4.multiplyByPointAsVector(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function view(x = 0) {
    scene.camera.setView({
      destination: point(x, 0, 40),
      orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
    });
  }
  function setup(planar = true, terrain = false) {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    frame = planar
      ? Matrix4.fromTranslation(new Cartesian3(20000000, -30000000, 0))
      : Transforms.eastNorthUpToFixedFrame(
          Cartesian3.fromDegrees(118.785, 32.045),
        );
    if (planar) {
      scene._initializeWorld(
        new SceneGISPlanarWorld({
          coordinateSystem: new SceneGISPlanarCoordinateSystem({
            extent: new SceneGISPlanarExtent({
              minimumX: 19999872,
              maximumX: 20000128,
              minimumY: -30000128,
              maximumY: -29999872,
            }),
          }),
          maximumLevel: 0,
          baseColor: new Color(0.35, 0.35, 0.35),
          enableLighting: true,
        }),
      );
      scene.world.show = terrain;
    } else if (terrain) {
      scene.globe = new Globe();
      scene.globe.baseColor = new Color(0.35, 0.35, 0.35);
      scene.globe.enableLighting = true;
      scene.globe.showGroundAtmosphere = false;
      scene.globe.maximumScreenSpaceError = 1000;
      scene.globe.lightingFadeOutDistance = 0;
      scene.globe.lightingFadeInDistance = 1;
    }
    scene.highDynamicRange = true;
    scene.fog.enabled = false;
    scene.light = new DirectionalLight({ direction: vector(0.7, 0.2, -1) });
    view();
    scene.camera.frustum = new OrthographicFrustum({
      width: 30,
      aspectRatio: 1,
      near: 1,
      far: 200,
    });
    effect = new SceneGISSurfaceWeather({ scene });
  }
  function pixel() {
    scene.renderForSpecs();
    return Array.from(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
    );
  }
  async function floor(unlit = false) {
    shader = new CustomShader({
      lightingModel: unlit ? LightingModel.UNLIT : LightingModel.PBR,
      fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        material.diffuse = vec3(0.35); material.specular = vec3(0.04); material.roughness = 0.8;
        material.clearcoatFactor = 0.0;
      }`,
    });
    ibl = new ImageBasedLighting({ imageBasedLightingFactor: Cartesian2.ZERO });
    const modelMatrix = Matrix4.multiplyByTranslation(
      frame,
      new Cartesian3(0, 0, -0.5),
      new Matrix4(),
    );
    Matrix4.multiplyByScale(
      modelMatrix,
      new Cartesian3(30, 30, 1),
      modelMatrix,
    );
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
        modelMatrix,
        customShader: shader,
        imageBasedLighting: ibl,
      }),
    );
    await pollToPromise(() => {
      scene.renderForSpecs();
      return model.ready;
    });
    return model;
  }
  afterEach(function () {
    quad?.shaderProgram.destroy();
    scene?.primitives.removeAll();
    shader?.destroy();
    ibl?.destroy();
    scene?.destroyForSpecs();
    scene = effect = shader = ibl = quad = undefined;
  });
  it("validates settings, defaults to no work and releases the Scene-owned setting", function () {
    setup();
    pixel();
    expect(effect.enabled).toBe(false);
    expect(effect.rippleIntensity).toBe(0);
    expect(effect._state).toBeUndefined();
    expect(() => new SceneGISSurfaceWeather({ scene })).toThrowDeveloperError();
    expect(() => {
      effect.wetness = 2;
    }).toThrowDeveloperError();
    expect(() => {
      effect.snowCoverage = NaN;
    }).toThrowDeveloperError();
    expect(() => {
      effect.patchScale = 0;
    }).toThrowDeveloperError();
    expect(() => {
      effect.rippleIntensity = 2;
    }).toThrowDeveloperError();
    expect(() => {
      effect.rippleScale = 0;
    }).toThrowDeveloperError();
    expect(() => {
      effect.enabled = 1;
    }).toThrowDeveloperError();
    const color = new Color(0.8, 0.9, 1);
    effect.snowColor = color;
    expect(effect.snowColor).not.toBe(color);
    effect.destroy();
    expect(scene._sceneGISSurfaceWeather).toBeUndefined();
    effect = new SceneGISSurfaceWeather({ scene });
    scene.destroyForSpecs();
    expect(effect.isDestroyed()).toBe(true);
    scene = undefined;
  });
  [true, false].forEach(function (planar) {
    it(`animates only resolved wet upward ripples in ${planar ? "Planar" : "Globe"}`, function () {
      setup(planar);
      effect.enabled = true;
      effect.wetness = 1;
      const epoch = JulianDate.fromIso8601("2026-09-29T00:00:00Z");
      let offset = 0,
        wall = false,
        span = 4;
      function sample(seconds) {
        scene.renderForSpecs(
          JulianDate.addSeconds(epoch, seconds, new JulianDate()),
        );
        SurfaceWeather.prepare(scene);
        if (!quad) {
          quad = scene.context.createViewportQuadCommand(
            new ShaderSource({
              sources: [
                coverage,
                `
              in vec2 v_textureCoordinates;
              uniform float u_offset;
              uniform float u_span;
              uniform bool u_wall;
              uniform float u_wet;
              void main() {
                vec3 p = vec3((v_textureCoordinates - 0.5) * u_span, -40.0);
                p.x -= u_offset;
                vec3 n = sceneGISWeatherUp(p);
                if (u_wall) { n = normalize(cross(n, vec3(0.0, 1.0, 0.0))); }
                vec2 cover = sceneGISWeatherCoverage(p, n);
                vec3 result = sceneGISWeatherRippleNormal(p, n, n, u_wet * (1.0 - cover.y));
                out_FragColor = vec4((result - n) * 0.5 + 0.5, 1.0);
              }`,
              ],
            }),
            {
              uniformMap: {
                ...effect._state.uniforms,
                u_offset: () => offset,
                u_span: () => span,
                u_wall: () => wall,
                u_wet: () => effect.wetness,
              },
            },
          );
        }
        quad.execute(scene.context);
        return Array.from(scene.context.readPixels());
      }
      const flat = sample(0);
      effect.rippleIntensity = 1;
      const first = sample(0);
      expect(first).not.toEqual(flat);
      expect(sample(0)).toEqual(first);
      expect(sample(0.6)).not.toEqual(first);
      if (planar) {
        view(41);
        offset = 41;
        expect(sample(0)).toEqualEpsilon(first, 1);
        view();
        offset = 0;
      }
      effect.wetness = 0;
      expect(sample(0)).toEqual(flat);
      effect.wetness = 1;
      effect.snowCoverage = 1;
      expect(sample(0)).toEqual(flat);
      effect.snowCoverage = 0;
      wall = true;
      expect(sample(0)).toEqual(flat);
      wall = false;
      span = 100;
      expect(sample(0)).toEqual(flat);
    });
    it(`shades ${planar ? "Planar" : "Globe"} model wetness/snow before lighting and restores authored material`, async function () {
      setup(planar);
      await floor();
      const dry = pixel();
      effect.enabled = true;
      expect(pixel()).toEqual(dry);
      effect.wetness = 1;
      const wet = pixel();
      expect(wet[0]).toBeLessThan(dry[0] - 5);
      effect.snowCoverage = 1;
      const snow = pixel();
      expect(snow[0]).toBeGreaterThan(dry[0] + 15);
      const programs = scene.context.shaderCache.numberOfShaders;
      pixel();
      expect(scene.context.shaderCache.numberOfShaders).toBe(programs);
      effect.enabled = false;
      expect(pixel()).toEqual(dry);
      effect.enabled = true;
      effect.destroy();
      expect(pixel()).toEqual(dry);
    });
    it(`covers ${planar ? "Planar" : "Globe"} terrain without adding commands`, async function () {
      setup(planar, true);
      await pollToPromise(() => {
        scene.renderForSpecs();
        return scene.world.tilesLoaded;
      });
      const dry = pixel();
      const count = scene.frameState.commandList.length;
      effect.enabled = true;
      effect.wetness = 1;
      effect.rippleIntensity = 1;
      effect.rippleScale = 8;
      expect(pixel()[0]).toBeLessThan(dry[0] - 5);
      effect.snowCoverage = 1;
      expect(pixel()[0]).toBeGreaterThan(dry[0] + 15);
      expect(scene.frameState.commandList.length).toBe(count);
      effect.enabled = false;
      expect(pixel()).toEqual(dry);
    });
  });
  it("leaves unlit models unchanged", async function () {
    setup();
    await floor(true);
    const dry = pixel();
    effect.enabled = true;
    effect.wetness = 1;
    effect.snowCoverage = 1;
    expect(pixel()).toEqual(dry);
  });
  it("covers opaque Phong primitives with existing normals", function () {
    setup();
    scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(30, 30, 1),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: frame,
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(0.3, 0.3, 0.3),
            ),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          closed: true,
        }),
      }),
    );
    const dry = pixel();
    effect.enabled = true;
    effect.wetness = 1;
    effect.rippleIntensity = 1;
    effect.rippleScale = 8;
    expect(pixel()[0]).toBeLessThan(dry[0] - 5);
    effect.snowCoverage = 1;
    expect(pixel()[0]).toBeGreaterThan(dry[0] + 15);
  });
  function materialSample(normal, output, offset = 0) {
    quad?.shaderProgram.destroy();
    scene.renderForSpecs();
    SurfaceWeather.prepare(scene);
    quad = scene.context.createViewportQuadCommand(
      new ShaderSource({
        defines: ["USE_CLEARCOAT"],
        sources: [
          coverage,
          materialWeather,
          `
      in vec2 v_textureCoordinates;
      void main() {
        vec3 position = vec3(${(-offset).toFixed(3)} + v_textureCoordinates.x * 0.01, 0.0, -40.0);
        czm_modelMaterial m; m.diffuse = vec3(0.3); m.specular = vec3(0.8); m.roughness = 0.8;
        m.normalEC = ${normal}; m.clearcoatFactor = 1.0; m.emissive = vec3(0.2); m.alpha = 0.4;
        sceneGISWeatherModel(m, position, ${normal});
        out_FragColor = ${output};
      }`,
        ],
      }),
      { uniformMap: effect._state.uniforms },
    );
    quad.execute(scene.context);
    return Array.from(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
    );
  }
  it("replaces metallic/coat response only on upward snow while retaining emission and alpha", function () {
    setup();
    effect.enabled = true;
    effect.snowCoverage = 1;
    const out = "vec4(m.roughness, m.specular.r, m.clearcoatFactor, 1.0)";
    expect(materialSample("vec3(0,0,1)", out)).toEqualEpsilon(
      [217, 10, 0, 255],
      1,
    );
    expect(materialSample("vec3(1,0,0)", out)).toEqualEpsilon(
      [204, 204, 255, 255],
      1,
    );
    expect(
      materialSample("vec3(0,0,1)", "vec4(m.emissive.r, m.alpha, 0.0, 1.0)"),
    ).toEqualEpsilon([51, 102, 0, 255], 1);
  });
  it("keeps coverage fixed across camera motion at large planar coordinates", function () {
    setup();
    effect.enabled = true;
    effect.snowCoverage = 0.5;
    const output =
      "vec4(vec3(sceneGISWeatherCoverage(position, vec3(0,0,1)).y), 1.0)";
    const first = materialSample("vec3(0,0,1)", output);
    view(41);
    const second = materialSample("vec3(0,0,1)", output, 41);
    expect(second).toEqualEpsilon(first, 1);
  });
  it("writes weather-adjusted roughness to SSR MRT without capture replay", async function () {
    setup();
    await floor();
    ibl.imageBasedLightingFactor = new Cartesian2(0, 1);
    ibl.specularEnvironmentMaps =
      "./Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2";
    await pollToPromise(() => {
      scene.renderForSpecs();
      return ibl.specularEnvironmentCubeMap?.ready;
    });
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    effect.enabled = true;
    effect.wetness = 1;
    pixel();
    expect(ssr._state.mainPass).toBe(true);
    expect(ssr._state.captureDraws).toBe(0);
    const target = ssr._state.raw.getColorTexture(1);
    quad = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_data; void main() { out_FragColor = vec4(vec3(texture(u_data, vec2(0.5)).a), 1.0); }",
      { uniformMap: { u_data: () => target } },
    );
    quad.execute(scene.context);
    expect(
      Array.from(
        scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
      ).slice(0, 3),
    ).toEqualEpsilon([56, 56, 56], 1);
    quad.shaderProgram.destroy();
    quad = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_data; in vec2 v_textureCoordinates; void main() { out_FragColor = vec4(texture(u_data, v_textureCoordinates).xyz * 0.5 + 0.5, 1.0); }",
      { uniformMap: { u_data: () => target } },
    );
    quad.execute(scene.context);
    const smooth = Array.from(scene.context.readPixels());
    const draws = scene.frameState.commandList.length;
    effect.rippleIntensity = 1;
    effect.rippleScale = 8;
    pixel();
    quad.execute(scene.context);
    expect(Array.from(scene.context.readPixels())).not.toEqual(smooth);
    expect(ssr._state.raw.getColorTexture(1)).toBe(target);
    expect(ssr._state.captureDraws).toBe(0);
    expect(scene.frameState.commandList.length).toBe(draws);
  });
});
