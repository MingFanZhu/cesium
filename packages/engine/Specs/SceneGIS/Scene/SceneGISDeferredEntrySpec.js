import {
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Matrix4,
  OrthographicFrustum,
  PerInstanceColorAppearance,
  Primitive,
  RuntimeError,
  SceneMode,
  SkyAtmosphere,
  SkyBox,
  Sun,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISDeferredEntry", function () {
  let scene;

  afterEach(function () {
    scene?.destroyForSpecs();
    scene = undefined;
  });

  it("owns a single-sample LDR renderer without caller setup", function () {
    scene = createScene({ canvas: createCanvas(32, 32) });
    const renderer = scene._sceneGISDeferred;
    expect(renderer).toBeDefined();
    expect(scene.msaaSamples).toBe(1);
    expect(scene.highDynamicRange).toBe(false);
    expect(scene._hdr).toBe(true);
    expect(renderer._raw).toBeUndefined();
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: new Cartesian3(0, 1, 0),
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 4,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
    const primitive = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(2, 2, 2),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          },
          id: "default-opaque",
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          flat: true,
        }),
      }),
    );
    scene.renderForSpecs();
    expect(renderer.ready).toBe(true);
    expect(renderer.drawCount).toBe(1);
    expect(renderer.lightDrawCount).toBe(1);
    expect(
      scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
    ).toEqualEpsilon([255, 0, 0, 255], 1);
    const material = renderer._raw.getColorTexture();
    expect(scene.pick(new Cartesian2(16, 16)).primitive).toBe(primitive);
    expect(renderer._raw.getColorTexture()).toBe(material);
    scene.destroyForSpecs();
    scene = undefined;
    expect(renderer.isDestroyed()).toBe(true);
    expect(material.isDestroyed()).toBe(true);
  });

  it("gates native atmosphere and sky resources without changing caller settings", function () {
    scene = createScene({ canvas: createCanvas(32, 32) });
    scene.camera.setView({
      destination: new Cartesian3(6379137, 0, 0),
      orientation: { direction: Cartesian3.UNIT_Y, up: Cartesian3.UNIT_X },
    });
    scene.skyAtmosphere = new SkyAtmosphere();
    scene.skyBox = new SkyBox({ sources: {} });
    scene.sun = new Sun();
    const atmosphere = spyOn(scene.skyAtmosphere, "update");
    const sky = spyOn(scene.skyBox, "update");
    const sun = spyOn(scene.sun, "update");
    scene.fog.enabled = true;
    scene.fog.renderable = true;
    scene.sunBloom = true;
    scene.renderForSpecs();
    expect(atmosphere).not.toHaveBeenCalled();
    expect(sky).not.toHaveBeenCalled();
    expect(sun).not.toHaveBeenCalled();
    expect(scene._sunPostProcess).toBeUndefined();
    expect(scene.frameState.fog.enabled).toBe(true);
    expect(scene.frameState.fog.renderable).toBe(false);
    expect(scene.fog.enabled).toBe(true);
    expect(scene.fog.renderable).toBe(true);
    expect(scene.sunBloom).toBe(true);
    expect(scene.skyAtmosphere.show).toBe(true);
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    expect(scene.context._gl.getError()).toBe(0);
  });

  [SceneMode.SCENE2D, SceneMode.COLUMBUS_VIEW].forEach((mode) => {
    it(`rejects empty unsupported mode ${mode} before drawing`, function () {
      scene = createScene();
      scene.mode = mode;
      const draw = spyOn(scene.context, "draw").and.callThrough();
      expect(() => scene.renderForSpecs()).toThrowDeveloperError();
      expect(draw).not.toHaveBeenCalled();
      expect(scene._sceneGISDeferred._raw).toBeUndefined();
    });
  });

  it("rejects a morph transition before main-frame drawing", function () {
    scene = createScene();
    scene.morphTo2D(1);
    const draw = spyOn(scene.context, "draw").and.callThrough();
    expect(() => scene.renderForSpecs()).toThrowDeveloperError();
    expect(draw).not.toHaveBeenCalled();
  });

  it("rejects WebVR before stereo rendering even without opaque contents", function () {
    scene = createScene();
    scene.useWebVR = true;
    const draw = spyOn(scene.context, "draw").and.callThrough();
    expect(() => scene.renderForSpecs()).toThrowDeveloperError();
    expect(draw).not.toHaveBeenCalled();
  });

  it("rejects WebGL1 without silently selecting a forward renderer", function () {
    scene = createScene({ contextOptions: { requestWebgl1: true } });
    expect(scene.context.webgl2).toBe(false);
    const draw = spyOn(scene.context, "draw").and.callThrough();
    expect(() => scene.renderForSpecs()).toThrowError(RuntimeError);
    expect(draw).not.toHaveBeenCalled();
    expect(scene._sceneGISDeferred._raw).toBeUndefined();
  });

  it("rejects explicit multisampling before allocating material targets", function () {
    scene = createScene({ msaaSamples: 4, canvas: createCanvas(32, 32) });
    const draw = spyOn(scene.context, "draw").and.callThrough();
    expect(() => scene.renderForSpecs()).toThrowDeveloperError();
    expect(scene.msaaSamples).toBe(4);
    expect(draw).not.toHaveBeenCalled();
    expect(scene._sceneGISDeferred._raw).toBeUndefined();
  });
});
