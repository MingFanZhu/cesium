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
  LightingModel,
  Matrix4,
  Model,
  OrthographicFrustum,
  PerInstanceColorAppearance,
  Primitive,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneTransforms,
  ShadowMode,
  Transforms,
  UniformType,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISShadowLighting", function () {
  let scene;
  let frame;
  let world;
  let shader;
  let ibl;

  function point(x, y, z) {
    return Matrix4.multiplyByPoint(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }

  function box(x, y, z, dimensions, shadows) {
    return scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions,
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.multiplyByTranslation(
            frame,
            new Cartesian3(x, y, z),
            new Matrix4(),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(0.4, 0.4, 0.4),
            ),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          closed: true,
        }),
        asynchronous: false,
        shadows,
      }),
    );
  }

  function setup(planar, terrain = false) {
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    frame = planar
      ? Matrix4.IDENTITY
      : Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(0, 0));
    if (planar) {
      world = new SceneGISPlanarWorld({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: -128,
            minimumY: -128,
            maximumX: 128,
            maximumY: 128,
          }),
        }),
        maximumLevel: 0,
        baseColor: Color.WHITE,
        enableLighting: true,
      });
      scene._initializeWorld(world);
      world.show = terrain;
    } else if (terrain) {
      world = scene.globe = new Globe();
      world.baseColor = Color.WHITE;
      world.enableLighting = true;
      world.lightingFadeOutDistance = 0;
      world.lightingFadeInDistance = 1;
      world.showGroundAtmosphere = false;
      world.maximumScreenSpaceError = 1000;
    }
    scene.fog.enabled = false;
    scene.camera.setView({
      destination: point(5, 0, 40),
      orientation: {
        direction: Matrix4.multiplyByPointAsVector(
          frame,
          new Cartesian3(0, 0, -1),
          new Cartesian3(),
        ),
        up: Matrix4.multiplyByPointAsVector(
          frame,
          Cartesian3.UNIT_Y,
          new Cartesian3(),
        ),
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 40,
      aspectRatio: 1,
      near: 1,
      far: 200,
    });
    scene.light = new DirectionalLight({
      direction: Matrix4.multiplyByPointAsVector(
        frame,
        new Cartesian3(1, 0, -1),
        new Cartesian3(),
      ),
    });
    scene.shadowMap.enabled = true;
    scene.shadowMap.darkness = 0;
    scene.shadowMap.size = 512;
    scene.shadowMap.maximumDistance = 150;
    // The local building supplies receiver bounds; native fitting excludes coarse Globe tiles.
    box(0, 0, 4, new Cartesian3(4, 4, 8), ShadowMode.ENABLED);
  }

  function sample(shadows) {
    scene.shadowMap.enabled = shadows;
    scene.renderForSpecs();
    const p = SceneTransforms.worldToWindowCoordinates(scene, point(6, 0, 0));
    return Array.from(
      scene.context.readPixels({
        x: Math.floor(p.x),
        y: 127 - Math.floor(p.y),
        width: 1,
        height: 1,
      }),
    );
  }

  afterEach(function () {
    scene?.destroyForSpecs();
    shader?.destroy();
    ibl?.destroy();
    scene = shader = ibl = world = undefined;
  });

  [true, false].forEach(function (planar) {
    const name = planar ? "Planar" : "Globe";
    it(`${name}: shadows direct PBR and clearcoat while preserving emission and IBL in HDR and LDR`, async function () {
      setup(planar);
      shader = new CustomShader({
        uniforms: {
          u_emission: { type: UniformType.VEC3, value: new Cartesian3() },
        },
        fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          material.diffuse = vec3(0.4);
          material.specular = vec3(0.04);
          material.roughness = 0.6;
          material.emissive = u_emission;
        }`,
      });
      ibl = new ImageBasedLighting({
        sphericalHarmonicCoefficients: Array.from({ length: 9 }, (_, i) =>
          i === 0 ? new Cartesian3(1, 1, 1) : new Cartesian3(),
        ),
        imageBasedLightingFactor: Cartesian2.ZERO,
      });
      const modelMatrix = Matrix4.multiplyByTranslation(
        frame,
        new Cartesian3(0, 0, -0.5),
        new Matrix4(),
      );
      Matrix4.multiplyByScale(
        modelMatrix,
        new Cartesian3(40, 40, 1),
        modelMatrix,
      );
      const model = scene.primitives.add(
        await Model.fromGltfAsync({
          url: "./Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
          modelMatrix,
          customShader: shader,
          imageBasedLighting: ibl,
          shadows: ShadowMode.RECEIVE_ONLY,
        }),
      );
      await pollToPromise(() => {
        scene.renderForSpecs();
        return model.ready && !scene.shadowMap.outOfView;
      });
      for (const hdr of [false, true]) {
        scene.highDynamicRange = hdr;
        scene.light.color = Color.WHITE;
        ibl.imageBasedLightingFactor = Cartesian2.ZERO;
        shader.setUniform("u_emission", Cartesian3.ZERO);
        const shadow = sample(true);
        const direct = sample(false);
        expect(direct[0]).toBeGreaterThan(shadow[0] + 20);
        expect(shadow[0]).toBeLessThan(3);

        scene.light.color = Color.BLACK;
        shader.setUniform("u_emission", new Cartesian3(0.4, 0.15, 0.08));
        const emission = sample(false);
        expect(emission[0]).toBeGreaterThan(30);
        expect(sample(true)).toEqualEpsilon(emission, 1);

        shader.setUniform("u_emission", Cartesian3.ZERO);
        ibl.imageBasedLightingFactor = new Cartesian2(1, 0);
        const ambient = sample(false);
        expect(ambient[0]).toBeGreaterThan(30);
        expect(sample(true)).toEqualEpsilon(ambient, 1);
      }
      const atlas = scene.shadowMap._shadowMapTexture;
      sample(false);
      sample(true);
      expect(scene.shadowMap._shadowMapTexture).toBe(atlas);
      scene.destroyForSpecs();
      scene = undefined;
      expect(atlas.isDestroyed()).toBe(true);
    });

    it(`${name}: preserves Phong ambient without losing the cast shadow`, function () {
      setup(planar);
      box(0, 0, -0.5, new Cartesian3(40, 40, 1), ShadowMode.RECEIVE_ONLY);
      const shadow = sample(true)[0];
      const lit = sample(false)[0];
      expect(shadow).toBeGreaterThan(40);
      expect(lit).toBeGreaterThan(shadow + 30);
    });

    it(`${name}: preserves the lit terrain ambient floor`, async function () {
      setup(planar, true);
      await pollToPromise(() => {
        scene.renderForSpecs();
        return world.tilesLoaded && !scene.shadowMap.outOfView;
      });
      const shadow = sample(true)[0];
      const lit = sample(false)[0];
      expect(shadow).toBeGreaterThan(15);
      expect(lit).toBeGreaterThan(shadow + 30);
    });
  });

  it("does not add geometric lighting to an unlit glTF material", async function () {
    setup(true);
    shader = new CustomShader({
      lightingModel: LightingModel.UNLIT,
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(0.4); }",
    });
    const modelMatrix = Matrix4.fromTranslation(new Cartesian3(0, 0, -0.5));
    Matrix4.multiplyByScale(
      modelMatrix,
      new Cartesian3(40, 40, 1),
      modelMatrix,
    );
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix,
        customShader: shader,
        shadows: ShadowMode.RECEIVE_ONLY,
      }),
    );
    await pollToPromise(() => {
      scene.renderForSpecs();
      return model.ready && !scene.shadowMap.outOfView;
    });
    const unlit = sample(false);
    expect(unlit[0]).toBeGreaterThan(30);
    expect(sample(true)).toEqualEpsilon(unlit, 1);
  });
});
