import {
  BoxGeometry,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartesian4,
  Color,
  ColorGeometryInstanceAttribute,
  Cesium3DTileset,
  CullingVolume,
  DirectionalLight,
  GeometryInstance,
  HeadingPitchRange,
  Intersect,
  Matrix4,
  Pass,
  PerInstanceColorAppearance,
  PixelDatatype,
  PixelFormat,
  Primitive,
  Sampler,
  ShaderSource,
  ShadowMap,
  ShadowMode,
  Texture,
  TextureMagnificationFilter,
  TextureMinificationFilter,
  Transforms,
} from "../../../index.js";
import cascadeSource from "../../../Source/Shaders/SceneGIS/Rendering/SceneGISCascadeShadow.js";
import createContext from "../../../../../Specs/createContext.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import cascades from "../../../Source/SceneGIS/Scene/_private/_SceneGISCascadedShadows.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISShadowQuality", function () {
  let context;
  let command;
  let texture;
  let scene;
  let uv;
  let depth;
  let eyeDepth;
  let gradient;
  const size = 16;
  const splits = [
    new Cartesian4(0, 10, 20, 30),
    new Cartesian4(10, 20, 30, 40),
  ];
  const matrices = [
    Matrix4.IDENTITY,
    Matrix4.fromTranslation(new Cartesian3(0.5, 0, 0)),
    Matrix4.IDENTITY,
    Matrix4.IDENTITY,
  ];

  it("invalidates a reused Globe receiver when terrain normal availability changes", function () {
    scene = createScene();
    command = scene.context.createViewportQuadCommand(
      "void main() { out_FragColor = vec4(1.0); }",
    );
    command.pass = Pass.GLOBE;
    command.castShadows = command.receiveShadows = true;
    const encoding = { hasVertexNormals: true };
    command.owner = { data: { renderedMesh: { encoding } } };
    const shadow = scene.shadowMap;
    let result;
    const update = () => {
      result = ShadowMap.createReceiveDerivedCommand(
        [shadow],
        command,
        false,
        scene.context,
        result,
      );
      return result.receiveCommand.shaderProgram;
    };
    const withNormals = update();
    expect(withNormals.vertexShaderSource.defines).toContain(
      "GENERATE_POSITION_AND_NORMAL",
    );
    encoding.hasVertexNormals = false;
    const withoutNormals = update();
    expect(withoutNormals).not.toBe(withNormals);
    expect(withoutNormals.vertexShaderSource.defines).not.toContain(
      "GENERATE_POSITION_AND_NORMAL",
    );
    expect(withoutNormals.vertexShaderSource.defines).toContain(
      "GENERATE_POSITION",
    );
    expect(update()).toBe(withoutNormals);
    encoding.hasVertexNormals = true;
    expect(update()).toBe(withNormals);
  });

  function setup(sample, slope = new Cartesian2(), blend = false) {
    context = createContext({}, 1, 1);
    const pixels = new Float32Array(size * size * 4);
    for (let y = 0; y < size; ++y) {
      for (let x = 0; x < size; ++x) {
        pixels[(y * size + x) * 4] = sample((x + 0.5) / size, (y + 0.5) / size);
      }
    }
    texture = new Texture({
      context,
      flipY: false,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      source: { width: size, height: size, arrayBufferView: pixels },
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.NEAREST,
        magnificationFilter: TextureMagnificationFilter.NEAREST,
      }),
    });
    uv = new Cartesian2(0.26, 0.27);
    depth = 0.4;
    eyeDepth = 5;
    gradient = slope;
    command = context.createViewportQuadCommand(
      new ShaderSource({
        defines: ["USE_SHADOW_DEPTH_TEXTURE", "USE_SOFT_SHADOWS"],
        sources: [
          cascadeSource,
          `uniform sampler2D u_shadow;
          uniform vec2 u_uv;
          uniform vec2 u_gradient;
          uniform float u_depth;
          uniform float u_eyeDepth;
          void main() {
              czm_shadowParameters p;
              p.texelStepSize = vec2(1.0 / 16.0);
              p.depthBias = 0.00002;
              p.normalShadingSmooth = 0.05;
              p.darkness = 0.0;
              p.nDotL = 1.0;
              p.texCoords = u_uv;
              p.depth = u_depth;
              vec3 dx = vec3(1.0, 0.0, u_gradient.x);
              vec3 dy = vec3(0.0, 1.0, u_gradient.y);
              vec4 weights = sceneGISCascadeWeights(u_eyeDepth);
              float visibility = ${
                blend
                  ? "sceneGISCascadeVisibility(u_shadow, p, vec4(u_uv, u_depth, 1.0), weights, u_eyeDepth, dx, dy)"
                  : "sceneGISCascadeSample(u_shadow, p, weights, dx, dy)"
              };
              out_FragColor = vec4(vec3(visibility), 1.0);
          }`,
        ],
      }),
      {
        uniformMap: {
          u_shadow: () => texture,
          u_uv: () => uv,
          u_depth: () => depth,
          u_eyeDepth: () => eyeDepth,
          u_gradient: () => gradient,
          shadowMap_cascadeSplits: () => splits,
          shadowMap_cascadeMatrices: () => matrices,
          sceneGIS_cascadeBias: () => new Cartesian4(0.01, 0.01, 0.01, 0.01),
        },
      },
    );
  }

  function draw() {
    command.execute(context);
    return context.readPixels()[0];
  }

  afterEach(function () {
    command?.shaderProgram.destroy();
    texture?.destroy();
    context?.destroyForSpecs();
    scene?.destroyForSpecs();
    command = texture = context = scene = undefined;
  });

  it("lights a sloped receiver without erasing a shallow occluder", function () {
    setup((u, v) => 0.2 + 0.4 * u + 0.3 * v, new Cartesian2(0.4, 0.3));
    depth = 0.2 + 0.4 * uv.x + 0.3 * uv.y;
    expect(draw()).toBe(255);
    // Move the receiver just behind the same sloped depth field.
    depth += 0.002;
    expect(draw()).toBe(0);
  });

  it("moves a soft edge continuously within one shadow texel", function () {
    setup((u) => (u < 0.25 ? 0.2 : 0.8));
    let previous;
    for (let i = 0; i <= 8; ++i) {
      uv.x = (3.5 + i / 8) / size;
      const value = draw();
      if (previous !== undefined) {
        expect(value).toBeGreaterThan(previous);
        expect(value - previous).toBeLessThan(20);
      }
      previous = value;
    }
  });

  it("keeps the filter inside its atlas tile", function () {
    setup((u, v) => (u < 0.5 && v < 0.5 ? 0.8 : 0.0));
    uv = new Cartesian2(0.499, 0.499);
    expect(draw()).toBe(255);
  });

  it("blends adjacent cascades through the overlap instead of switching abruptly", function () {
    setup((u) => (u < 0.5 ? 0.2 : 0.8), new Cartesian2(), true);
    eyeDepth = 9;
    expect(draw()).toBe(0);
    eyeDepth = 9.5;
    expect(draw()).toEqualEpsilon(128, 1);
    eyeDepth = 9.99;
    expect(draw()).toBeGreaterThan(254);
  });

  it("stabilizes globe cascades in ECEF and releases the shared atlas", async function () {
    scene = createScene();
    const frame = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(-75.596, 40.038),
    );
    scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(4, 4, 8),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.multiplyByTranslation(
            frame,
            new Cartesian3(0, 0, 4),
            new Matrix4(),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          closed: true,
        }),
        asynchronous: false,
        shadows: ShadowMode.ENABLED,
      }),
    );
    scene.camera.lookAtTransform(frame, new Cartesian3(0, -15, 20));
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
    scene.camera.frustum.near = 0.2;
    scene.camera.frustum.far = 1000;
    scene.light = new DirectionalLight({
      direction: Matrix4.multiplyByPointAsVector(
        frame,
        new Cartesian3(1, 0, -1),
        new Cartesian3(),
      ),
    });
    const shadow = scene.shadowMap;
    shadow.enabled = true;
    shadow.softShadows = true;
    shadow.size = 512;
    shadow.maximumDistance = 350;
    await pollToPromise(() => {
      scene.renderForSpecs();
      return shadow._sceneCamera.frustum.far < shadow.maximumDistance;
    });
    expect(shadow._sceneGISPlanar).toBe(false);
    const atlas = shadow._shadowMapTexture;
    const beforeSplits = shadow._cascadeSplits.map((split) =>
      Cartesian4.clone(split),
    );
    const widths = shadow._passes.map(
      (p) => p.camera.frustum.right - p.camera.frustum.left,
    );
    const point = Matrix4.getTranslation(frame, new Cartesian3());
    const before = shadow._passes.map((p) =>
      Matrix4.multiplyByPoint(
        p.camera.getViewProjection(),
        point,
        new Cartesian3(),
      ),
    );
    scene.camera.moveRight(0.13);
    scene.renderForSpecs();
    shadow._passes.forEach((p, i) => {
      const after = Matrix4.multiplyByPoint(
        p.camera.getViewProjection(),
        point,
        new Cartesian3(),
      );
      const dx = (after.x - before[i].x) * p.passState.viewport.width;
      const dy = (after.y - before[i].y) * p.passState.viewport.height;
      expect(dx).toEqualEpsilon(Math.round(dx), 1e-6);
      expect(dy).toEqualEpsilon(Math.round(dy), 1e-6);
    });
    scene.camera.lookRight(0.1);
    scene.renderForSpecs();
    shadow._passes.forEach((p, i) => {
      expect(p.camera.frustum.right - p.camera.frustum.left).toEqualEpsilon(
        widths[i],
        1e-8,
      );
    });
    expect(shadow._cascadeSplits).toEqual(beforeSplits);
    expect(shadow._shadowMapTexture).toBe(atlas);
    scene.destroyForSpecs();
    scene = undefined;
    expect(atlas.isDestroyed()).toBe(true);
  });
  it("tests delegated tile bounds against non-nested cascades and retains ordinary culling", function () {
    const makePass = (x) => ({
      commandList: [],
      cullingVolume: new CullingVolume([
        new Cartesian4(1, 0, 0, 1 - x),
        new Cartesian4(-1, 0, 0, 1 + x),
      ]),
    });
    const passes = [makePass(0), makePass(10), makePass(0), makePass(10)];
    const caster = {
      cull: false,
      owner: { content: { tile: {} } },
      boundingVolume: new BoundingSphere(Cartesian3.ZERO, 0.1),
    };
    expect(cascades.insertTileCaster(passes, caster)).toBe(true);
    expect(passes.map((p) => p.commandList.length)).toEqual([1, 0, 1, 0]);
    caster.owner = {};
    expect(cascades.insertTileCaster(passes, caster)).toBe(false);
  });
  it("culls real tile shadow commands per cascade without changing pixels", async function () {
    scene = createScene({ canvas: createCanvas(64, 64) });
    const tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        "./Data/Cesium3DTiles/Batched/BatchedWithTransformBox/tileset.json",
        {
          shadows: ShadowMode.ENABLED,
          maximumScreenSpaceError: 1,
          cullRequestsWhileMoving: false,
          environmentMapOptions: { enabled: false },
        },
      ),
    );
    const sphere = tileset.boundingSphere;
    scene.camera.viewBoundingSphere(
      sphere,
      new HeadingPitchRange(0, -0.7, sphere.radius * 6),
    );
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = sphere.radius * 100;
    scene.light = new DirectionalLight({
      direction: Cartesian3.normalize(
        Cartesian3.negate(sphere.center, new Cartesian3()),
        new Cartesian3(),
      ),
    });
    const shadow = scene.shadowMap;
    shadow.enabled = true;
    shadow.maximumDistance = sphere.radius * 20;
    shadow.size = 256;
    await pollToPromise(() => {
      scene.renderForSpecs();
      return (
        tileset.tilesLoaded &&
        scene.frameState.commandList.some((c) => c.owner?.content?.tile)
      );
    });
    for (const movement of [0, sphere.radius]) {
      scene.camera.moveRight(movement);
      scene.renderForSpecs();
      const casters = scene.frameState.commandList.filter(
        (c) => c.castShadows && c.owner?.content?.tile,
      );
      expect(casters.length).toBeGreaterThan(0);
      expect(casters.every((c) => c.cull === false)).toBe(true);
      for (const pass of shadow.passes) {
        const expected = casters.filter(
          (c) =>
            pass.cullingVolume.computeVisibility(c.boundingVolume) !==
            Intersect.OUTSIDE,
        );
        expect(pass.commandList).toEqual(expected);
      }
      expect(
        shadow.passes.reduce((sum, p) => sum + p.commandList.length, 0),
      ).toBeLessThan(casters.length * 4);
    }
    const pixels = scene.context.readPixels();
    const insertion = spyOn(cascades, "insertTileCaster").and.returnValue(
      false,
    );
    scene.renderForSpecs();
    expect(scene.context.readPixels()).toEqual(pixels);
    insertion.and.callThrough();
  });
});
